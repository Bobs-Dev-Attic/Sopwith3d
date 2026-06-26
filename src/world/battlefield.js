import * as THREE from 'three';
import GroundDetail from './groundDetail.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });

const M = {
  wood: mat(0x4a3a22),
  sandbag: mat(0x6e6240),
  sandbagDark: mat(0x4d4530),
  metal: mat(0x3a3a34, { metalness: 0.4, roughness: 0.6 }),
  plank: mat(0x55402a),
  canvas: mat(0x7a6b3a),
  bark: mat(0x2e2618),
};

// A destructible thing sitting on the ground (nest, bunker, balloon).
class GroundTarget {
  constructor(type, group, pos, radius, hull) {
    this.type = type;
    this.group = group;
    this.pos = pos.clone();
    this.radius = radius;
    this.hull = hull;
    this.maxHull = hull;
    this.alive = true;
    this.faction = 'enemy';
    this.objective = false;
    this._marker = null;
    this.onDestroyed = null;
  }
  hit(dmg) {
    if (!this.alive) return;
    this.hull -= dmg;
    if (this.hull <= 0) this.destroy();
  }
  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this._marker) this._marker.visible = false;
    if (this.onDestroyed) this.onDestroyed(this);
  }
}

export default class Battlefield {
  constructor(scene, fx, seed = 1) {
    this.scene = scene;
    this.fx = fx;
    this.seed = seed;
    this.rng = rand(seed);            // every sortie lays out differently
    this.root = new THREE.Group();
    scene.add(this.root);
    this.mgNests = [];
    this.bunkers = [];
    this.balloons = [];
    this._markerTex = beamTexture();

    // Front lines wander a little each sortie.
    const frontZ = -240 - this.rng() * 80;
    this._buildTrenchLine(frontZ);
    this._buildTrenchLine(frontZ + 520);
    this._buildTrenchLine(frontZ - 460);
    this._scatterWire(frontZ + 80);
    this._scatterWire(frontZ + 380);
    this._scatterTrees();
    this._placeNests();
    this._placeBunkers();
    this._placeBalloons();

    // dense atmospheric dressing (instanced + a few animated props)
    this.detail = new GroundDetail(this.root, this.rng, this.fx);

    // some emplacements are already smoking from earlier shelling
    for (const t of [...this.mgNests, ...this.bunkers]) {
      if (this.rng() < 0.4) this.detail.addFire(t.pos.x + 3, t.pos.z + 2, 0.7);
    }
  }

  get targets() {
    return [...this.mgNests, ...this.bunkers, ...this.balloons];
  }

  // ---- trench line: a zig-zag of revetment walls + firing step ----
  _buildTrenchLine(z) {
    const len = 9000;
    const seg = 80;
    const count = Math.floor(len / seg);
    for (let i = 0; i < count; i++) {
      const x = -len / 2 + i * seg;
      const zz = z + Math.sin(i * 0.9) * 28; // traverse zig-zag
      // parapet wall
      const wall = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.95, 5, 6), M.sandbag);
      wall.position.set(x, 2.5, zz - 8);
      wall.castShadow = wall.receiveShadow = true;
      this.root.add(wall);
      const back = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.95, 4, 5), M.sandbagDark);
      back.position.set(x, 2, zz + 8);
      back.receiveShadow = true;
      this.root.add(back);
      // duckboard floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.95, 0.4, 16), M.plank);
      floor.position.set(x, 0.2, zz);
      floor.receiveShadow = true;
      this.root.add(floor);
      // occasional support post
      if (i % 3 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood);
        post.position.set(x, 3, zz - 11);
        this.root.add(post);
      }
    }
  }

  _scatterWire(z) {
    const rng = rand(z + 99 + this.seed);
    const postGeo = new THREE.CylinderGeometry(0.18, 0.18, 3, 5);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2620, transparent: true, opacity: 0.6 });
    for (let row = 0; row < 3; row++) {
      const zz = z + row * 22;
      const pts = [];
      for (let x = -4200; x <= 4200; x += 42) {
        const post = new THREE.Mesh(postGeo, M.bark);
        const h = 2.6 + rng() * 0.8;
        post.scale.y = h / 3;
        post.position.set(x, h / 2, zz + (rng() - 0.5) * 6);
        this.root.add(post);
        pts.push(new THREE.Vector3(post.position.x, 1.6 + Math.sin(x) * 0.6, post.position.z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.root.add(new THREE.Line(geo, lineMat));
    }
  }

  _scatterTrees() {
    const rng = rand(123 + this.seed);
    for (let i = 0; i < 220; i++) {
      const x = (rng() - 0.5) * 9500;
      const z = (rng() - 0.5) * 9500;
      if (Math.abs(z) < 60) continue;
      const h = 4 + rng() * 9;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.6, h, 6),
        M.bark
      );
      // shattered, leaning stumps
      trunk.position.set(x, h / 2, z);
      trunk.rotation.z = (rng() - 0.5) * 0.5;
      trunk.castShadow = true;
      this.root.add(trunk);
    }
  }

  _placeNests() {
    // scatter machine-gun nests widely across the whole enemy frontage so the
    // objectives are spread out and you have to range across the lines
    const count = 12 + Math.floor(this.rng() * 4);
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * 5200;
      const z = -200 - this.rng() * 1700;
      this.mgNests.push(this._makeNest(x, z));
    }
  }

  _makeNest(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    // sandbag ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 2.4, 12, 1, true), M.sandbag);
    ring.position.y = 1.2;
    ring.castShadow = ring.receiveShadow = true;
    g.add(ring);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 12), M.sandbagDark);
    g.add(floor);
    // the gun
    const mount = new THREE.Group();
    mount.position.y = 1.6;
    const tripod = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4), M.metal);
    tripod.position.y = -0.3;
    mount.add(tripod);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), M.metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.2;
    mount.add(barrel);
    g.add(mount);
    this.root.add(g);

    const t = new GroundTarget('mgnest', g, new THREE.Vector3(x, 1.5, z), 6, 60);
    t.mount = mount;
    t.barrel = barrel;
    t.cooldown = 1 + Math.random();
    t.range = 1100;
    t.update = (dt, player, fireCb) => this._updateNest(t, dt, player, fireCb);
    t.onDestroyed = () => {
      mount.visible = false;
      ring.material = M.sandbagDark;
      if (this.detail) this.detail.addFire(t.pos.x, t.pos.z, 1.1);
    };
    return t;
  }

  _updateNest(t, dt, player, fireCb) {
    if (!t.alive || !player || !player.alive) return;
    const toP = player.state.position.clone().sub(t.pos);
    const dist = toP.length();
    if (dist > t.range) return;
    // track the player
    const aim = Math.atan2(toP.x, toP.z);
    t.mount.rotation.y = aim;
    const pitch = Math.atan2(toP.y, Math.sqrt(toP.x * toP.x + toP.z * toP.z));
    t.mount.rotation.x = -pitch * 0.6;
    t.cooldown -= dt;
    if (t.cooldown <= 0) {
      t.cooldown = 0.9 + Math.random() * 0.5;
      // lead the target
      const tof = dist / 540;
      const aimPt = player.state.position.clone()
        .addScaledVector(player.state.velocity, tof);
      const muzzle = t.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
      const dir = aimPt.sub(muzzle).normalize();
      // a bit of scatter
      dir.x += (Math.random() - 0.5) * 0.04;
      dir.y += (Math.random() - 0.5) * 0.04;
      if (fireCb) fireCb(muzzle, dir.normalize());
      if (this.fx) this.fx.muzzleFlash(muzzle);
    }
  }

  _placeBunkers() {
    const count = 4 + Math.floor(this.rng() * 2);
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push([(this.rng() - 0.5) * 2400, 180 + this.rng() * 360]);
    }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 10), M.sandbagDark);
      body.position.y = 2.5;
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 1.2, 11), M.wood);
      roof.position.y = 5.4;
      g.add(roof);
      // sandbag topping
      for (let i = 0; i < 6; i++) {
        const sb = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), M.sandbag);
        sb.position.set(-6 + i * 2.4, 6.2, (i % 2 ? 1 : -1) * 3);
        g.add(sb);
      }
      this.root.add(g);
      const t = new GroundTarget('bunker', g, new THREE.Vector3(x, 2.5, z), 9, 100);
      t.onDestroyed = () => {
        body.material = M.bark;
        roof.rotation.z = 0.3;
        roof.position.y = 4.5;
        if (this.detail) this.detail.addFire(t.pos.x, t.pos.z, 1.4);
      };
      this.bunkers.push(t);
    }
  }

  _placeBalloons() {
    const count = 3 + Math.floor(this.rng() * 2);
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push([(this.rng() - 0.5) * 2600, -650 - this.rng() * 650]);
    }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const envelope = new THREE.Mesh(
        new THREE.SphereGeometry(14, 16, 12),
        mat(0x8a7a4a, { roughness: 0.8 })
      );
      envelope.scale.set(1, 1.3, 1.6);
      envelope.position.y = 150;
      envelope.castShadow = true;
      g.add(envelope);
      // fins
      const finMat = mat(0x6a5d34);
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 7), finMat);
        fin.position.set(0, 150, 20);
        fin.rotation.z = (i / 3) * Math.PI * 2;
        g.add(fin);
      }
      const basket = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), M.wood);
      basket.position.y = 128;
      g.add(basket);
      // tether
      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 126, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0x222018 })
      );
      g.add(tether);
      this.root.add(g);

      const t = new GroundTarget('balloon', g, new THREE.Vector3(x, 150, z), 16, 50);
      t.envelope = envelope;
      t.bob = Math.random() * Math.PI * 2;
      t.update = (dt) => {
        t.bob += dt * 0.6;
        envelope.position.y = 150 + Math.sin(t.bob) * 4;
        t.pos.y = envelope.position.y;
      };
      t.onDestroyed = () => {
        envelope.scale.set(0.4, 0.3, 0.4);
        envelope.material = mat(0x2a241a);
      };
      this.balloons.push(t);
    }
  }

  // attach a glowing objective beam to a target
  markObjective(target) {
    if (target._marker) { target._marker.visible = true; return; }
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 260),
      new THREE.MeshBasicMaterial({
        map: this._markerTex, color: 0xe8c46a, transparent: true,
        opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    beam.position.set(target.pos.x, 130, target.pos.z);
    target._marker = beam;
    beam.userData.spin = true;
    this.scene.add(beam);
  }

  dispose() {
    if (this.detail) this.detail.dispose();
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const t of this.targets) {
      if (t._marker) {
        this.scene.remove(t._marker);
        t._marker.geometry.dispose();
      }
    }
  }

  update(dt, player, fireCb, camera) {
    if (this.detail) this.detail.update(dt, this.fx);
    this._markerT = (this._markerT || 0) + dt;
    const pulse = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(this._markerT * 3.2));
    for (const t of this.targets) {
      if (t.update) t.update(dt, player, fireCb);
      if (t._marker && t._marker.visible && camera) {
        t._marker.lookAt(camera.position.x, t._marker.position.y, camera.position.z);
        t._marker.material.opacity = pulse;  // fade in and out
      }
    }
  }
}

// utilities
function rand(seed) {
  let s = seed | 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(232,196,106,0)');
  g.addColorStop(1, 'rgba(232,196,106,0.8)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}
