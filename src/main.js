import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { createMultitap } from './multitap.js';
import { createHud } from './hud.js';
import { createMaterialStyler, DISPLAY_STYLES } from './materials.js';

const METADIS_VERSION = '1.7';
const IMPULSE_PER_TAP = 2.5;
const SCALE_IMPULSE = 2.5;       // exponent units per tap; 1 tap ≈ 15-20% size change before damping
const SCALE_DAMPING = 0.985;     // matches rotation damping for consistent feel
const SCALE_EPSILON = 0.001;
const MIN_ZOOM = 0.1;            // 10% of fitted size
const MAX_ZOOM = 5;              // 5x fitted size

// Translate mode (v1.6): swipes move the model on the X/Y plane (camera-relative).
// Clamp keeps it inside the 600x600 viewport. Unit = world space.
const TRANSLATE_PER_TAP = 0.15;
const MIN_TRANSLATE = -1.2;
const MAX_TRANSLATE = 1.2;

// Roll mode (v1.6): swipes rotate around the Z axis (the line of sight).
// ←/→ apply impulse, ↑ boosts in the current direction, ↓ brakes (zeroes z velocity).
const ROLL_IMPULSE = 2.5;
const ROLL_BOOST = 1.6;          // multiplier when ↑ taps mid-spin

// Snap mode (v1.6): each swipe instantly rotates by SNAP_STEP. No physics, no
// damping — for users who want predictable, repeatable orientation.
const SNAP_STEP = Math.PI / 4;   // 45° per swipe; 8 swipes complete a full turn

// Multitap window — shorter than v1.4's 400ms because all single-tap actions
// now go through the multitap path (reset is the single, cycle is the double),
// and 280ms feels snappier without sacrificing reliable double-tap detection.
// Triple-tap window is shorter (180ms) — it only matters after a 2nd tap has
// already landed, so the user is already mid-burst.
const MULTITAP_WINDOW_MS = 280;
const TRIPLE_WINDOW_MS = 180;

// Play mode (v1.7): glTF animation playback for rigged assets.
const PLAY_SPEED_STEP = 0.25;
const PLAY_SPEED_MAX = 3;

// localStorage keys.
const STYLE_KEY = 'metadis_style';
const ONBOARD_KEY = 'metadis_onboarded';

// What each swipe does in each mode — shown on the 4 HUD edge labels so the
// frozen gesture vocabulary is always self-documenting.
const ACTION_LABELS = {
  rotate: { up: 'tilt ↑', down: 'tilt ↓', left: 'spin ←', right: 'spin →' },
  scale: { up: 'bigger', down: 'smaller', left: 'reset', right: 'reset' },
  display: { up: 'next style', down: 'prev style', left: 'prev style', right: 'next style' },
  translate: { up: 'move ↑', down: 'move ↓', left: 'move ←', right: 'move →' },
  roll: { up: 'boost', down: 'brake', left: 'roll ←', right: 'roll →' },
  snap: { up: '+45° x', down: '−45° x', left: '−45° y', right: '+45° y' },
  play: { up: 'faster', down: 'slower', left: 'prev clip', right: 'next clip' },
};

function clamp(v, min, max) {
  if (v > max) return max;
  if (v < min) return min;
  return v;
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* localStorage may be blocked on-device */ }
}

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
  const hud = createHud(container);
  const styler = createMaterialStyler();

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
  const baseFitPosition = model ? model.position.clone() : new THREE.Vector3();

  // Active modes (cycle with double pinch index):
  //   rotate    — ←→ apply yaw impulse, ↑↓ apply pitch impulse. Damping.
  //   scale     — ↑↓ apply scale impulse, ←→ reset zoom.
  //   display   — cycle render style: solid → wireframe → x-ray glow → normals.
  //   translate — swipes shift model on X/Y; ←/→ = ∓X, ↑/↓ = ±Y. Clamped to viewport.
  //   roll      — ←/→ roll around Z, ↑ boost current spin, ↓ brake to stop.
  //   snap      — each swipe rotates instantly by 45° (no physics).
  //   play      — APPENDED only when the .glb ships animation clips; ←→ clip,
  //               ↑↓ speed (↓ to 0 = pause).
  // 'explode' slot reserved for a future model-aware partition mode.
  //
  // GESTURE NOTES (verified empirically on Meta Ray-Ban Display 2026-05-26):
  // - Pinch polegar+médio is intercepted by the system as 'back' navigation
  //   and DOES NOT deliver a KeyboardEvent (Escape) to the Web App.
  // - The 'onBack' handler is still wired in case a future firmware fixes
  //   this, but no controls depend on it.
  // - Pinch polegar+indicador (single + long press emit the same Enter; long
  //   press is cosmetic) is the only reliable discrete gesture for click.
  //   We use single/double/triple counts of this gesture (see enterTap).
  // - Swipes 4-direction deliver Arrow keys cleanly.
  //
  // IMU/DeviceOrientation is intentionally NOT wired into the model.
  // On the Meta Ray-Ban Display, DeviceOrientation reflects the HEAD (glasses
  // IMU), not the wrist. Native wrist tracking would require the Wearables
  // Device Access Toolkit (Swift/Kotlin), not Web Apps.
  const modeCycle = ['rotate', 'scale', 'display', 'translate', 'roll', 'snap'];
  if (viewer.getClips().length > 0) modeCycle.push('play');
  let mode = 'rotate';
  let zoomFactor = 1;
  let zoomVel = 0;
  let translateOffset = { x: 0, y: 0 };

  // Play-mode state (only meaningful when modeCycle includes 'play').
  let clipIndex = 0;
  let playSpeed = 1;
  let action = null;

  // Restore the display style the user left last time (persisted per device).
  const savedStyle = safeGet(STYLE_KEY);
  if (model && savedStyle && DISPLAY_STYLES.includes(savedStyle) && savedStyle !== 'solid') {
    styler.apply(model, savedStyle);
  }

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
        m.position.copy(baseFitPosition);
        m.position.x += translateOffset.x;
        m.position.y += translateOffset.y;
        m.scale.setScalar(baseScale * zoomFactor);
      }
      refreshStatus();
    },
  });

  function clipName() {
    const clips = viewer.getClips();
    if (!clips.length) return '—';
    const c = clips[clipIndex];
    return c && c.name ? c.name : `clip ${clipIndex + 1}`;
  }

  // Short mode-specific value shown in the HUD sub-line.
  function modeExtra() {
    if (mode === 'scale') return `${zoomFactor.toFixed(2)}x`;
    if (mode === 'display') return styler.getStyle();
    if (mode === 'translate') return `x${translateOffset.x.toFixed(1)} y${translateOffset.y.toFixed(1)}`;
    if (mode === 'play') return `${clipName()} · ${playSpeed === 0 ? 'paused' : playSpeed.toFixed(2) + 'x'}`;
    return physics.isContinuous() ? 'spin' : '';
  }

  function statusForMode() {
    if (inXR) return 'AR · placed';
    const phys = `physics:${physicsMode}`;
    const spin = physics.isContinuous() ? ' · spin' : '';
    const extra = modeExtra();
    return `mode: ${mode} · ${phys}${spin}${extra && mode !== 'rotate' ? ' · ' + extra : ''}`;
  }

  function refreshStatus() {
    setStatus(statusForMode());
    if (!inXR) {
      hud.setMode({
        name: mode,
        index: modeCycle.indexOf(mode),
        total: modeCycle.length,
        edges: ACTION_LABELS[mode] || {},
        extra: modeExtra(),
      });
    }
  }

  function cycleMode() {
    const next = modeCycle[(modeCycle.indexOf(mode) + 1) % modeCycle.length];
    mode = next;
    zoomVel = 0;
    if (mode === 'play' && !action) playClip(0);
    hud.flash();
    refreshStatus();
  }

  // display mode: step the render style and persist it for next launch.
  function cycleStyle(dir) {
    const m = viewer.getModel();
    if (!m) return;
    if (dir > 0) styler.next(m); else styler.prev(m);
    safeSet(STYLE_KEY, styler.getStyle());
    hud.flash();
    refreshStatus();
  }

  // play mode: drive the AnimationMixer built from the .glb clips.
  function playClip(i) {
    const clips = viewer.getClips();
    const mixer = viewer.getMixer();
    if (!clips.length || !mixer) return;
    clipIndex = ((i % clips.length) + clips.length) % clips.length;
    if (action) action.stop();
    action = mixer.clipAction(clips[clipIndex]);
    action.reset();
    action.timeScale = playSpeed;
    action.play();
    hud.flash();
    refreshStatus();
  }

  function setPlaySpeed(delta) {
    playSpeed = clamp(playSpeed + delta, 0, PLAY_SPEED_MAX);
    if (action) action.timeScale = playSpeed;
    hud.flash();
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

  function applyTranslate(axis, delta) {
    const m = viewer.getModel();
    if (!m) return;
    translateOffset[axis] = clamp(translateOffset[axis] + delta, MIN_TRANSLATE, MAX_TRANSLATE);
    m.position[axis] = baseFitPosition[axis] + translateOffset[axis];
    refreshStatus();
  }

  function resetTranslate() {
    const m = viewer.getModel();
    if (!m) return;
    translateOffset = { x: 0, y: 0 };
    m.position.copy(baseFitPosition);
  }

  function applySnap(axis, sign) {
    const m = viewer.getModel();
    if (!m) return;
    // Cancel any ongoing spin so the snap lands cleanly.
    physics.reset(null);
    m.rotation[axis] += SNAP_STEP * sign;
  }

  function applyRollImpulse(sign) {
    physics.applyImpulse('z', ROLL_IMPULSE * sign);
  }

  function boostRoll() {
    const vz = physics.getVelocity().z;
    if (vz === 0) {
      // No active spin — start one in the default direction.
      applyRollImpulse(+1);
      return;
    }
    // Multiply current Z velocity by ROLL_BOOST (preserve direction).
    const target = vz * ROLL_BOOST;
    physics.applyImpulse('z', target - vz);
  }

  function brakeRoll() {
    const v = physics.getVelocity();
    // Reset only Z, keep X/Y intact.
    physics.applyImpulse('z', -v.z);
  }

  function resetAll() {
    // Pinch index = reset everything: rotation, spin velocity, zoom, translate.
    physics.reset(viewer.getModel());
    resetZoom();
    resetTranslate();
    hud.flash();
    refreshStatus();
  }

  function toggleSpin() {
    // Triple-pinch index = toggle continuous spin (no damping).
    // Useful for "set it spinning and watch hands-free" once you tuned
    // the rotation via swipes.
    physics.toggleContinuous();
    hud.flash();
    refreshStatus();
  }

  // v1.6: pinch indicador (Enter) carries three actions via tap count.
  //   single Enter → reset all (after MULTITAP_WINDOW_MS)
  //   double Enter → cycle mode (after TRIPLE_WINDOW_MS — small latency to allow triple)
  //   triple Enter → toggle continuous spin (instant on 3rd tap)
  // Pinch médio (would-be Escape) is intercepted by the system as 'back' and
  // never lands here, so we can't use it.
  const enterTap = createMultitap({
    windowMs: MULTITAP_WINDOW_MS,
    tripleWindowMs: TRIPLE_WINDOW_MS,
    onSingle: resetAll,
    onDouble: cycleMode,
    onTriple: toggleSpin,
  });

  // First-run onboarding: show the gesture card until the user's first input,
  // then swallow that one gesture (so they don't accidentally fire an action)
  // and never show it again. ?tutorial=1 replays it regardless of the flag.
  const tutorialReplay = new URLSearchParams(window.location.search).get('tutorial') === '1';
  let onboarding = tutorialReplay || !safeGet(ONBOARD_KEY);
  if (onboarding) hud.showOnboard();
  function dismissOnboard() {
    if (!onboarding) return false;
    onboarding = false;
    hud.hideOnboard();
    safeSet(ONBOARD_KEY, '1');
    refreshStatus();
    return true; // tells the caller to swallow this gesture
  }

  const input = createInput({
    onLeft: () => {
      if (dismissOnboard()) return;
      if (mode === 'rotate') physics.applyImpulse('y', +IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
      else if (mode === 'display') cycleStyle(-1);
      else if (mode === 'translate') applyTranslate('x', -TRANSLATE_PER_TAP);
      else if (mode === 'roll') applyRollImpulse(+1);
      else if (mode === 'snap') applySnap('y', -1);
      else if (mode === 'play') playClip(clipIndex - 1);
    },
    onRight: () => {
      if (dismissOnboard()) return;
      if (mode === 'rotate') physics.applyImpulse('y', -IMPULSE_PER_TAP);
      else if (mode === 'scale') resetZoom();
      else if (mode === 'display') cycleStyle(+1);
      else if (mode === 'translate') applyTranslate('x', +TRANSLATE_PER_TAP);
      else if (mode === 'roll') applyRollImpulse(-1);
      else if (mode === 'snap') applySnap('y', +1);
      else if (mode === 'play') playClip(clipIndex + 1);
    },
    onUp: () => {
      if (dismissOnboard()) return;
      if (mode === 'rotate') physics.applyImpulse('x', +IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(+SCALE_IMPULSE);
      else if (mode === 'display') cycleStyle(+1);
      else if (mode === 'translate') applyTranslate('y', +TRANSLATE_PER_TAP);
      else if (mode === 'roll') boostRoll();
      else if (mode === 'snap') applySnap('x', +1);
      else if (mode === 'play') setPlaySpeed(+PLAY_SPEED_STEP);
    },
    onDown: () => {
      if (dismissOnboard()) return;
      if (mode === 'rotate') physics.applyImpulse('x', -IMPULSE_PER_TAP);
      else if (mode === 'scale') applyZoomImpulse(-SCALE_IMPULSE);
      else if (mode === 'display') cycleStyle(-1);
      else if (mode === 'translate') applyTranslate('y', -TRANSLATE_PER_TAP);
      else if (mode === 'roll') brakeRoll();
      else if (mode === 'snap') applySnap('x', -1);
      else if (mode === 'play') setPlaySpeed(-PLAY_SPEED_STEP);
    },
    onSelect: () => {
      if (dismissOnboard()) return;
      enterTap.tap();
    },
    // onBack is wired but does nothing — the system intercepts the pinch médio
    // (Escape) gesture before it can reach the Web App.
    onBack: () => {},
  });
  input.attach();
  refreshStatus(); // paint the HUD mode map on boot

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

    // Advance glTF animation (no-op when the model has no clips or is paused).
    viewer.updateMixer(dt);

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
