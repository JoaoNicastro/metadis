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

  // Two interaction modes:
  //   rotate — arrows = angular impulse; IMU bias also applies; default.
  //   zoom   — Up/Down = scale impulse; Left/Right = reset zoom; IMU paused.
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;

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
    return mode === 'zoom'
      ? `${m}${imuTag} · ${zoomFactor.toFixed(2)}x`
      : `${m}${imuTag}`;
  }

  function refreshStatus() {
    setStatus(statusForMode());
  }

  function setMode(next) {
    mode = next;
    if (mode === 'zoom') {
      // Stop any rotational momentum so zoom feels clean (visual stillness).
      physics.reset(null); // zero velocity but keep current rotation
    } else {
      // Returning to rotate: keep current zoom in place; user can reset later.
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
    setMode(mode === 'rotate' ? 'zoom' : 'rotate');
  }

  const input = createInput({
    onLeft: () => {
      if (mode === 'rotate') physics.applyImpulse('y', +IMPULSE_PER_TAP);
      else resetZoom();
    },
    onRight: () => {
      if (mode === 'rotate') physics.applyImpulse('y', -IMPULSE_PER_TAP);
      else resetZoom();
    },
    onUp: () => {
      if (mode === 'rotate') physics.applyImpulse('x', +IMPULSE_PER_TAP);
      else applyZoomImpulse(+SCALE_IMPULSE);
    },
    onDown: () => {
      if (mode === 'rotate') physics.applyImpulse('x', -IMPULSE_PER_TAP);
      else applyZoomImpulse(-SCALE_IMPULSE);
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
      // IMU only contributes in rotate mode; in zoom mode the cube freezes
      // visually so the user can focus on the scale gesture without drift.
      if (mode === 'rotate') imu.step(dt, m);

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
