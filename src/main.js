import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { createImu } from './imu.js';

const IMPULSE_PER_TAP = 2.5;
const DOUBLE_TAP_MS = 400;

function getQueryFlag(name) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v != null && v !== 'false' && v !== '0';
}

function getModelUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('model');
  // Use Vite's BASE_URL so the fallback path resolves correctly on a
  // subpath deploy (e.g. https://user.github.io/metadis/fallback.glb).
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
    setStatus(`model: ${getFilename(url)}`);
  } catch (err) {
    console.warn('failed to load model, showing fallback cube', err);
    try {
      viewer.loadFallbackCube();
      setStatus(`fallback (failed: ${getFilename(url)})`);
    } catch (fbErr) {
      console.error('WebGL context unavailable', fbErr);
      setStatus('error: WebGL unavailable');
      return;
    }
  }

  // Enable head IMU by default unless ?imu=off. The Meta Display Web App
  // runtime doesn't expose Neural Band's twist gesture (system-reserved for
  // volume), so head tilt is the closest continuous-control equivalent.
  const imuEnabledByQuery = !getQueryFlag('imu') || (new URLSearchParams(window.location.search).get('imu') !== 'off');
  let imuOn = false;
  if (imuEnabledByQuery) {
    imuOn = await imu.enable();
    if (imuOn) console.info('IMU enabled — head tilt → model rotation');
    else console.warn('IMU unavailable on this platform');
  }

  // Detect double-pinch on Enter for IMU recalibrate (snap head-zero to
  // current pose). Single Enter still resets physics rotation+velocity.
  let lastEnter = 0;
  function onSelect() {
    const now = performance.now();
    if (now - lastEnter < DOUBLE_TAP_MS) {
      // Double-pinch: recalibrate IMU zero or toggle IMU if not enabled.
      if (imu.isEnabled()) {
        imu.recalibrate();
        setStatus('imu: recalibrated');
      } else {
        imu.enable().then(ok => {
          imuOn = ok;
          setStatus(`imu: ${ok ? 'on' : 'unavailable'}`);
        });
      }
      lastEnter = 0; // consume — don't also trigger reset
      return;
    }
    lastEnter = now;
    physics.reset(viewer.getModel());
  }

  // Detect double-back to toggle IMU off (in case user is getting dizzy).
  let lastBack = 0;
  function onBack() {
    const now = performance.now();
    if (now - lastBack < DOUBLE_TAP_MS) {
      // Double-back: toggle IMU.
      if (imu.isEnabled()) {
        imu.disable();
        setStatus('imu: off');
      } else {
        imu.enable().then(ok => {
          setStatus(`imu: ${ok ? 'on' : 'unavailable'}`);
        });
      }
      lastBack = 0;
      return;
    }
    lastBack = now;
    const continuous = physics.toggleContinuous();
    setStatus(`spin: ${continuous ? 'continuous' : 'damped'}`);
  }

  const input = createInput({
    onLeft: () => physics.applyImpulse('y', +IMPULSE_PER_TAP),
    onRight: () => physics.applyImpulse('y', -IMPULSE_PER_TAP),
    onUp: () => physics.applyImpulse('x', +IMPULSE_PER_TAP),
    onDown: () => physics.applyImpulse('x', -IMPULSE_PER_TAP),
    onSelect,
    onBack,
  });
  input.attach();

  let last = performance.now();
  let animId = null;

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const model = viewer.getModel();
    if (model) {
      physics.step(dt, model);
      imu.step(dt, model);
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

  window.addEventListener('pause', () => {
    stopLoop();
    setStatus('paused');
  });
  window.addEventListener('resume', () => {
    startLoop();
    setStatus('resumed');
  });
  window.addEventListener('stop', () => {
    stopLoop();
    setStatus('stopped');
  });
}

boot();
