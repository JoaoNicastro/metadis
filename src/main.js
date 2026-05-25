import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';

const IMPULSE_PER_TAP = 2.5;

function getModelUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('model');
  return url || '/fallback.glb';
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

  const input = createInput({
    onLeft: () => physics.applyImpulse('y', +IMPULSE_PER_TAP),
    onRight: () => physics.applyImpulse('y', -IMPULSE_PER_TAP),
    onUp: () => physics.applyImpulse('x', +IMPULSE_PER_TAP),
    onDown: () => physics.applyImpulse('x', -IMPULSE_PER_TAP),
    onSelect: () => physics.reset(viewer.getModel()),
    onBack: () => {
      const continuous = physics.toggleContinuous();
      setStatus(`spin: ${continuous ? 'continuous' : 'damped'}`);
    },
  });
  input.attach();

  let last = performance.now();
  let animId = null;

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const model = viewer.getModel();
    if (model) physics.step(dt, model);
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
