const MAX_VELOCITY = 15;
const DAMPING = 0.985;
const VELOCITY_EPSILON = 0.001;

function clamp(v, min, max) {
  if (v > max) return max;
  if (v < min) return min;
  return v;
}

export function createPhysics() {
  const velocity = { x: 0, y: 0, z: 0 };
  let continuous = false;

  return {
    getVelocity() {
      return { ...velocity };
    },
    applyImpulse(axis, magnitude) {
      velocity[axis] = clamp(velocity[axis] + magnitude, -MAX_VELOCITY, MAX_VELOCITY);
    },
    step(dt, object3D) {
      object3D.rotation.x += velocity.x * dt;
      object3D.rotation.y += velocity.y * dt;
      object3D.rotation.z += velocity.z * dt;
      if (!continuous) {
        velocity.x *= DAMPING;
        velocity.y *= DAMPING;
        velocity.z *= DAMPING;
        if (Math.abs(velocity.x) < VELOCITY_EPSILON) velocity.x = 0;
        if (Math.abs(velocity.y) < VELOCITY_EPSILON) velocity.y = 0;
        if (Math.abs(velocity.z) < VELOCITY_EPSILON) velocity.z = 0;
      }
    },
    toggleContinuous() {
      continuous = !continuous;
      return continuous;
    },
    isContinuous() {
      return continuous;
    },
    reset(object3D) {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      if (object3D) {
        object3D.rotation.x = 0;
        object3D.rotation.y = 0;
        object3D.rotation.z = 0;
      }
    },
  };
}
