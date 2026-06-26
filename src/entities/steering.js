import * as THREE from 'three';

// Coordinated-turn autopilot shared by the enemy AI and the patrol-boundary
// nudge. Returns stick commands ({roll, pitch, yaw} in [-1,1]) that bank the
// aircraft toward `desiredDir` and pull the nose around — rather than rolling
// continuously, which would just barrel-roll.

const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _right = new THREE.Vector3();

const MAX_BANK = 1.0;      // radians (~57°) at full turn demand
const ROLL_GAIN = 2.4;     // how hard we drive toward the target bank

export function bankAngle(quaternion) {
  // right-wing-down tips the right vector below horizontal => positive bank
  _right.set(1, 0, 0).applyQuaternion(quaternion);
  return Math.asin(THREE.MathUtils.clamp(-_right.y, -1, 1));
}

export function steerToward(quaternion, desiredDir, out = {}) {
  _inv.copy(quaternion).invert();
  _local.copy(desiredDir).applyQuaternion(_inv).normalize(); // dir in body frame

  // local.x > 0 => target to the right; local.y > 0 => above; -z is forward
  let turnNeed = THREE.MathUtils.clamp(_local.x * 3, -1, 1);
  if (_local.z > 0.05) turnNeed = _local.x >= 0 ? 1 : -1; // behind: commit to a turn
  const climbNeed = THREE.MathUtils.clamp(_local.y * 3, -1, 1);

  const bank = bankAngle(quaternion);
  const targetBank = turnNeed * MAX_BANK;
  out.roll = THREE.MathUtils.clamp((targetBank - bank) * ROLL_GAIN, -1, 1);

  // back-stick to haul the nose around once banked, plus vertical aim
  const pull = Math.abs(turnNeed) * THREE.MathUtils.clamp(Math.abs(bank) / 0.5, 0, 1);
  out.pitch = THREE.MathUtils.clamp(climbNeed * 0.85 + pull, -1, 1);
  out.yaw = turnNeed * 0.2;
  return out;
}
