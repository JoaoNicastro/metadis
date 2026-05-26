import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { createImu } from './imu.js';
import { createGrab } from './grab.js';
import { createMultitap } from './multitap.js';

const METADIS_VERSION = '1.3';
const IMPULSE_PER_TAP = 2.5;
const SCALE_IMPULSE = 2.5;       // exponent units per tap; 1 tap ≈ 15-20% size change before damping
const SCALE_DAMPING = 0.985;     // matches rotation damping for consistent feel
const SCALE_EPSILON = 0.001;
const MIN_ZOOM = 0.1;            // 10% of fitted size
const MAX_ZOOM = 5;              // 5x fitted size
const MULTITAP_WINDOW_MS = 400;

// Scale-via-grab: 90° of wrist beta → 2x scale. Exponent form keeps it
// perceptually linear (each 90° doubles or halves regardless of starting size).
const SCALE_BETA_PER_DOUBLING = 90;

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
// existing 2D grab experience is what runs.
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
  const imu = createImu();
  const grab = createGrab({ getOrientation: () => imu.getReading() });

  setStatus('loading model...');
  const url = getModelUrl();
  try {
    await viewer.loadModel(url);
    setStatus(`mode: rotate · idle · ${getFilename(url)}`);
  } catch (err) {
    console.warn('failed to load model, showing fallback cube', err);
    try {
      viewer.loadFallbackCube();
      setStatus(`mode: rotate · idle · fallback (load failed)`);
    } catch (fbErr) {
      console.error('WebGL context unavailable', fbErr);
      setStatus('error: WebGL unavailable');
      return;
    }
  }

  const model = viewer.getModel();
  const baseScale = model ? model.scale.x : 1;

  // Two active modes for non-XR runtimes (cycle with single Back):
  //   rotate — default. Idle: swipes apply angular impulse. Grabbed: wrist→cube 1:1.
  //   scale  — Idle: ↑/↓ scale impulse, ←/→ reset. Grabbed: wrist beta → exp scale.
  //   explode — RESERVED for v1.4+. Kept out of the cycle until implemented.
  const MODE_CYCLE = ['rotate', 'scale'];
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;

  // Snapshots captured at the moment of grab so model.rotation/scale stay
  // continuous when grab releases and physics takes over.
  let baseRotation = null; // THREE.Euler or null
  let baseZoom = 1;

  // Damped: release with momentum → physics decelerates the cube to rest.
  // Frozen: release ignores velocity → cube freezes at current pose.
  // Toggled by double Escape.
  let physicsMode = 'damped';

  const params = new URLSearchParams(window.location.search);
  const imuParam = params.get('imu');
  if (imuParam !== 'off') {
    const ok = await imu.enable();
    if (ok) {
      console.info('IMU enabled — wrist orientation feeds grab.js');
      imu.setFastMode(true); // grab needs responsive readings, not jitter-filtering
    } else {
      console.warn('IMU unavailable on this platform');
    }
  }

  let inXR = false;
  const xr = await setupWebXR(viewer, {
    onSessionStart: () => {
      inXR = true;
      grab.reset();
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
      setStatus('AR · placed · pinch to grab; swipe to rotate');
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
    const grabTag = grab.isGrabbing() ? 'GRABBED' : 'idle';
    const phys = `physics:${physicsMode}`;
    if (mode === 'scale') return `mode: scale · ${grabTag} · ${phys} · ${zoomFactor.toFixed(2)}x`;
    return `mode: ${mode} · ${grabTag} · ${phys}`;
  }

  function refreshStatus() {
    setStatus(statusForMode());
  }

  function cycleMode() {
    // If currently grabbing, release first so we don't end up in a weird state.
    if (grab.isGrabbing()) {
      releaseGrab(grab.toggle());
    }
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
    mode = next;
    zoomVel = 0;
    physics.reset(null); // zero any leftover spin velocity, keep current rotation
    refreshStatus();
  }

  function togglePhysicsMode() {
    physicsMode = physicsMode === 'damped' ? 'frozen' : 'damped';
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
    // Double pinch-index = full reset: zero rotation, zoom, and any spin.
    const m = viewer.getModel();
    physics.reset(m);
    resetZoom();
    if (grab.isGrabbing()) grab.reset();
    refreshStatus();
  }

  function startGrab() {
    const m = viewer.getModel();
    if (!m) return;
    const r = grab.toggle();
    if (r.state !== 'grabbing') {
      // No IMU reading available — can't grab. Surface this in HUD.
      setStatus(`${statusForMode()} · grab failed: ${r.reason || 'unknown'}`);
      return;
    }
    // Snapshot current pose so applied delta layers on top instead of overwriting.
    baseRotation = m.rotation.clone();
    baseZoom = zoomFactor;
    // Zero any residual spin from physics so the grab feels like "catching" the cube.
    physics.reset(null);
    refreshStatus();
  }

  function releaseGrab(result) {
    // result is whatever grab.toggle() returned when going grabbing→idle.
    if (!result || result.state !== 'idle') return;
    if (mode === 'rotate' && physicsMode === 'damped' && result.angularVelocity) {
      const v = result.angularVelocity;
      physics.applyImpulse('x', v.x);
      physics.applyImpulse('y', v.y);
      physics.applyImpulse('z', v.z);
    }
    baseRotation = null;
    refreshStatus();
  }

  function onGrabToggle() {
    if (inXR) return; // XR session owns placement gestures
    if (!grab.isGrabbing()) {
      startGrab();
    } else {
      const r = grab.toggle();
      releaseGrab(r);
    }
  }

  const enterTap = createMultitap({
    windowMs: MULTITAP_WINDOW_MS,
    onSingle: onGrabToggle,
    onDouble: resetAll,
  });

  const escapeTap = createMultitap({
    windowMs: MULTITAP_WINDOW_MS,
    onSingle: cycleMode,
    onDouble: togglePhysicsMode,
  });

  const input = createInput({
    onLeft: () => {
      if (grab.isGrabbing()) return;
      if (mode === 'rotate') physics.applyImpulse('y', +IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
    },
    onRight: () => {
      if (grab.isGrabbing()) return;
      if (mode === 'rotate') physics.applyImpulse('y', -IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
    },
    onUp: () => {
      if (grab.isGrabbing()) return;
      if (mode === 'rotate') physics.applyImpulse('x', +IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(+SCALE_IMPULSE);
    },
    onDown: () => {
      if (grab.isGrabbing()) return;
      if (mode === 'rotate') physics.applyImpulse('x', -IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(-SCALE_IMPULSE);
    },
    onSelect: () => enterTap.tap(),
    onBack: () => escapeTap.tap(),
  });
  input.attach();

  let last = performance.now();

  function applyGrabbedRotate(m) {
    if (!baseRotation) return;
    const d = grab.getDeltaRotation();
    if (!d) return;
    m.rotation.set(baseRotation.x + d.x, baseRotation.y + d.y, baseRotation.z + d.z);
  }

  function applyGrabbedScale(m) {
    const dBeta = grab.getDeltaBeta();
    const factor = baseZoom * Math.pow(2, dBeta / SCALE_BETA_PER_DOUBLING);
    zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, factor));
    m.scale.setScalar(baseScale * zoomFactor);
  }

  function step(time, frame) {
    const now = time ?? performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const m = viewer.getModel();

    if (frame && xr) {
      xr.tick(frame);
      if (m) physics.step(dt, m);
    } else if (m) {
      // Feed the grab ring buffer regardless — costs nothing when idle.
      grab.tick(now);

      if (grab.isGrabbing()) {
        if (mode === 'rotate') applyGrabbedRotate(m);
        else if (mode === 'scale') applyGrabbedScale(m);
        // physics.step is suppressed while grabbing — wrist owns the model.
        // refreshStatus once a frame to update the GRABBED tag + zoom number live
        if (mode === 'scale') refreshStatus();
      } else {
        physics.step(dt, m);
        if (mode === 'scale' && (zoomVel !== 0 || zoomFactor !== 1)) {
          zoomFactor *= Math.exp(zoomVel * dt);
          zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomFactor));
          zoomVel *= SCALE_DAMPING;
          if (Math.abs(zoomVel) < SCALE_EPSILON) zoomVel = 0;
          m.scale.setScalar(baseScale * zoomFactor);
          refreshStatus();
        }
      }
    }
    viewer.render();
  }

  viewer.renderer.setAnimationLoop(step);

  window.addEventListener('pause', () => {
    viewer.renderer.setAnimationLoop(null);
    if (grab.isGrabbing()) grab.reset();
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
