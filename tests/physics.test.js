import { describe, it, expect, beforeEach } from 'vitest';
import { createPhysics } from '../src/physics.js';

describe('physics', () => {
  let physics;

  beforeEach(() => {
    physics = createPhysics();
  });

  it('starts with zero angular velocity', () => {
    expect(physics.getVelocity()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('applies impulse on the y axis', () => {
    physics.applyImpulse('y', 2.5);
    expect(physics.getVelocity()).toEqual({ x: 0, y: 2.5, z: 0 });
  });

  it('accumulates impulses on the same axis', () => {
    physics.applyImpulse('y', 1);
    physics.applyImpulse('y', 1);
    expect(physics.getVelocity().y).toBe(2);
  });

  it('clamps velocity to MAX_VELOCITY (15 rad/s)', () => {
    for (let i = 0; i < 20; i++) physics.applyImpulse('x', 5);
    expect(physics.getVelocity().x).toBe(15);
  });

  it('clamps negative velocity to -MAX_VELOCITY', () => {
    for (let i = 0; i < 20; i++) physics.applyImpulse('x', -5);
    expect(physics.getVelocity().x).toBe(-15);
  });

  it('step rotates the object by velocity * dt', () => {
    physics.applyImpulse('y', 1); // velocity.y = 1
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.5, obj); // dt = 0.5s
    expect(obj.rotation.y).toBeCloseTo(0.5, 5);
  });

  it('step applies damping (0.985 per frame) to velocity', () => {
    physics.applyImpulse('y', 1);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBeCloseTo(0.985, 5);
  });

  it('step snaps tiny velocity to zero (< 0.001)', () => {
    physics.applyImpulse('y', 0.0009);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBe(0);
  });

  it('continuous mode skips damping', () => {
    physics.applyImpulse('y', 1);
    physics.toggleContinuous();
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBe(1);
  });

  it('reset zeroes velocity and rotation', () => {
    physics.applyImpulse('x', 2);
    physics.applyImpulse('y', 3);
    const obj = { rotation: { x: 1, y: 2, z: 3 } };
    physics.reset(obj);
    expect(physics.getVelocity()).toEqual({ x: 0, y: 0, z: 0 });
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });
});
