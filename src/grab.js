// Grab state machine — Iron Man-style "agarrar e mexer" mechanic.
//
// The user pinches once to grab. While grabbing, the cube's rotation/scale
// is driven 1:1 by the wrist orientation delta from the moment of grab.
// Pinches again to release. On release in rotate mode, the angular velocity
// computed over the last few samples becomes momentum (impulse for physics).
//
// API:
//   const g = createGrab({ getOrientation, now });
//   g.toggle() — flips idle↔grabbing. Returns:
//     { state: 'grabbing', baseOrientation: {alpha,beta,gamma} } on grab, or
//     { state: 'idle', angularVelocity: {x,y,z} (rad/s, three-convention) } on release.
//   g.getDeltaRotation() — radians since grab, mapped to three convention. null if idle.
//   g.getDeltaBeta() — degrees since grab on the beta axis (for scale mode).
//   g.tick(t) — push current orientation+timestamp into the ring buffer.
//   g.isGrabbing(), g.reset()
//
// Mapping wrist → three.js rotation axes:
//   alpha (compass yaw, around vertical) → rotation.y
//   beta  (pitch / forward-back tilt)    → rotation.x
//   gamma (roll / side-to-side)          → rotation.z
//
// Velocity is computed from the ring buffer: (last - first) / (t_last - t_first).
// Buffer size 5 ≈ 80ms of history at 60Hz — enough to filter jitter, short
// enough that intentional flicks register as their actual peak speed.

const DEG = Math.PI / 180;
const BUFFER_SIZE = 5;
const MIN_DT_FOR_VELOCITY = 0.01; // 10ms minimum to avoid divide-by-near-zero

function defaultNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createGrab({ getOrientation, now = defaultNow } = {}) {
  if (typeof getOrientation !== 'function') {
    throw new TypeError('createGrab requires getOrientation callback');
  }

  let grabbing = false;
  let zero = null; // pose at moment of grab
  const buffer = []; // ring buffer { t, alpha, beta, gamma }

  function pushSample(reading, t) {
    buffer.push({ t, alpha: reading.alpha, beta: reading.beta, gamma: reading.gamma });
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  }

  function angularVelocityFromBuffer() {
    // Convert wrist delta over the buffer's time span into rad/s, in three convention.
    // If we don't have enough history, return zero — no spurious momentum on quick taps.
    if (buffer.length < 2) return { x: 0, y: 0, z: 0 };
    const first = buffer[0];
    const last = buffer[buffer.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt < MIN_DT_FOR_VELOCITY) return { x: 0, y: 0, z: 0 };
    return {
      x: ((last.beta - first.beta) * DEG) / dt,   // pitch
      y: ((last.alpha - first.alpha) * DEG) / dt, // yaw
      z: ((last.gamma - first.gamma) * DEG) / dt, // roll
    };
  }

  return {
    toggle() {
      const reading = getOrientation();
      if (!grabbing) {
        // idle → grabbing. Snapshot pose as zero and clear history.
        if (!reading) return { state: 'idle', reason: 'no-orientation' };
        grabbing = true;
        zero = { alpha: reading.alpha, beta: reading.beta, gamma: reading.gamma };
        buffer.length = 0;
        pushSample(reading, now());
        return { state: 'grabbing', baseOrientation: { ...zero } };
      }
      // grabbing → idle. Compute exit velocity from the recent samples.
      const angularVelocity = angularVelocityFromBuffer();
      grabbing = false;
      zero = null;
      buffer.length = 0;
      return { state: 'idle', angularVelocity };
    },

    getDeltaRotation() {
      if (!grabbing || !zero) return null;
      const reading = getOrientation();
      if (!reading) return null;
      return {
        x: (reading.beta - zero.beta) * DEG,   // pitch
        y: (reading.alpha - zero.alpha) * DEG, // yaw
        z: (reading.gamma - zero.gamma) * DEG, // roll
      };
    },

    // Scale mode reads only beta and wants the value in degrees so it can
    // map exponentially without re-converting back to degrees.
    getDeltaBeta() {
      if (!grabbing || !zero) return 0;
      const reading = getOrientation();
      if (!reading) return 0;
      return reading.beta - zero.beta;
    },

    tick(t) {
      if (!grabbing) return;
      const reading = getOrientation();
      if (!reading) return;
      pushSample(reading, t ?? now());
    },

    isGrabbing() {
      return grabbing;
    },

    reset() {
      grabbing = false;
      zero = null;
      buffer.length = 0;
    },
  };
}
