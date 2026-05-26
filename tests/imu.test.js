import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createImu } from '../src/imu.js';

// jsdom doesn't fire DeviceOrientationEvent, so we synthesize it.
function fireOrientation(alpha, beta, gamma) {
  const ev = new Event('deviceorientation');
  ev.alpha = alpha;
  ev.beta = beta;
  ev.gamma = gamma;
  window.dispatchEvent(ev);
}

// Drive the EMA to (near-)convergence by firing the same reading many times.
// With SMOOTHING_ALPHA=0.15, 60 readings get us to >99.99% of the target.
function settleTo(alpha, beta, gamma, n = 60) {
  for (let i = 0; i < n; i++) fireOrientation(alpha, beta, gamma);
}

// Match production constants in src/imu.js.
const DEAD_ZONE_DEG = 8;
const TILT_GAIN = 0.6;
const DEG = Math.PI / 180;

describe('imu', () => {
  let imu;

  beforeEach(async () => {
    imu = createImu();
    await imu.enable();
  });

  afterEach(() => {
    imu.disable();
  });

  it('enable() returns true when DeviceOrientation is available', () => {
    expect(imu.isEnabled()).toBe(true);
  });

  it('step() does nothing before any orientation reading', () => {
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(0.016, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('first reading establishes a zero, holding still produces no rotation', () => {
    settleTo(10, 20, 30);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation.x).toBeCloseTo(0, 5);
    expect(obj.rotation.y).toBeCloseTo(0, 5);
    expect(obj.rotation.z).toBeCloseTo(0, 5);
  });

  it('reading well outside dead zone produces rotation along the right axes', () => {
    settleTo(0, 0, 0);                  // zero
    settleTo(45, 30, 20);               // converge smoothed → (45,30,20)
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);                    // dt = 1s

    // After dead zone (8°) and gain (0.6), in radians.
    const expectY = (45 - DEAD_ZONE_DEG) * TILT_GAIN * DEG;
    const expectX = (30 - DEAD_ZONE_DEG) * TILT_GAIN * DEG;
    const expectZ = (20 - DEAD_ZONE_DEG) * TILT_GAIN * DEG;
    expect(obj.rotation.y).toBeCloseTo(expectY, 3);
    expect(obj.rotation.x).toBeCloseTo(expectX, 3);
    expect(obj.rotation.z).toBeCloseTo(expectZ, 3);
  });

  it('readings inside dead zone (≤ 8°) produce no rotation', () => {
    settleTo(0, 0, 0);
    settleTo(6, 6, 6); // all axes < DEAD_ZONE_DEG
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation.x).toBeCloseTo(0, 5);
    expect(obj.rotation.y).toBeCloseTo(0, 5);
    expect(obj.rotation.z).toBeCloseTo(0, 5);
  });

  it('EMA smoothing suppresses a single spike', () => {
    settleTo(0, 0, 0);
    // One huge spike then back to zero — smoothed only nudges 15% of the way.
    fireOrientation(100, 0, 0);
    fireOrientation(0, 0, 0);
    // Smoothed is now ~0 + 0.15*100 then back: 15 → 12.75. Below dead zone × (1-α) so:
    // Actually after one spike+one zero, smoothed alpha = 15 - 0.15*15 = 12.75.
    // Past 8° dead zone, so it WILL produce some rotation, but heavily damped.
    // Compare to no smoothing: 100 - 8 = 92 active deg. With smoothing: 12.75 - 8 = 4.75.
    // Smoothing reduces the kick by ~95%.
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    const damped = obj.rotation.y;
    // With smoothing, single-spike rotation should be small (well under the unsmoothed 92*gain*deg).
    expect(Math.abs(damped)).toBeLessThan(0.1); // ~0.05 rad in practice
  });

  it('recalibrate() snaps zero to current smoothed pose', () => {
    settleTo(0, 0, 0);
    settleTo(50, 0, 0); // smoothed alpha ≈ 50
    imu.recalibrate(); // zero ≈ (50,0,0)
    settleTo(60, 0, 0); // smoothed climbs toward 60
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    // Smoothed ≈ 60, zero ≈ 50, delta = 10°, active = 2° after dead zone.
    const expectY = (60 - 50 - DEAD_ZONE_DEG) * TILT_GAIN * DEG;
    expect(obj.rotation.y).toBeCloseTo(expectY, 3);
  });

  it('disable() removes the listener and clears state', () => {
    settleTo(0, 0, 0);
    settleTo(50, 50, 50);
    imu.disable();
    expect(imu.isEnabled()).toBe(false);
    fireOrientation(99, 99, 99); // ignored
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('step() is a no-op when disabled', () => {
    imu.disable();
    settleTo(0, 0, 0);
    settleTo(50, 50, 50);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });
});
