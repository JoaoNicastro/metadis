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

  // Capture the auto-fit base scale so zoomFactor=1 means "fitted to view".
  const model = viewer.getModel();
  const baseScale = model ? model.scale.x : 1;

  // Three interaction modes (cycle with single Back):
  //   rotate — arrows = angular impulse; IMU bias applies to model; default.
  //   zoom   — Up/Down = scale impulse; Left/Right = reset zoom; IMU paused.
  //   anchor — fake 3DoF world-lock. Model freezes in space; head rotation
  //            moves the CAMERA (not the model), so the cube appears to stay
  //            "out there" while you look around. Effective range ~±25°
  //            before the cube slides past the FOV. Cannot anchor to real
  //            surfaces (the Ray-Ban Display has no depth sensor / SLAM).
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;
  const MODE_CYCLE = ['rotate', 'zoom', 'anchor'];
  const DEG = Math.PI / 180;

  // IMU: opt-out via ?imu=off. Smoothed + dead-zoned in src/imu.js so it no
  // longer drives the cube around when you're holding still.
  const params = new URLSearchParams(window.location.search);
  const imuParam = params.get('imu');
  if (imuParam !== 'off') {
    const ok = await imu.enable();
    if (ok) console.info('IMU enabled — wrist/head tilt → rotation bias (mode=rotate only)');
    else console.warn('IMU unavailable on this platform');
  }

  function statusForMode() {
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
    // Leaving anchor mode: snap camera back to its default look.
    if (mode === 'anchor' && next !== 'anchor') {
      viewer.camera.rotation.set(0, 0, 0);
    }
    mode = next;
    if (mode === 'zoom') {
      physics.reset(null); // zero rotational velocity (keep current rotation)
    } else if (mode === 'anchor') {
      // Recalibrate the IMU so "current head pose" becomes the world anchor
      // direction. The model + camera both center; user can look ±25° to
      // see the model "stay" in that direction.
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

  // Input handling — mode-aware. Each Neural Band gesture / equivalent key:
  //   left/right   rotate mode: yaw impulse           zoom mode: reset zoom
  //   up/down      rotate mode: pitch impulse         zoom mode: zoom in/out
  //   select       single: reset rotation+zoom        double: recalibrate IMU
  //   back         single: toggle rotate ↔ zoom       double: toggle IMU on/off
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
      if (imu.isEnabled()) {
        imu.disable();
      } else {
        imu.enable();
      }
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
      // anchor mode: swipes are no-ops; head movement does the work
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
  let animId = null;

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const m = viewer.getModel();
    if (m) {
      physics.step(dt, m);
      // IMU contribution depends on mode:
      //   rotate → applies to model rotation (head/wrist tilts the cube)
      //   zoom   → ignored (cube stays still while user scales)
      //   anchor → applies INVERSELY to camera (cube stays in world, view turns)
      if (mode === 'rotate') {
        imu.step(dt, m);
      } else if (mode === 'anchor') {
        const delta = imu.getDelta();
        if (delta) {
          // Camera yaws / pitches / rolls WITH the head so the model at the
          // origin appears to stay "out there" in world space. Signs picked
          // to feel natural: turn head left → cube slides right in view.
          viewer.camera.rotation.set(
            delta.beta * DEG,
            delta.alpha * DEG,
            delta.gamma * DEG,
            'YXZ',
          );
        }
      }

      // Zoom: log-space velocity so equal +/- taps cancel and the rate feels
      // exponential like the system volume knob. Damping matches rotation.
      if (zoomVel !== 0 || Math.abs(1 - zoomFactor / Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomFactor))) > 0) {
        zoomFactor *= Math.exp(zoomVel * dt);
        zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomFactor));
        zoomVel *= SCALE_DAMPING;
        if (Math.abs(zoomVel) < SCALE_EPSILON) zoomVel = 0;
        m.scale.setScalar(baseScale * zoomFactor);
        if (mode === 'zoom') refreshStatus();
      }
    }
    viewer.render();
    animId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (animId !== null) return;
    last = performance.now();
    animId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  startLoop();

  window.addEventListener('pause', () => { stopLoop(); setStatus('paused'); });
  window.addEventListener('resume', () => { startLoop(); refreshStatus(); });
  window.addEventListener('stop', () => { stopLoop(); setStatus('stopped'); });
}

boot();
