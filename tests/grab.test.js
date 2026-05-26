import { describe, it, expect } from 'vitest';
import { createGrab } from '../src/grab.js';

const DEG = Math.PI / 180;

// Helper: a controllable orientation source + virtual clock.
function makeHarness(initial = { alpha: 0, beta: 0, gamma: 0 }) {
  let current = initial == null ? null : { ...initial };
  let t = 0;
  return {
    getOrientation: () => current,
    now: () => t,
    set(reading) { current = reading == null ? null : { ...reading }; },
    advance(ms) { t += ms; },
    setTime(ms) { t = ms; },
  };
}

describe('grab', () => {
  it('starts idle and getDeltaRotation returns null', () => {
    const h = makeHarness();
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    expect(g.isGrabbing()).toBe(false);
    expect(g.getDeltaRotation()).toBeNull();
  });

  it('toggle from idle snapshots pose as zero and returns state: grabbing', () => {
    const h = makeHarness({ alpha: 30, beta: -10, gamma: 5 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    const r = g.toggle();
    expect(r.state).toBe('grabbing');
    expect(r.baseOrientation).toEqual({ alpha: 30, beta: -10, gamma: 5 });
    expect(g.isGrabbing()).toBe(true);
  });

  it('toggle from idle without orientation reading stays idle', () => {
    const h = makeHarness(null);
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    const r = g.toggle();
    expect(r.state).toBe('idle');
    expect(r.reason).toBe('no-orientation');
    expect(g.isGrabbing()).toBe(false);
  });

  it('getDeltaRotation maps alpha→y, beta→x, gamma→z in radians', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle(); // zero at (0,0,0)
    h.set({ alpha: 45, beta: 30, gamma: 15 });
    const d = g.getDeltaRotation();
    expect(d.y).toBeCloseTo(45 * DEG, 5); // alpha → y
    expect(d.x).toBeCloseTo(30 * DEG, 5); // beta  → x
    expect(d.z).toBeCloseTo(15 * DEG, 5); // gamma → z
  });

  it('getDeltaBeta returns scale-friendly degrees', () => {
    const h = makeHarness({ alpha: 0, beta: 20, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle(); // zero beta = 20
    h.set({ alpha: 999, beta: 110, gamma: -50 });
    expect(g.getDeltaBeta()).toBeCloseTo(90, 5);
  });

  it('getDeltaBeta returns 0 when idle', () => {
    const h = makeHarness({ alpha: 0, beta: 50, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    expect(g.getDeltaBeta()).toBe(0);
  });

  it('tick pushes samples and release computes angular velocity (rad/s)', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });

    g.toggle(); // grab at t=0, pose=(0,0,0). Initial sample pushed.

    // Sweep alpha 0 → 90 over 100ms (5 ticks).
    h.advance(20); h.set({ alpha: 18, beta: 0, gamma: 0 }); g.tick();
    h.advance(20); h.set({ alpha: 36, beta: 0, gamma: 0 }); g.tick();
    h.advance(20); h.set({ alpha: 54, beta: 0, gamma: 0 }); g.tick();
    h.advance(20); h.set({ alpha: 72, beta: 0, gamma: 0 }); g.tick();
    h.advance(20); h.set({ alpha: 90, beta: 0, gamma: 0 }); g.tick();
    // Buffer holds last 5: t=20..100, alpha=18..90. dt=80ms, dα=72°.
    // Velocity.y = 72° / 0.08s = 900 deg/s ≈ 15.7 rad/s.

    const r = g.toggle();
    expect(r.state).toBe('idle');
    expect(r.angularVelocity.y).toBeCloseTo((72 * DEG) / 0.08, 2);
    expect(r.angularVelocity.x).toBeCloseTo(0, 5);
    expect(r.angularVelocity.z).toBeCloseTo(0, 5);
  });

  it('release with too few samples (instant tap-tap) returns zero velocity', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle();
    // No tick(), no time advance — second toggle right away.
    const r = g.toggle();
    expect(r.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('release with samples but dt < MIN_DT returns zero velocity', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle();
    h.advance(5); g.tick(); // total 5ms, below the 10ms minimum
    const r = g.toggle();
    expect(r.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('re-grab snapshots a fresh zero and clears prior buffer', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle(); // zero at (0,0,0)
    h.set({ alpha: 50, beta: 0, gamma: 0 });
    h.advance(50); g.tick();
    g.toggle(); // release
    expect(g.isGrabbing()).toBe(false);
    // Now grab again with a totally different pose.
    h.set({ alpha: 200, beta: 90, gamma: -45 });
    const r = g.toggle();
    expect(r.state).toBe('grabbing');
    expect(r.baseOrientation).toEqual({ alpha: 200, beta: 90, gamma: -45 });
    // delta should be zero immediately after re-grab
    const d = g.getDeltaRotation();
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(0, 5);
    expect(d.z).toBeCloseTo(0, 5);
  });

  it('reset() forces idle and clears state', () => {
    const h = makeHarness({ alpha: 0, beta: 0, gamma: 0 });
    const g = createGrab({ getOrientation: h.getOrientation, now: h.now });
    g.toggle();
    expect(g.isGrabbing()).toBe(true);
    g.reset();
    expect(g.isGrabbing()).toBe(false);
    expect(g.getDeltaRotation()).toBeNull();
  });

  it('throws if getOrientation is not provided', () => {
    expect(() => createGrab({})).toThrow();
  });
});
