import * as THREE from 'three';
import { buildCamel } from './models.js';
import { integrateFlight } from './flight.js';
import { bankAngle } from './steering.js';
import { PLANE } from '../core/config.js';

// Deadzone + expo response curve for the flight stick.
function shapeStick(x) {
  const s = Math.sign(x);
  let a = Math.abs(x);
  if (a < PLANE.stickDeadzone) return 0;
  a = (a - PLANE.stickDeadzone) / (1 - PLANE.stickDeadzone);
  return s * Math.pow(a, PLANE.stickExpo);
}

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
    this._pitchInput = 0;
    this._bankInput = 0;
    this._steerOverride = null;
    this.params = PLANE;

    // assist options (set from settings each sortie)
    this.flightAssist = false;
    this.unlimitedFuel = false;
    this.damageScale = 1;
    this._fwd = new THREE.Vector3();

    this.hull = PLANE.hull;
    this.maxHull = PLANE.hull;
    this.alive = true;
    this.bombs = PLANE.bombCount;
    this.fuel = PLANE.fuel;
    this.maxFuel = PLANE.fuel;
    this.fuelOut = false;
    this.commandedThrottle = PLANE.startThrottle;
    this.rpm = PLANE.rpmIdle;
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
    this.commandedThrottle = PLANE.startThrottle;
    this.hull = this.maxHull;
    this.alive = true;
    this.bombs = PLANE.bombCount;
    this.fuel = this.maxFuel;
    this.fuelOut = false;
    this.rpm = PLANE.rpmIdle;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this._syncTransform();
  }

  setStick(pitch, yaw) {
    // Shape the raw stick so small movements are gentle (expo) and tiny jitter
    // near centre is ignored (deadzone). Full deflection still gives full input.
    // Stored as inputs; controls are derived in update() (bank-angle control).
    this._pitchInput = shapeStick(pitch);
    this._bankInput = shapeStick(yaw);
  }

  // Patrol-boundary (or any autopilot) can blend its own stick commands over
  // the player's for one frame, weighted by k in [0,1].
  setSteer(controls, k) { this._steerOverride = { controls, k }; }

  // Bank-angle control: stick X commands a target bank that the plane settles
  // onto and holds (auto-levelling when centred), giving a smooth coordinated
  // turn instead of a continuous roll.
  _computeControls() {
    const targetBank = this._bankInput * PLANE.maxBank;
    const bank = bankAngle(this.state.quaternion);
    this.controls.roll = THREE.MathUtils.clamp((targetBank - bank) * PLANE.rollGain, -1, 1);
    // automatic back-pressure scaled to how steeply we're banked — holds the
    // nose up through a turn so it stays coordinated instead of spiralling down
    const turnPull = Math.abs(bank) * PLANE.turnPull;
    let pitch = this._pitchInput + turnPull;
    // Flight Assist: with the stick near centre, gently bring the nose back to
    // the horizon so the plane settles into level flight on its own.
    if (this.flightAssist && Math.abs(this._pitchInput) < 0.12 && Math.abs(this._bankInput) < 0.25) {
      this._fwd.set(0, 0, -1).applyQuaternion(this.state.quaternion);
      pitch += THREE.MathUtils.clamp(-this._fwd.y * 1.6, -0.5, 0.5);
    }
    this.controls.pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    this.controls.yaw = this._bankInput * PLANE.coordYaw;

    if (this._steerOverride) {
      const { controls: c, k } = this._steerOverride;
      this.controls.roll = THREE.MathUtils.lerp(this.controls.roll, c.roll, k);
      this.controls.pitch = THREE.MathUtils.lerp(this.controls.pitch, c.pitch, k);
      this.controls.yaw = THREE.MathUtils.lerp(this.controls.yaw, c.yaw, k);
      this._steerOverride = null;
    }
  }

  setThrottle(t) { this.commandedThrottle = THREE.MathUtils.clamp(t, 0, 1); }

  update(dt) {
    if (!this.alive) { this._updateWreck(dt); return; }

    this._burnFuel(dt);
    this._computeControls();
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

  _burnFuel(dt) {
    if (this.unlimitedFuel) {
      this.fuel = this.maxFuel;
      this.fuelOut = false;
      this.state.throttle = this.commandedThrottle;
      this.rpm = THREE.MathUtils.lerp(PLANE.rpmIdle, PLANE.rpmMax, this.commandedThrottle);
      return;
    }
    if (this.fuel > 0) {
      const burn = (PLANE.fuelBurnIdle +
        this.commandedThrottle * (PLANE.fuelBurnFull - PLANE.fuelBurnIdle)) * dt;
      this.fuel = Math.max(0, this.fuel - burn);
    }
    this.fuelOut = this.fuel <= 0;
    // dry tank => dead engine; she still flies, but as a glider now
    this.state.throttle = this.fuelOut ? 0 : this.commandedThrottle;
    if (this.fuelOut) {
      const windmill = THREE.MathUtils.clamp(this.state.speed / this.params.cruiseSpeed, 0, 0.45);
      this.rpm = windmill * PLANE.rpmIdle;
    } else {
      this.rpm = THREE.MathUtils.lerp(PLANE.rpmIdle, PLANE.rpmMax, this.commandedThrottle);
    }
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
    this.hull = Math.max(0, this.hull - amount * this.damageScale);
    if (this.hull <= 0) this.kill();
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    if (this.fx) this.fx.explosion(this.state.position, 2.0);
  }
}
