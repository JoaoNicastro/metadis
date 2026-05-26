import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { createMultitap } from './multitap.js';

const METADIS_VERSION = '1.5';
const IMPULSE_PER_TAP = 2.5;
const SCALE_IMPULSE = 2.5;       // exponent units per tap; 1 tap ≈ 15-20% size change before damping
const SCALE_DAMPING = 0.985;     // matches rotation damping for consistent feel
const SCALE_EPSILON = 0.001;
const MIN_ZOOM = 0.1;            // 10% of fitted size
const MAX_ZOOM = 5;              // 5x fitted size

// Multitap window — shorter than v1.4's 400ms because all single-tap actions
// now go through the multitap path (reset is the single, cycle is the double),
// and 280ms feels snappier without sacrificing reliable double-tap detection.
const MULTITAP_WINDOW_MS = 280;

function getModelUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('model');
  return url || `${import.meta.env.BASE_URL}fallback.glb`;
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function getFilename(url) {
  try {
    return new URL(url, window.location.href).pathname.split('/').pop() || url;
  } catch {
    return url.split('/').pop().split('?')[0];
  }
}

// WebXR — Meta's recommended stack for spatial / mixed reality (used on Quest
// browser, Vision Pro, and other XR-capable runtimes). On a device that
// exposes navigator.xr with 'immersive-ar' support we boot a real 6DoF
// session with hit-test for surface placement. The Meta Ray-Ban Display
// runtime as of 2026-05 does NOT expose navigator.xr — the device has no
// stereo cameras or depth sensor — so this code is a no-op there.
async function setupWebXR(viewer, hooks) {
  if (typeof navigator === 'undefined' || !('xr' in navigator)) {
    console.info('WebXR not available on this runtime — falling back to 2D modes');
    return null;
  }
  let supported = false;
  try {
    supported = await navigator.xr.isSessionSupported('immersive-ar');
  } catch (e) {
    console.info('WebXR isSessionSupported threw', e);
    return null;
  }
  if (!supported) {
    console.info('WebXR immersive-ar not supported — falling back to 2D modes');
    return null;
  }

  console.info('WebXR immersive-ar supported — wiring AR button + hit-test');
  viewer.renderer.xr.enabled = true;

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  viewer.scene.add(reticle);

  const slot = document.getElementById('xr-slot');
  const button = ARButton.createButton(viewer.renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'plane-detection'],
    domOverlay: { root: document.getElementById('app') },
  });
  button.textContent = 'Enter AR';
  if (slot) slot.appendChild(button); else document.body.appendChild(button);

  let hitTestSource = null;
  let hitTestRefSpace = null;

  viewer.renderer.xr.addEventListener('sessionstart', async () => {
    const session = viewer.renderer.xr.getSession();
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitTestRefSpace = await session.requestReferenceSpace('local');
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      console.info('XR hit-test source ready');
      hooks.onSessionStart();
    } catch (e) {
      console.warn('hit-test setup failed', e);
    }
    session.addEventListener('select', () => {
      if (!reticle.visible) return;
      hooks.onPlace(reticle.matrix);
    });
  });

  viewer.renderer.xr.addEventListener('sessionend', () => {
    hitTestSource = null;
    hitTestRefSpace = null;
    reticle.visible = false;
    hooks.onSessionEnd();
  });

  return {
    reticle,
    isActive: () => hitTestSource != null,
    tick(frame) {
      if (!hitTestSource || !hitTestRefSpace) return;
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length === 0) {
        reticle.visible = false;
        return;
      }
      const pose = hits[0].getPose(hitTestRefSpace);
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.visible = true;
    },
  };
}

async function boot() {
  console.info(`metadis v${METADIS_VERSION} — build ${new Date().toISOString().slice(0, 16)} UTC`);
  const container = document.getElementById('app');
  if (!container) {
    setStatus('error: #app not found');
    return;
  }

  const viewer = createViewer(container);
  const physics = createPhysics();

  setStatus('loading model...');
  const url = getModelUrl();
  try {
    await viewer.loadModel(url);
    setStatus(`mode: rotate · ${getFilename(url)}`);
  } catch (err) {
    console.warn('failed to load model, showing fallback cube', err);
    try {
      viewer.loadFallbackCube();
      setStatus(`mode: rotate · fallback (load failed)`);
    } catch (fbErr) {
      console.error('WebGL context unavailable', fbErr);
      setStatus('error: WebGL unavailable');
      return;
    }
  }

  const model = viewer.getModel();
  const baseScale = model ? model.scale.x : 1;

  // Two active modes (cycle with double pinch index):
  //   rotate — ←→ apply yaw impulse, ↑↓ apply pitch impulse. Damping decelerates.
  //   scale  — ↑↓ apply scale impulse, ←→ reset zoom.
  // 'explode' slot reserved for a future model-aware partition mode (v2+).
  //
  // GESTURE NOTES (verified empirically on Meta Ray-Ban Display 2026-05-26):
  // - Pinch polegar+médio is intercepted by the system as 'back' navigation
  //   and DOES NOT deliver a KeyboardEvent (Escape) to the Web App.
  // - The 'onBack' handler is still wired in case a future firmware fixes
  //   this, but no controls depend on it in v1.5.
  // - Pinch polegar+indicador (single + long press emit the same Enter; long
  //   press is cosmetic) is the only reliable discrete gesture for click.
  // - Swipes 4-direction deliver Arrow keys cleanly.
  //
  // IMU/DeviceOrientation is intentionally NOT wired into the model.
  // On the Meta Ray-Ban Display, DeviceOrientation reflects the HEAD (glasses
  // IMU), not the wrist. Native wrist tracking would require the Wearables
  // Device Access Toolkit (Swift/Kotlin), not Web Apps.
  const MODE_CYCLE = ['rotate', 'scale'];
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;

  // Damped: applyImpulse + physics.step damp → cube decelerates to rest.
  // Frozen: every step zeroes velocity → cube stops on each impulse end.
  // Default damped. Override via URL param `?physics=frozen`.
  const physicsParam = new URLSearchParams(window.location.search).get('physics');
  let physicsMode = physicsParam === 'frozen' ? 'frozen' : 'damped';

  let inXR = false;
  const xr = await setupWebXR(viewer, {
    onSessionStart: () => {
      inXR = true;
      setStatus('AR · tap a surface to place');
      const m = viewer.getModel();
      if (m) {
        m.scale.setScalar(baseScale * 0.2);
        m.position.set(0, 0, -0.5);
      }
    },
    onPlace: (matrix) => {
      const m = viewer.getModel();
      if (!m) return;
      m.position.setFromMatrixPosition(matrix);
      setStatus('AR · placed · swipe to rotate');
    },
    onSessionEnd: () => {
      inXR = false;
      const m = viewer.getModel();
      if (m) {
        m.position.set(0, 0, 0);
        m.scale.setScalar(baseScale * zoomFactor);
      }
      refreshStatus();
    },
  });

  function statusForMode() {
    if (inXR) return 'AR · placed';
    const phys = `physics:${physicsMode}`;
    if (mode === 'scale') return `mode: scale · ${phys} · ${zoomFactor.toFixed(2)}x`;
    return `mode: ${mode} · ${phys}`;
  }

  function refreshStatus() {
    setStatus(statusForMode());
  }

  function cycleMode() {
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
    mode = next;
    zoomVel = 0;
    refreshStatus();
  }

  function applyZoomImpulse(delta) {
    zoomVel += delta;
  }

  function resetZoom() {
    zoomFactor = 1;
    zoomVel = 0;
    if (model) model.scale.setScalar(baseScale);
    refreshStatus();
  }

  function resetAll() {
    // Pinch index = reset everything: rotation, spin velocity, zoom.
    physics.reset(viewer.getModel());
    resetZoom();
    refreshStatus();
  }

  // v1.5: only the pinch index gesture (Enter) reaches the Web App reliably.
  // Pinch médio (would-be Escape) is intercepted by the system as 'back'
  // and never lands here. So both reset and mode-cycle live on Enter:
  //   single Enter → reset all (after MULTITAP_WINDOW_MS to disambiguate)
  //   double Enter → cycle mode (instant, fires on 2nd tap)
  const enterTap = createMultitap({
    windowMs: MULTITAP_WINDOW_MS,
    onSingle: resetAll,
    onDouble: cycleMode,
  });

  const input = createInput({
    onLeft: () => {
      if (mode === 'rotate') physics.applyImpulse('y', +IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
    },
    onRight: () => {
      if (mode === 'rotate') physics.applyImpulse('y', -IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
    },
    onUp: () => {
      if (mode === 'rotate') physics.applyImpulse('x', +IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(+SCALE_IMPULSE);
    },
    onDown: () => {
      if (mode === 'rotate') physics.applyImpulse('x', -IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(-SCALE_IMPULSE);
    },
    onSelect: () => enterTap.tap(),
    // onBack is wired but does nothing in v1.5 — the system intercepts the
    // pinch médio (Escape) gesture before it can reach the Web App.
    onBack: () => {},
  });
  input.attach();

  let last = performance.now();

  function applyPhysics(dt, m) {
    if (physicsMode === 'frozen') {
      // Frozen mode: apply impulse-driven rotation but zero velocity each
      // frame so the cube stops the moment input stops. Predictable, no
      // momentum carry.
      physics.step(dt, m);
      physics.reset(null);
    } else {
      physics.step(dt, m);
    }
  }

  function step(time, frame) {
    const now = time ?? performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const m = viewer.getModel();

    if (frame && xr) {
      xr.tick(frame);
      if (m) applyPhysics(dt, m);
    } else if (m) {
      applyPhysics(dt, m);
      if (mode === 'scale' && (zoomVel !== 0 || zoomFactor !== 1)) {
        zoomFactor *= Math.exp(zoomVel * dt);
        zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomFactor));
        zoomVel *= SCALE_DAMPING;
        if (Math.abs(zoomVel) < SCALE_EPSILON) zoomVel = 0;
        m.scale.setScalar(baseScale * zoomFactor);
        refreshStatus();
      }
    }
    viewer.render();
  }

  viewer.renderer.setAnimationLoop(step);

  window.addEventListener('pause', () => {
    viewer.renderer.setAnimationLoop(null);
    setStatus('paused');
  });
  window.addEventListener('resume', () => {
    last = performance.now();
    viewer.renderer.setAnimationLoop(step);
    refreshStatus();
  });
  window.addEventListener('stop', () => {
    viewer.renderer.setAnimationLoop(null);
    setStatus('stopped');
  });
}

boot();
