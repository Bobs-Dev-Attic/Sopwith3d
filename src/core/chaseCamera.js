import * as THREE from 'three';
import { CAMERA } from './config.js';

// 3rd-person chase cam plus a first-person cockpit mode at the bottom of the
// VIEW slider. Chase stays world-upright (no roll, comfortable); cockpit rides
// the airframe and banks with it. Switching between them is a hard cut that the
// game masks with a quick fade.
export default class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this._lastMode = 'chase';
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._eye = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -CAMERA.cockpitPitch);
    this._init = false;
    this.distance = THREE.MathUtils.lerp(CAMERA.distanceNear, CAMERA.distanceFar, CAMERA.defaultZoom);
    this.height = THREE.MathUtils.lerp(CAMERA.heightNear, CAMERA.heightFar, CAMERA.defaultZoom);
  }

  // t in [0,1]: bottom slice = cockpit, the rest = chase distance near..far
  setZoom(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    if (t <= CAMERA.cockpitZoom) {
      this.mode = 'cockpit';
    } else {
      this.mode = 'chase';
      const tt = (t - CAMERA.cockpitZoom) / (1 - CAMERA.cockpitZoom);
      this.distance = THREE.MathUtils.lerp(CAMERA.distanceNear, CAMERA.distanceFar, tt);
      this.height = THREE.MathUtils.lerp(CAMERA.heightNear, CAMERA.heightFar, tt);
    }
    if (this.mode !== this._lastMode) {
      this._init = false;          // snap the chase cam after a mode change
      this._lastMode = this.mode;
    }
  }

  follow(target, dt) {
    if (this.mode === 'cockpit') { this._cockpit(target); return; }

    const s = target.state;
    this._fwd.set(0, 0, -1).applyQuaternion(s.quaternion);

    const flatFwd = this._fwd.clone();
    flatFwd.y = THREE.MathUtils.clamp(flatFwd.y, -0.6, 0.6);
    flatFwd.normalize();

    this._desired.copy(s.position)
      .addScaledVector(flatFwd, -this.distance)
      .addScaledVector(this._up, this.height);
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
    this._pos.y = Math.max(this._pos.y, 3);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }

  _cockpit(target) {
    const s = target.state;
    // eye point, local to the airframe -> world
    this._eye.set(CAMERA.cockpitEye.x, CAMERA.cockpitEye.y, CAMERA.cockpitEye.z)
      .applyQuaternion(s.quaternion).add(s.position);
    // a little buffeting that grows with airspeed
    const shake = Math.min(1, s.speed / 140) * CAMERA.cockpitShake;
    this._eye.x += (Math.random() - 0.5) * shake;
    this._eye.y += (Math.random() - 0.5) * shake;
    this.camera.position.copy(this._eye);
    // look along the nose, banking with the aircraft, nosed slightly down
    this._q.copy(s.quaternion).multiply(this._pitchQ);
    this.camera.quaternion.copy(this._q);
    this._init = false; // ensure chase re-snaps when we return to it
  }

  snap() { this._init = false; }
}
