import * as THREE from 'three';
import { WORLD } from '../core/config.js';

// Shared flight integration. Mutates `state` in place.
// state:    { position:Vec3, velocity:Vec3, quaternion:Quat, throttle:Number }
// controls: { pitch, roll, yaw } each in [-1, 1]
// params:   per-aircraft tuning (see config.js PLANE / ENEMY)
// env:      optional { wind:Vec3|null, densityBase, dragMul, turbulence,
//                      realistic, altScale } — when omitted the model behaves
//           exactly like the original arcade model (no wind, ρ=1).

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _airVel = new THREE.Vector3();
const _adir = new THREE.Vector3();

export function basisVectors(quaternion, out = {}) {
  out.forward = (out.forward || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(quaternion);
  out.up = (out.up || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(quaternion);
  out.right = (out.right || new THREE.Vector3()).set(1, 0, 0).applyQuaternion(quaternion);
  return out;
}

export function integrateFlight(state, controls, params, dt, env) {
  const q = state.quaternion;
  const v = state.velocity;

  const wind = env && env.wind;
  const realistic = !!(env && env.realistic);
  const turb = (env && env.turbulence) || 0;

  // air density: temperature base × an altitude lapse (only in realistic mode)
  let density = (env && env.densityBase) || 1;
  if (realistic) density *= Math.exp(-Math.max(0, state.position.y) / ((env && env.altScale) || 10000));

  _fwd.set(0, 0, -1).applyQuaternion(q);
  _up.set(0, 1, 0).applyQuaternion(q);
  _right.set(1, 0, 0).applyQuaternion(q);

  // aerodynamic forces act on motion through the air, not over the ground
  _airVel.copy(v);
  if (wind) _airVel.sub(wind);
  const airspeed = _airVel.length();

  // Control surfaces lose authority as airflow drops off (stall mush).
  const floor = realistic ? 0.12 : 0.2;
  const authority = THREE.MathUtils.clamp(airspeed / params.stallSpeed, floor, 1.3);

  // --- angular dynamics ---
  let pitchC = controls.pitch;
  let rollC = controls.roll;
  let yawC = controls.yaw;
  if (turb > 0) {            // gust/rain buffeting jiggles the controls
    pitchC += (Math.random() - 0.5) * turb;
    rollC += (Math.random() - 0.5) * turb * 1.4;
  }

  const pitch = pitchC * params.pitchRate * authority * dt;
  const roll = rollC * params.rollRate * authority * dt;
  // Coordinated turn: a bank pulls the nose around the same way the tilted
  // lift vector does (bank right => yaw right).
  const bankYaw = _right.y * params.yawFromRoll;
  const yaw = (yawC * params.yawRate + bankYaw) * authority * dt;

  if (pitch) { _q.setFromAxisAngle(_right, pitch); q.premultiply(_q); }
  if (roll) { _q.setFromAxisAngle(_fwd, roll); q.premultiply(_q); }
  if (yaw) { _q.setFromAxisAngle(_up, yaw); q.premultiply(_q); }
  q.normalize();

  _fwd.set(0, 0, -1).applyQuaternion(q);
  _up.set(0, 1, 0).applyQuaternion(q);

  // --- linear forces ---
  _accel.set(0, 0, 0);
  // thrust (a thinner atmosphere robs a little engine power)
  const thrust = state.throttle * params.maxThrust * Math.pow(density, 0.7);
  _accel.addScaledVector(_fwd, thrust);
  // gravity
  _accel.y -= WORLD.gravity;
  // drag — opposes motion through the air, scales with ρ and weather
  const dragMul = (env && env.dragMul) || 1;
  const dragMag = params.dragCoef * airspeed * density * dragMul *
    (1 + params.inducedDrag * Math.abs(controls.pitch || 0));
  _accel.addScaledVector(_airVel, -dragMag);
  // lift along the wing-up axis, ~ ρ·v², with a stall break below stall speed
  let liftFactor = airspeed * airspeed;
  if (airspeed < params.stallSpeed) {
    const f = airspeed / params.stallSpeed;
    liftFactor *= realistic ? f * f : f;     // sharper drop with realistic stalls
  }
  _accel.addScaledVector(_up, params.liftCoef * liftFactor * density);

  v.addScaledVector(_accel, dt);

  // --- aerodynamic stability: drag the through-air velocity toward the nose,
  //     then re-add the wind so the aircraft drifts with the air mass ---
  _airVel.copy(v);
  if (wind) _airVel.sub(wind);
  let aspd = _airVel.length();
  if (aspd > params.maxSpeed) { _airVel.multiplyScalar(params.maxSpeed / aspd); aspd = params.maxSpeed; }
  if (aspd > 0.001) {
    _adir.copy(_airVel).divideScalar(aspd);
    const grip = realistic ? params.grip * 0.7 : params.grip; // less self-correction
    const blend = THREE.MathUtils.clamp(grip * dt, 0, 0.25) * authority;
    _adir.lerp(_fwd, blend).normalize();
    _airVel.copy(_adir).multiplyScalar(aspd);
  }
  v.copy(_airVel);
  if (wind) v.add(wind);

  state.position.addScaledVector(v, dt);

  state.speed = aspd;                         // airspeed is what the A.S.I. reads
  state.stalled = aspd < params.stallSpeed;
  return state;
}
