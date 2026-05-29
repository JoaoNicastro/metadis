// Display styles for the Meta Display's additive optics.
//
// On an additive (black = transparent) monocular panel, a normal lit
// MeshStandardMaterial fill reads as a dim grey blob — dark/mid tones fall
// below the visibility floor. Bright outlines and rim-glow on black are what
// the panel actually shows well. These styles turn any loaded .glb into a
// legible "hologram":
//   solid     — the model's original material(s) (restored verbatim)
//   wireframe — bright white wireframe (edges read as crisp bright lines)
//   xray      — additive Fresnel rim glow: faces toward the camera go dark
//               (transparent on the panel), grazing edges glow — looks like
//               a holographic shell
//   normals   — MeshNormalMaterial: bright, colorful, orientation-revealing
//
// All four cost ~0 KB — every material here is in core three (already bundled).

import * as THREE from 'three';

export const DISPLAY_STYLES = ['solid', 'wireframe', 'xray', 'normals'];

const XRAY_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const XRAY_FRAGMENT = `
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uColor;
  uniform float uPower;
  void main() {
    // Fresnel: 0 when facing the camera, →1 at grazing angles (silhouette).
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), uPower);
    // Premultiplied additive: bright rim, transparent center.
    gl_FragColor = vec4(uColor * fres, fres);
  }
`;

// Camera-facing-transparent, edge-bright shell. Additive blending makes it
// glow on the panel; depthWrite off so overlapping shells stack as glow.
export function createXrayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x66ddff) },
      uPower: { value: 2.2 },
    },
    vertexShader: XRAY_VERTEX,
    fragmentShader: XRAY_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Pure-ish material lifecycle helper. Disposes geometry, every material (and
// its textures), so swapping the loaded model doesn't leak GPU memory.
export function disposeObject(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key in m) {
        const val = m[key];
        if (val && val.isTexture && typeof val.dispose === 'function') val.dispose();
      }
      if (typeof m.dispose === 'function') m.dispose();
    }
  });
}

// Stateful styler over a single loaded model root. Stashes each mesh's
// original material on first touch so 'solid' restores the real look exactly.
export function createMaterialStyler() {
  let style = 'solid';
  let shared = null; // the one style-material currently applied to all meshes

  function stashOriginals(root) {
    root.traverse((o) => {
      if (o.isMesh && o.userData.__origMat === undefined) {
        o.userData.__origMat = o.material;
      }
    });
  }

  function disposeShared() {
    if (shared && typeof shared.dispose === 'function') shared.dispose();
    shared = null;
  }

  function makeShared(next) {
    if (next === 'wireframe') return new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    if (next === 'normals') return new THREE.MeshNormalMaterial();
    if (next === 'xray') return createXrayMaterial();
    return null;
  }

  function apply(root, next) {
    if (!root || !DISPLAY_STYLES.includes(next)) return style;
    stashOriginals(root);
    disposeShared();
    if (next === 'solid') {
      root.traverse((o) => {
        if (o.isMesh && o.userData.__origMat !== undefined) o.material = o.userData.__origMat;
      });
    } else {
      shared = makeShared(next);
      root.traverse((o) => { if (o.isMesh) o.material = shared; });
    }
    style = next;
    return style;
  }

  function step(root, dir) {
    const i = DISPLAY_STYLES.indexOf(style);
    const n = (i + dir + DISPLAY_STYLES.length) % DISPLAY_STYLES.length;
    return apply(root, DISPLAY_STYLES[n]);
  }

  return {
    getStyle: () => style,
    apply,
    next: (root) => step(root, +1),
    prev: (root) => step(root, -1),
    dispose: disposeShared,
  };
}
