// Wrist / head IMU tilt → continuous model rotation bias.
//
// The Meta Display does NOT expose the Neural Band's twist gesture (pinça +
// rotação do pulso) to web apps — it's reserved for system volume. The
// closest continuous-control equivalent the platform exposes is the IMU
// via DeviceOrientation. On Meta Display this empirically reflects the
// wrist (Neural Band), not the head.
//
// Output:
//   step(dt, object3D) — additively rotates the object based on current
//   smoothed delta from the calibrated zero.
//
// Smoothing pipeline (avoids the "constantly jittery" problem):
//   1. Raw event reading → exponential moving average (EMA) at SMOOTHING_ALPHA.
//   2. EMA → delta from zero pose.
//   3. Delta → dead-zone cut (no movement below DEAD_ZONE_DEG).
//   4. Cut delta → gain → rotation per second.
//
// Calibration:
//   The first valid reading becomes zero. recalibrate() snaps zero to the
//   currently-smoothed reading.
//
// Permission:
//   iOS / Safari gate DeviceOrientation behind requestPermission(). We
//   call it on enable() if available; otherwise we just attach the listener.

const DEG = Math.PI / 180;

// How much the smoothed value moves toward each new raw reading per event.
// 0.15 = ~85% retention; new readings have to be consistent to win.
const SMOOTHING_ALPHA = 0.15;

// Dead zone (degrees). Below this, no rotation. Big enough to swallow
// wrist micro-tremor and IMU noise at rest. Set high — these wrist IMUs
// drift more than head IMUs.
const DEAD_ZONE_DEG = 8;

// Rotation rate per "active degree" beyond dead zone. 0.6 is gentle; raise
// for more responsiveness, lower if it still feels jumpy.
const TILT_GAIN = 0.6;

export function createImu() {
  let enabled = false;
  let zero = null;     // { alpha, beta, gamma } — calibrated reference
  let smoothed = null; // EMA of recent readings
  let latestRaw = null;

  function applyDeadZone(deg) {
    if (Math.abs(deg) < DEAD_ZONE_DEG) return 0;
    return deg - Math.sign(deg) * DEAD_ZONE_DEG;
  }

  function emaUpdate(prev, next) {
    if (prev == null) return next;
    return {
      alpha: prev.alpha + SMOOTHING_ALPHA * (next.alpha - prev.alpha),
      beta: prev.beta + SMOOTHING_ALPHA * (next.beta - prev.beta),
      gamma: prev.gamma + SMOOTHING_ALPHA * (next.gamma - prev.gamma),
    };
  }

  function onOrientation(event) {
    if (event.alpha == null && event.beta == null && event.gamma == null) return;
    const reading = {
      alpha: event.alpha ?? 0,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
    };
    latestRaw = reading;
    smoothed = emaUpdate(smoothed, reading);
    if (!zero) zero = { ...smoothed };
  }

  async function enable() {
    if (enabled) return true;
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return false;
    }
    const RequestPerm = window.DeviceOrientationEvent.requestPermission;
    if (typeof RequestPerm === 'function') {
      try {
        const result = await RequestPerm();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', onOrientation);
    enabled = true;
    return true;
  }

  function disable() {
    if (!enabled) return;
    window.removeEventListener('deviceorientation', onOrientation);
    enabled = false;
    zero = null;
    smoothed = null;
    latestRaw = null;
  }

  function recalibrate() {
    if (smoothed) zero = { ...smoothed };
  }

  function isEnabled() {
    return enabled;
  }

  function getDelta() {
    if (!smoothed || !zero) return null;
    return {
      alpha: smoothed.alpha - zero.alpha,
      beta: smoothed.beta - zero.beta,
      gamma: smoothed.gamma - zero.gamma,
    };
  }

  function step(dt, object3D) {
    if (!enabled || !zero || !smoothed || !object3D) return;
    const dAlpha = applyDeadZone(smoothed.alpha - zero.alpha);
    const dBeta = applyDeadZone(smoothed.beta - zero.beta);
    const dGamma = applyDeadZone(smoothed.gamma - zero.gamma);

    object3D.rotation.y += dAlpha * DEG * TILT_GAIN * dt;
    object3D.rotation.x += dBeta * DEG * TILT_GAIN * dt;
    object3D.rotation.z += dGamma * DEG * TILT_GAIN * dt;
  }

  return {
    enable,
    disable,
    recalibrate,
    isEnabled,
    getDelta,
    step,
  };
}
