import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  DISPLAY_STYLES,
  createXrayMaterial,
  createMaterialStyler,
  disposeObject,
} from '../src/materials.js';

function makeRoot() {
  const root = new THREE.Group();
  const m1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x123456 }));
  const m2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshStandardMaterial({ color: 0x654321 }));
  root.add(m1, m2);
  return { root, m1, m2 };
}

describe('DISPLAY_STYLES', () => {
  it('has the four styles in the documented order', () => {
    expect(DISPLAY_STYLES).toEqual(['solid', 'wireframe', 'xray', 'normals']);
  });
});

describe('createXrayMaterial', () => {
  it('is an additive, transparent, depth-write-off ShaderMaterial', () => {
    const m = createXrayMaterial();
    expect(m.isShaderMaterial).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect(m.uniforms.uColor).toBeDefined();
    expect(m.uniforms.uPower.value).toBeGreaterThan(0);
  });
});

describe('createMaterialStyler', () => {
  it('starts in solid', () => {
    const styler = createMaterialStyler();
    expect(styler.getStyle()).toBe('solid');
  });

  it('apply(wireframe) swaps every mesh to one shared wireframe MeshBasicMaterial', () => {
    const { root, m1, m2 } = makeRoot();
    const styler = createMaterialStyler();
    styler.apply(root, 'wireframe');
    expect(styler.getStyle()).toBe('wireframe');
    expect(m1.material.isMeshBasicMaterial).toBe(true);
    expect(m1.material.wireframe).toBe(true);
    expect(m1.material).toBe(m2.material); // shared instance
  });

  it('apply(solid) restores each mesh original material exactly', () => {
    const { root, m1, m2 } = makeRoot();
    const orig1 = m1.material;
    const orig2 = m2.material;
    const styler = createMaterialStyler();
    styler.apply(root, 'normals');
    expect(m1.material.isMeshNormalMaterial).toBe(true);
    styler.apply(root, 'solid');
    expect(m1.material).toBe(orig1);
    expect(m2.material).toBe(orig2);
  });

  it('apply(xray) uses the additive Fresnel shader', () => {
    const { root, m1 } = makeRoot();
    const styler = createMaterialStyler();
    styler.apply(root, 'xray');
    expect(m1.material.isShaderMaterial).toBe(true);
    expect(m1.material.blending).toBe(THREE.AdditiveBlending);
  });

  it('disposes the previous shared material when switching styles', () => {
    const { root, m1 } = makeRoot();
    const styler = createMaterialStyler();
    styler.apply(root, 'wireframe');
    const wire = m1.material;
    const spy = vi.spyOn(wire, 'dispose');
    styler.apply(root, 'normals');
    expect(spy).toHaveBeenCalled();
  });

  it('next/prev cycle through DISPLAY_STYLES with wraparound', () => {
    const { root } = makeRoot();
    const styler = createMaterialStyler();
    expect(styler.next(root)).toBe('wireframe');
    expect(styler.next(root)).toBe('xray');
    expect(styler.next(root)).toBe('normals');
    expect(styler.next(root)).toBe('solid'); // wrap
    expect(styler.prev(root)).toBe('normals'); // wrap back
  });

  it('apply with an unknown style is a no-op and keeps current style', () => {
    const { root, m1 } = makeRoot();
    const styler = createMaterialStyler();
    styler.apply(root, 'wireframe');
    const before = m1.material;
    expect(styler.apply(root, 'bogus')).toBe('wireframe');
    expect(m1.material).toBe(before);
  });

  it('does not throw when root is null', () => {
    const styler = createMaterialStyler();
    expect(() => styler.apply(null, 'wireframe')).not.toThrow();
    expect(styler.getStyle()).toBe('solid');
  });
});

describe('disposeObject', () => {
  it('disposes geometry and material of every mesh in the tree', () => {
    const { root, m1, m2 } = makeRoot();
    const g1 = vi.spyOn(m1.geometry, 'dispose');
    const mat1 = vi.spyOn(m1.material, 'dispose');
    const g2 = vi.spyOn(m2.geometry, 'dispose');
    disposeObject(root);
    expect(g1).toHaveBeenCalled();
    expect(mat1).toHaveBeenCalled();
    expect(g2).toHaveBeenCalled();
  });

  it('disposes textures referenced by materials', () => {
    const root = new THREE.Group();
    const tex = new THREE.Texture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex }));
    root.add(mesh);
    const texSpy = vi.spyOn(tex, 'dispose');
    disposeObject(root);
    expect(texSpy).toHaveBeenCalled();
  });

  it('handles an array of materials on one mesh', () => {
    const root = new THREE.Group();
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [a, b]);
    root.add(mesh);
    const sa = vi.spyOn(a, 'dispose');
    const sb = vi.spyOn(b, 'dispose');
    disposeObject(root);
    expect(sa).toHaveBeenCalled();
    expect(sb).toHaveBeenCalled();
  });

  it('does not throw on null or a non-traversable value', () => {
    expect(() => disposeObject(null)).not.toThrow();
    expect(() => disposeObject({})).not.toThrow();
  });
});
