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
    setStatus(`model: ${url.split('/').pop()}`);
  } catch (err) {
    console.warn('failed to load model, showing fallback cube', err);
    viewer.loadFallbackCube();
    setStatus(`fallback (failed: ${url.split('/').pop()})`);
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
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const model = viewer.getModel();
    if (model) physics.step(dt, model);
    viewer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener('pause', () => setStatus('paused'));
  window.addEventListener('resume', () => setStatus('resumed'));
}

boot();
