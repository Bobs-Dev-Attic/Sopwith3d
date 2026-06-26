import * as THREE from 'three';
import { CAMERA } from './config.js';

// Damped 3rd-person chase cam. Stays world-upright (doesn't roll with the
// plane) so hard banks read clearly without making the player seasick.
export default class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._init = false;
  }

  follow(target, dt) {
    const s = target.state;
    this._fwd.set(0, 0, -1).applyQuaternion(s.quaternion);

    // flatten the forward a touch so we don't stare at dirt in a dive
    const flatFwd = this._fwd.clone();
    flatFwd.y = THREE.MathUtils.clamp(flatFwd.y, -0.6, 0.6);
    flatFwd.normalize();

    this._desired.copy(s.position)
      .addScaledVector(flatFwd, -CAMERA.distance)
      .add(new THREE.Vector3(0, CAMERA.height, 0));

    this._lookTarget.copy(s.position).addScaledVector(this._fwd, CAMERA.lookAhead);

    if (!this._init) {
      this._pos.copy(this._desired);
      this._look.copy(this._lookTarget);
      this._init = true;
    } else {
      const kp = 1 - Math.exp(-CAMERA.stiffness * dt);
      const kr = 1 - Math.exp(-CAMERA.rotStiffness * dt);
      this._pos.lerp(this._desired, kp);
      this._look.lerp(this._lookTarget, kr);
    }

    // never let the camera dip below the dirt
    this._pos.y = Math.max(this._pos.y, 3);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }

  snap() { this._init = false; }
}
