// Head IMU tilt → continuous model rotation bias.
//
// The Meta Display does NOT expose the Neural Band's twist gesture (pinça +
// rotação do pulso) to web apps — it's reserved for system volume. The
// closest continuous-control equivalent the platform exposes is the head
// IMU via DeviceOrientation: tilt your head, the model follows.
//
// Output:
//   step(dt, object3D) — additively rotates the object based on current head
//   delta from the calibrated zero. Idempotent w.r.t. physics damping; this
//   bias is layered on top of physics.step's velocity-based rotation.
//
// Calibration:
//   The first valid DeviceOrientation reading after enable() becomes the
//   zero pose. Subsequent readings are diff'd against it. recalibrate()
//   snaps zero to the current pose (useful when the user reorients).
//
// Permission:
//   iOS / Safari and some other browsers require requestPermission(). We
//   call it on enable() if available; otherwise we just attach the listener.

const DEG = Math.PI / 180;

// How fast the model follows the head. 1.0 = 1° head tilt → 1° model rotation
// per second. Higher = more responsive but jittery.
const TILT_GAIN = 0.9;

// Small dead zone around zero to avoid drift when the user is "still".
const DEAD_ZONE_DEG = 1.5;

export function createImu() {
  let enabled = false;
  let zero = null;     // { alpha, beta, gamma } — first reading
  let current = null;  // latest reading

  function applyDeadZone(deg) {
    if (Math.abs(deg) < DEAD_ZONE_DEG) return 0;
    return deg - Math.sign(deg) * DEAD_ZONE_DEG;
  }

  function onOrientation(event) {
    if (event.alpha == null && event.beta == null && event.gamma == null) return;
    const reading = {
      alpha: event.alpha ?? 0,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
    };
    if (!zero) zero = reading;
    current = reading;
  }

  async function enable() {
    if (enabled) return true;
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return false;
    }
    // Some platforms (iOS Safari) gate DeviceOrientation behind a permission.
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
    current = null;
  }

  function recalibrate() {
    zero = current;
  }

  function isEnabled() {
    return enabled;
  }

  function step(dt, object3D) {
    if (!enabled || !zero || !current || !object3D) return;
    const dAlpha = applyDeadZone(current.alpha - zero.alpha);
    const dBeta = applyDeadZone(current.beta - zero.beta);
    const dGamma = applyDeadZone(current.gamma - zero.gamma);

    object3D.rotation.y += dAlpha * DEG * TILT_GAIN * dt;
    object3D.rotation.x += dBeta * DEG * TILT_GAIN * dt;
    object3D.rotation.z += dGamma * DEG * TILT_GAIN * dt;
  }

  return {
    enable,
    disable,
    recalibrate,
    isEnabled,
    step,
  };
}
