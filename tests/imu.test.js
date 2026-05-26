import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createImu } from '../src/imu.js';

// jsdom doesn't fire DeviceOrientationEvent, so we synthesize it.
function fireOrientation(alpha, beta, gamma) {
  const ev = new Event('deviceorientation');
  ev.alpha = alpha;
  ev.beta = beta;
  ev.gamma = gamma;
  window.dispatchEvent(ev);
}

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

  it('first orientation reading becomes the zero pose', () => {
    fireOrientation(10, 20, 30);
    // Same reading again — delta should be zero.
    fireOrientation(10, 20, 30);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(0.016, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('subsequent orientation reading produces rotation along the right axes', () => {
    fireOrientation(0, 0, 0);              // zero
    fireOrientation(45, 30, 20);           // delta = (45, 30, 20) deg
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj); // dt = 1s so the gain * deadzone math is easy to verify

    // After dead zone (1.5deg) and gain (0.9): each axis = (delta - 1.5) * 0.9 * deg2rad
    const expectY = (45 - 1.5) * 0.9 * Math.PI / 180;
    const expectX = (30 - 1.5) * 0.9 * Math.PI / 180;
    const expectZ = (20 - 1.5) * 0.9 * Math.PI / 180;
    expect(obj.rotation.y).toBeCloseTo(expectY, 5);
    expect(obj.rotation.x).toBeCloseTo(expectX, 5);
    expect(obj.rotation.z).toBeCloseTo(expectZ, 5);
  });

  it('dead zone suppresses small tilts (< 1.5deg)', () => {
    fireOrientation(10, 10, 10);
    fireOrientation(11, 11, 11); // delta = 1 deg < 1.5
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('recalibrate() snaps zero to current reading', () => {
    fireOrientation(0, 0, 0);
    fireOrientation(50, 0, 0);
    imu.recalibrate(); // now zero = (50, 0, 0)
    fireOrientation(55, 0, 0); // delta = 5 deg
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    const expectY = (5 - 1.5) * 0.9 * Math.PI / 180;
    expect(obj.rotation.y).toBeCloseTo(expectY, 5);
  });

  it('disable() removes the listener and clears state', () => {
    fireOrientation(0, 0, 0);
    fireOrientation(50, 50, 50);
    imu.disable();
    expect(imu.isEnabled()).toBe(false);
    fireOrientation(99, 99, 99); // ignored
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('step() is a no-op when disabled', () => {
    imu.disable();
    fireOrientation(0, 0, 0);
    fireOrientation(50, 50, 50);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    imu.step(1, obj);
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });
});
