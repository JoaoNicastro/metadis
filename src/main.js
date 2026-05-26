import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { createImu } from './imu.js';

const IMPULSE_PER_TAP = 2.5;
const SCALE_IMPULSE = 2.5;       // exponent units per tap; 1 tap ≈ 15-20% size change before damping
const SCALE_DAMPING = 0.985;     // matches rotation damping for consistent feel
const SCALE_EPSILON = 0.001;
const MIN_ZOOM = 0.1;            // 10% of fitted size
const MAX_ZOOM = 5;              // 5x fitted size
const DOUBLE_TAP_MS = 400;
const DEG = Math.PI / 180;

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
// stereo cameras or depth sensor — so this code is a no-op there and the
// existing 3-mode 2D experience is what runs.
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

  // Hit-test reticle — a thin ring that snaps to detected surfaces.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  viewer.scene.add(reticle);

  // Three.js ARButton handles permission + session start/stop UI. We park
  // it in #xr-slot so the CSS rules style it consistently with the HUD.
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

    // 'select' fires when the user pinches / taps to place. Snap the model
    // to the reticle's world transform.
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
  const container = document.getElementById('app');
  if (!container) {
    setStatus('error: #app not found');
    return;
  }

  const viewer = createViewer(container);
  const physics = createPhysics();
  const imu = createImu();

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

  // Three interaction modes for non-XR runtimes (cycle with single Back):
  //   rotate — arrows = angular impulse; IMU bias applies to model; default.
  //   zoom   — Up/Down = scale impulse; Left/Right = reset zoom; IMU paused.
  //   anchor — fake 3DoF world-lock via camera rotation (no real placement).
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;
  const MODE_CYCLE = ['rotate', 'zoom', 'anchor'];

  const params = new URLSearchParams(window.location.search);
  const imuParam = params.get('imu');
  if (imuParam !== 'off') {
    const ok = await imu.enable();
    if (ok) console.info('IMU enabled — wrist/head tilt → rotation bias');
    else console.warn('IMU unavailable on this platform');
  }

  // Wire WebXR. The hooks let us react to AR session lifecycle: hide the HUD
  // chrome during AR (the real world is the background), place the model on
  // hit-test taps, restore on exit.
  let inXR = false;
  const xr = await setupWebXR(viewer, {
    onSessionStart: () => {
      inXR = true;
      setStatus('AR · tap a surface to place');
      // In AR the model stays at world origin until placed; visually shrink it
      // to a more "real-world size" appropriate for a placed object.
      const m = viewer.getModel();
      if (m) {
        m.scale.setScalar(baseScale * 0.2);
        m.position.set(0, 0, -0.5); // 50cm in front initially
      }
    },
    onPlace: (matrix) => {
      const m = viewer.getModel();
      if (!m) return;
      m.position.setFromMatrixPosition(matrix);
      setStatus('AR · placed · pinch to move; swipe to rotate');
    },
    onSessionEnd: () => {
      inXR = false;
      // Restore non-XR fitted view: reset position to origin and rescale.
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
    const m = `mode: ${mode}`;
    const imuTag = imu.isEnabled() ? '' : ' · imu:off';
    if (mode === 'zoom') return `${m}${imuTag} · ${zoomFactor.toFixed(2)}x`;
    if (mode === 'anchor') return `${m}${imuTag} · 3dof`;
    return `${m}${imuTag}`;
  }

  function refreshStatus() {
    setStatus(statusForMode());
  }

  function setMode(next) {
    if (mode === 'anchor' && next !== 'anchor') {
      viewer.camera.rotation.set(0, 0, 0);
    }
    mode = next;
    if (mode === 'zoom') {
      physics.reset(null);
    } else if (mode === 'anchor') {
      physics.reset(viewer.getModel());
      zoomVel = 0;
      if (imu.isEnabled()) imu.recalibrate();
      else imu.enable();
    } else {
      zoomVel = 0;
    }
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

  let lastEnter = 0;
  function onSelect() {
    const now = performance.now();
    if (now - lastEnter < DOUBLE_TAP_MS) {
      if (imu.isEnabled()) {
        imu.recalibrate();
        setStatus(`${statusForMode()} · imu recalibrated`);
      } else {
        imu.enable().then(ok => {
          setStatus(`${statusForMode()} · imu ${ok ? 'on' : 'unavailable'}`);
        });
      }
      lastEnter = 0;
      return;
    }
    lastEnter = now;
    physics.reset(viewer.getModel());
    resetZoom();
  }

  let lastBack = 0;
  function onBack() {
    const now = performance.now();
    if (now - lastBack < DOUBLE_TAP_MS) {
      if (imu.isEnabled()) imu.disable();
      else imu.enable();
      refreshStatus();
      lastBack = 0;
      return;
    }
    lastBack = now;
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
    setMode(next);
  }

  const input = createInput({
    onLeft: () => {
      if (mode === 'rotate') physics.applyImpulse('y', +IMPULSE_PER_TAP);
      else if (mode === 'zoom') resetZoom();
      else if (mode === 'anchor' && imu.isEnabled()) imu.recalibrate();
    },
    onRight: () => {
      if (mode === 'rotate') physics.applyImpulse('y', -IMPULSE_PER_TAP);
      else if (mode === 'zoom') resetZoom();
      else if (mode === 'anchor' && imu.isEnabled()) imu.recalibrate();
    },
    onUp: () => {
      if (mode === 'rotate') physics.applyImpulse('x', +IMPULSE_PER_TAP);
      else if (mode === 'zoom') applyZoomImpulse(+SCALE_IMPULSE);
    },
    onDown: () => {
      if (mode === 'rotate') physics.applyImpulse('x', -IMPULSE_PER_TAP);
      else if (mode === 'zoom') applyZoomImpulse(-SCALE_IMPULSE);
    },
    onSelect,
    onBack,
  });
  input.attach();

  let last = performance.now();

  function step(time, frame) {
    const now = time ?? performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const m = viewer.getModel();

    if (frame && xr) {
      // Real AR. The XR runtime drives the camera and provides world poses.
      // Hit-test the reticle every frame; placement happens on session select.
      xr.tick(frame);
      // Light rotation/scale interactions still work via existing input/physics
      // (e.g. swipes still spin the placed model), but anchor-mode camera
      // hack is suppressed — the headset owns the camera.
      if (m) physics.step(dt, m);
    } else {
      // Non-XR fallback. Original 3-mode logic.
      if (m) {
        physics.step(dt, m);
        if (mode === 'rotate') {
          imu.step(dt, m);
        } else if (mode === 'anchor') {
          const delta = imu.getDelta();
          if (delta) {
            viewer.camera.rotation.set(
              delta.beta * DEG,
              delta.alpha * DEG,
              delta.gamma * DEG,
              'YXZ',
            );
          }
        }
        if (zoomVel !== 0 || zoomFactor !== 1) {
          zoomFactor *= Math.exp(zoomVel * dt);
          zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomFactor));
          zoomVel *= SCALE_DAMPING;
          if (Math.abs(zoomVel) < SCALE_EPSILON) zoomVel = 0;
          m.scale.setScalar(baseScale * zoomFactor);
          if (mode === 'zoom') refreshStatus();
        }
      }
    }
    viewer.render();
  }

  // setAnimationLoop is the WebXR-compatible animation loop. In a regular
  // browser context it behaves like requestAnimationFrame; inside an XR
  // session it's driven by the XR compositor. Same callback, both modes.
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
