import * as THREE from 'three';
import { WORLD } from '../core/config.js';

// Shared semi-realistic arcade flight integration. Mutates `state` in place.
// state:    { position:Vec3, velocity:Vec3, quaternion:Quat, throttle:Number }
// controls: { pitch, roll, yaw } each in [-1, 1]
// params:   per-aircraft tuning (see config.js PLANE / ENEMY)

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _vdir = new THREE.Vector3();
const _fdir = new THREE.Vector3();

export function basisVectors(quaternion, out = {}) {
  out.forward = (out.forward || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(quaternion);
  out.up = (out.up || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(quaternion);
  out.right = (out.right || new THREE.Vector3()).set(1, 0, 0).applyQuaternion(quaternion);
  return out;
}

export function integrateFlight(state, controls, params, dt) {
  const q = state.quaternion;
  const v = state.velocity;

  _fwd.set(0, 0, -1).applyQuaternion(q);
  _up.set(0, 1, 0).applyQuaternion(q);
  _right.set(1, 0, 0).applyQuaternion(q);

  const speed = v.length();
  // Control surfaces lose authority as airflow drops off (stall mush).
  const authority = THREE.MathUtils.clamp(speed / params.stallSpeed, 0.2, 1.3);

  // --- angular dynamics: apply body-axis rotations to the orientation ---
  const pitch = controls.pitch * params.pitchRate * authority * dt;
  const roll = controls.roll * params.rollRate * authority * dt;
  // Coordinated turn: a bank pulls the nose around the same way the tilted
  // lift vector does (bank right => yaw right), so the turn is coordinated
  // rather than fighting itself.
  const bankYaw = _right.y * params.yawFromRoll;
  const yaw = (controls.yaw * params.yawRate + bankYaw) * authority * dt;

  if (pitch) { _q.setFromAxisAngle(_right, pitch); q.premultiply(_q); }
  if (roll) { _q.setFromAxisAngle(_fwd, roll); q.premultiply(_q); }
  if (yaw) { _q.setFromAxisAngle(_up, yaw); q.premultiply(_q); }
  q.normalize();

  // refresh basis after rotation
  _fwd.set(0, 0, -1).applyQuaternion(q);
  _up.set(0, 1, 0).applyQuaternion(q);

  // --- linear forces ---
  _accel.set(0, 0, 0);
  // thrust
  _accel.addScaledVector(_fwd, state.throttle * params.maxThrust);
  // gravity
  _accel.y -= WORLD.gravity;
  // drag (parasitic + a touch of induced from yanking the stick)
  const dragMag = params.dragCoef * speed * (1 + params.inducedDrag * Math.abs(controls.pitch || 0));
  _accel.addScaledVector(v, -dragMag);
  // lift along the wing-up axis, ~ v^2 (so low speed => mush => stall fall)
  const lift = params.liftCoef * speed * speed;
  _accel.addScaledVector(_up, lift);

  v.addScaledVector(_accel, dt);

  // --- aerodynamic stability: drag the velocity vector toward the nose ---
  const sp2 = v.length();
  if (sp2 > 0.001) {
    _vdir.copy(v).divideScalar(sp2);
    _fdir.copy(_fwd);
    const blend = THREE.MathUtils.clamp(params.grip * dt, 0, 0.25) * authority;
    _vdir.lerp(_fdir, blend).normalize();
    v.copy(_vdir).multiplyScalar(sp2);
  }

  // hard speed ceiling
  if (sp2 > params.maxSpeed) v.multiplyScalar(params.maxSpeed / sp2);

  state.position.addScaledVector(v, dt);

  state.speed = v.length();
  state.stalled = state.speed < params.stallSpeed;
  return state;
}
