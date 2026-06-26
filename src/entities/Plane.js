import * as THREE from 'three';
import { buildCamel } from './models.js';
import { integrateFlight } from './flight.js';
import { PLANE } from '../core/config.js';

// The player's Sopwith Camel.
export default class Plane {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    const m = buildCamel();
    this.parts = m;
    this.group = m.group;
    scene.add(this.group);

    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      throttle: PLANE.startThrottle,
      speed: 0,
      stalled: false,
    };
    this.controls = { pitch: 0, roll: 0, yaw: 0 };
    this.params = PLANE;

    this.hull = PLANE.hull;
    this.maxHull = PLANE.hull;
    this.alive = true;
    this.bombs = PLANE.bombCount;
    this.propSpin = 0;
    this._smokeTimer = 0;
    this._surfaces = { pitch: 0, roll: 0, yaw: 0 };

    this._muzzleWorld = new THREE.Vector3();
    this._fwdWorld = new THREE.Vector3();
  }

  reset(position, heading = 0) {
    this.state.position.copy(position);
    this.state.quaternion.setFromEuler(new THREE.Euler(0, heading, 0));
    this.state.velocity.set(0, 0, -1)
      .applyQuaternion(this.state.quaternion)
      .multiplyScalar(PLANE.startSpeed);
    this.state.throttle = PLANE.startThrottle;
    this.hull = this.maxHull;
    this.alive = true;
    this.bombs = PLANE.bombCount;
    this.group.visible = true;
    this._syncTransform();
  }

  setStick(pitch, yaw) {
    // Joystick: vertical = pitch, horizontal = bank/yaw (coordinated turn).
    this.controls.pitch = pitch;
    this.controls.roll = -yaw;      // push right => bank right
    this.controls.yaw = yaw * 0.35; // a little rudder with the bank
  }

  setThrottle(t) { this.state.throttle = THREE.MathUtils.clamp(t, 0, 1); }

  update(dt) {
    if (!this.alive) { this._updateWreck(dt); return; }

    integrateFlight(this.state, this.controls, this.params, dt);
    this._syncTransform();
    this._animateSurfaces(dt);
    this._spinProp(dt);
    this._emitDamage(dt);
  }

  _syncTransform() {
    this.group.position.copy(this.state.position);
    this.group.quaternion.copy(this.state.quaternion);
  }

  _animateSurfaces(dt) {
    // ease toward target deflection so the flaps don't snap
    const s = this._surfaces;
    const k = Math.min(1, dt * 10);
    s.pitch += (this.controls.pitch - s.pitch) * k;
    s.roll += (this.controls.roll - s.roll) * k;
    s.yaw += (this.controls.yaw - s.yaw) * k;
    this.parts.elevator.rotation.x = s.pitch * 0.45;
    this.parts.rudder.rotation.y = (s.yaw + s.roll * 0.25) * 0.5;
    this.parts.aileronL.rotation.x = s.roll * 0.5;
    this.parts.aileronR.rotation.x = -s.roll * 0.5;
  }

  _spinProp(dt) {
    this.propSpin += dt * (8 + this.state.throttle * 70);
    this.parts.prop.rotation.z = this.propSpin;
    // blur effect: faster = harder to see (handled simply by spin speed)
  }

  _emitDamage(dt) {
    const frac = this.hull / this.maxHull;
    if (frac > 0.6 || !this.fx) return;
    this._smokeTimer -= dt;
    if (this._smokeTimer <= 0) {
      this._smokeTimer = frac < 0.3 ? 0.03 : 0.07;
      this.worldMuzzle();
      const p = this._muzzleWorld.clone();
      const onFire = frac < 0.3;
      this.fx.puff(p, onFire ? 'fire' : 'smoke', this.state.velocity);
    }
  }

  _updateWreck(dt) {
    // tumble to the ground after being killed
    this.state.velocity.y -= 9.8 * dt * 1.4;
    this.state.position.addScaledVector(this.state.velocity, dt);
    this._wreckSpin = (this._wreckSpin || 0) + dt * 4;
    this.group.rotation.z += dt * 3;
    this.group.rotation.x += dt * 1.5;
    this.group.position.copy(this.state.position);
    if (this.fx) this.fx.puff(this.state.position, 'fire', this.state.velocity);
  }

  worldMuzzle() {
    this.group.updateMatrixWorld();
    this._muzzleWorld.copy(this.parts.muzzle).applyMatrix4(this.group.matrixWorld);
    this._fwdWorld.set(0, 0, -1).applyQuaternion(this.state.quaternion);
    return { pos: this._muzzleWorld, dir: this._fwdWorld };
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hull = Math.max(0, this.hull - amount);
    if (this.hull <= 0) this.kill();
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    if (this.fx) this.fx.explosion(this.state.position, 2.0);
  }
}
