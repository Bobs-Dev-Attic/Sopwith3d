import * as THREE from 'three';
import { buildFokker } from './models.js';
import { integrateFlight, basisVectors } from './flight.js';
import { steerToward } from './steering.js';
import { ENEMY } from '../core/config.js';

const _toTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _local = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _lead = new THREE.Vector3();
const _basis = {};

// Fokker Dr.I flown by a simple but believable combat AI.
export default class EnemyPlane {
  constructor(scene, fx, color) {
    this.scene = scene;
    this.fx = fx;
    const m = buildFokker(color);
    this.parts = m;
    this.group = m.group;
    scene.add(this.group);

    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      throttle: 0.8,
      speed: 0,
      stalled: false,
    };
    this.controls = { pitch: 0, roll: 0, yaw: 0 };
    this.params = ENEMY;
    this.hull = ENEMY.hull;
    this.maxHull = ENEMY.hull;
    this.alive = true;

    this.mode = 'patrol';
    this.fireCooldown = 0;
    this.propSpin = Math.random() * 6;
    this._patrolCenter = new THREE.Vector3();
    this._patrolAngle = Math.random() * Math.PI * 2;
    this._smokeTimer = 0;
    this._muzzleWorld = new THREE.Vector3();
    this._fwdWorld = new THREE.Vector3();
    this.onFire = null; // game sets a callback to spawn bullets
  }

  spawn(position, heading = 0) {
    this.state.position.copy(position);
    this.state.quaternion.setFromEuler(new THREE.Euler(0, heading, 0));
    this.state.velocity.set(0, 0, -1)
      .applyQuaternion(this.state.quaternion)
      .multiplyScalar(ENEMY.cruiseSpeed);
    this._patrolCenter.copy(position);
    this.hull = this.maxHull;
    this.alive = true;
    this.group.visible = true;
  }

  update(dt, target) {
    if (!this.alive) { this._updateWreck(dt); return; }

    this._think(dt, target);
    integrateFlight(this.state, this.controls, this.params, dt);
    this.group.position.copy(this.state.position);
    this.group.quaternion.copy(this.state.quaternion);

    this.propSpin += dt * 60;
    this.parts.prop.rotation.z = this.propSpin;
    this.parts.elevator.rotation.x = this.controls.pitch * 0.4;
    this.parts.rudder.rotation.y = this.controls.yaw * 0.5;

    this._emitDamage(dt);
  }

  _think(dt, target) {
    this.fireCooldown -= dt;
    const pos = this.state.position;

    let aimValid = false;
    if (target && target.alive) {
      _toTarget.copy(target.state.position).sub(pos);
      const dist = _toTarget.length();

      if (dist < ENEMY.engageRange) {
        this.mode = 'attack';
        // Lead the target a little based on its velocity & bullet travel time.
        const tof = THREE.MathUtils.clamp(dist / ENEMY.muzzleSpeed, 0, 1.2);
        _lead.copy(target.state.velocity).multiplyScalar(tof);
        _desired.copy(target.state.position).add(_lead).sub(pos).normalize();
        aimValid = true;
      } else {
        this.mode = 'patrol';
      }
    } else {
      this.mode = 'patrol';
    }

    if (this.mode === 'patrol') this._patrol(dt);

    // Ground avoidance always wins.
    const agl = pos.y;
    if (agl < 120) {
      _desired.set(this.state.velocity.x, 0, this.state.velocity.z).normalize();
      _desired.y = THREE.MathUtils.clamp((140 - agl) / 120, 0, 0.8);
      _desired.normalize();
      aimValid = false;
    }

    this._steerToward(_desired);

    // Throttle: ease off in hard turns so it doesn't overshoot.
    const turnEffort = Math.abs(this.controls.roll) + Math.abs(this.controls.pitch);
    this.state.throttle = THREE.MathUtils.clamp(0.95 - turnEffort * 0.25, 0.55, 1);

    // Fire when the nose is on target and in range.
    if (aimValid && target && this.fireCooldown <= 0) {
      _toTarget.copy(target.state.position).sub(pos);
      const dist = _toTarget.length();
      basisVectors(this.state.quaternion, _basis);
      const aim = _basis.forward.dot(_toTarget.normalize());
      if (dist < ENEMY.gunRange && aim > 1 - ENEMY.gunCone) {
        this.fireCooldown = ENEMY.fireInterval;
        if (this.onFire) this.onFire(this);
      }
    }
  }

  _patrol(dt) {
    // lazy circling over the patrol point
    this._patrolAngle += dt * 0.25;
    const r = 600;
    _desired.set(
      this._patrolCenter.x + Math.cos(this._patrolAngle) * r - this.state.position.x,
      (this._patrolCenter.y + 260) - this.state.position.y,
      this._patrolCenter.z + Math.sin(this._patrolAngle) * r - this.state.position.z
    ).normalize();
  }

  _steerToward(desiredDir) {
    // coordinated bank-and-pull turn toward the target (shared with the
    // player's patrol-boundary autopilot)
    steerToward(this.state.quaternion, desiredDir, this.controls);
  }

  _emitDamage(dt) {
    if (this.hull / this.maxHull > 0.5 || !this.fx) return;
    this._smokeTimer -= dt;
    if (this._smokeTimer <= 0) {
      this._smokeTimer = 0.08;
      this.fx.puff(this.state.position, this.hull / this.maxHull < 0.25 ? 'fire' : 'smoke',
        this.state.velocity);
    }
  }

  _updateWreck(dt) {
    this.state.velocity.y -= 9.8 * dt * 1.4;
    this.state.position.addScaledVector(this.state.velocity, dt);
    this.group.rotation.z += dt * 5;
    this.group.rotation.x += dt * 2;
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
    this.hull -= amount;
    if (this.hull <= 0) this.kill();
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.state.velocity.multiplyScalar(0.4);
    if (this.fx) this.fx.explosion(this.state.position, 1.6);
  }
}
