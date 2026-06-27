import * as THREE from 'three';
import { FIELD } from '../core/config.js';
import { sampleHeight } from './terrain.js';

// Makes the front feel like a chaotic, dangerous place to be flying over:
// artillery shells bursting across no-man's-land, muzzle flashes winking along
// the trench lines, and tracer fire streaking between the opposing trenches.
// All of it is biased to the patch of front the player is over (so it's where
// you can see it) and the sound is distance-attenuated.
export default class BattlefieldAmbience {
  constructor(scene, fx, audio, rng) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.rng = rng || Math.random;
    this.active = false;
    this.frontZ = -240 * FIELD;
    this.frontSpan = 9000 * FIELD;
    this.focus = new THREE.Vector3();

    this._impactT = 0;
    this._flashT = 0;
    this._tracerT = 0;

    // pool of tracer streaks (thin bright additive bars)
    this._tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this._fwd = new THREE.Vector3(0, 0, 1);
    this._dir = new THREE.Vector3();
    this._tracers = [];
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd070, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this._tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._tracers.push({ mesh, mat, active: false, a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, dur: 1, len: 20, color: new THREE.Color() });
    }
  }

  configure(frontZ, frontSpan) {
    if (Number.isFinite(frontZ)) this.frontZ = frontZ;
    if (Number.isFinite(frontSpan)) this.frontSpan = frontSpan;
  }

  setFocus(pos) { this.focus.copy(pos); }

  reset() {
    this._impactT = 0.4;
    this._flashT = 0.1;
    this._tracerT = 0.2;
    for (const tr of this._tracers) { tr.active = false; tr.mesh.visible = false; tr.mat.opacity = 0; }
  }

  // a random point along the front near the player
  _frontPoint(spread, depth) {
    const half = this.frontSpan * 0.5;
    let x = this.focus.x + (this.rng() - 0.5) * spread;
    x = Math.max(-half, Math.min(half, x));
    const z = this.frontZ + (this.rng() - 0.5) * depth;
    return { x, z };
  }

  update(dt) {
    if (!this.active) return;
    this._impacts(dt);
    this._flashes(dt);
    this._spawnTracers(dt);
    this._stepTracers(dt);
  }

  // ---- artillery shell bursts walking across no-man's-land ----
  _impacts(dt) {
    this._impactT -= dt;
    if (this._impactT > 0) return;
    this._impactT = 0.28 + this.rng() * 0.65;     // a shell every ~0.3–0.9s

    const big = this.rng() < 0.16;
    const { x, z } = this._frontPoint(6000, 1500 * FIELD);
    const y = sampleHeight(x, z);
    const pos = new THREE.Vector3(x, y + 0.5, z);
    const scale = big ? 1.8 + this.rng() * 1.0 : 0.7 + this.rng() * 0.8;
    this.fx.groundBurst(pos, scale);

    // distance-attenuated thump; far shells are a muffled rumble
    const dist = this.focus.distanceTo(pos);
    const vol = Math.max(0.12, (big ? 1.4 : 1.0) - dist / (900 * FIELD));
    if (vol > 0.14) this.audio.explosion(vol);
  }

  // ---- muzzle flashes winking along the trench lines ----
  _flashes(dt) {
    this._flashT -= dt;
    if (this._flashT > 0) return;
    this._flashT = 0.04 + this.rng() * 0.11;

    const rows = [this.frontZ + 250 * FIELD, this.frontZ, this.frontZ - 240 * FIELD];
    const n = 1 + (this.rng() * 3 | 0);
    let nearest = 1e9;
    for (let i = 0; i < n; i++) {
      const half = this.frontSpan * 0.5;
      let x = this.focus.x + (this.rng() - 0.5) * 4200;
      x = Math.max(-half, Math.min(half, x));
      const z = rows[(this.rng() * rows.length) | 0] + (this.rng() - 0.5) * 30;
      const y = sampleHeight(x, z) + 1.8;
      const p = new THREE.Vector3(x, y, z);
      this.fx.muzzleFlash(p);
      nearest = Math.min(nearest, this.focus.distanceTo(p));
    }
    // an occasional faint rattle of small-arms when it's close
    if (this.rng() < 0.5) {
      const v = Math.max(0, 0.22 * (1 - nearest / (700 * FIELD)));
      if (v > 0.03) this.audio.gun(v);
    }
  }

  // ---- tracer fire arcing between the opposing trenches ----
  _spawnTracers(dt) {
    this._tracerT -= dt;
    if (this._tracerT > 0) return;
    this._tracerT = 0.05 + this.rng() * 0.16;

    const tr = this._tracers.find((t) => !t.active);
    if (!tr) return;
    const half = this.frontSpan * 0.5;
    let x = this.focus.x + (this.rng() - 0.5) * 4000;
    x = Math.max(-half, Math.min(half, x));
    const fromFriendly = this.rng() > 0.5;
    const za = this.frontZ + (fromFriendly ? 250 : -240) * FIELD;
    const zb = this.frontZ + (fromFriendly ? -240 : 250) * FIELD;
    const drift = (this.rng() - 0.5) * 140;
    tr.a.set(x, sampleHeight(x, za) + 2.5, za);
    tr.b.set(x + drift, sampleHeight(x + drift, zb) + 2.5 + (this.rng() - 0.5) * 6, zb);
    tr.color.setHex(fromFriendly ? 0xffe06a : 0xff5a3a);
    const L = tr.a.distanceTo(tr.b);
    tr.len = 16 + this.rng() * 12;
    tr.dur = L / (480 + this.rng() * 220);
    tr.t = 0;
    tr.active = true;
    tr.mesh.visible = true;
  }

  _stepTracers(dt) {
    for (const tr of this._tracers) {
      if (!tr.active) continue;
      tr.t += dt / tr.dur;
      if (tr.t >= 1) { tr.active = false; tr.mesh.visible = false; tr.mat.opacity = 0; continue; }
      this._dir.subVectors(tr.b, tr.a);
      const L = this._dir.length();
      this._dir.normalize();
      const headD = tr.t * L;
      const mid = headD - tr.len * 0.5;
      tr.mesh.position.copy(tr.a).addScaledVector(this._dir, Math.max(0, mid));
      tr.mesh.quaternion.setFromUnitVectors(this._fwd, this._dir);
      tr.mesh.scale.set(0.6, 0.6, Math.min(tr.len, headD));
      tr.mat.color.copy(tr.color);
      // bright, with a flicker, fading over the last third of flight
      const fade = tr.t < 0.7 ? 1 : 1 - (tr.t - 0.7) / 0.3;
      tr.mat.opacity = (0.7 + this.rng() * 0.3) * fade;
    }
  }

  dispose() {
    for (const tr of this._tracers) { this.scene.remove(tr.mesh); tr.mat.dispose(); }
    this._tracerGeo.dispose();
  }
}
