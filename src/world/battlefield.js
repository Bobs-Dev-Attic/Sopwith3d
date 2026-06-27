import * as THREE from 'three';
import GroundDetail from './groundDetail.js';
import { FIELD, WORLD } from '../core/config.js';
import { sampleHeight } from './terrain.js';
import { styleFor } from '../ui/targetStyles.js';

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
    if (this._rings) for (const r of this._rings) r.mesh.visible = false;
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
    this.batteries = [];   // artillery batteries (clusters of field guns)
    this.armor = [];       // tanks & trucks of an armoured column
    this.barracks = [];    // hutted camps behind the lines
    this.railyards = [];    // supply trains in the rail head
    this._markerTex = beamTexture();

    // Front lines wander a little each sortie.
    const frontZ = (-240 - this.rng() * 80) * FIELD;
    this.frontZ = frontZ;             // no-man's-land centre (for ambience)
    this.frontSpan = 9000 * FIELD;    // how wide the trench frontage runs
    this._buildTrenchLine(frontZ);
    this._buildTrenchLine(frontZ + 520 * FIELD);
    this._buildTrenchLine(frontZ - 460 * FIELD);
    this._scatterWire(frontZ + 80 * FIELD);
    this._scatterWire(frontZ + 380 * FIELD);
    this._scatterTrees();
    this._buildRailroad();
    this._placeNests();
    this._placeBunkers();
    this._placeBalloons();
    this._placeBatteries();
    this._placeArmor();
    this._placeBarracks();
    this._placeRailyards();

    // dense atmospheric dressing (instanced + a few animated props)
    this.detail = new GroundDetail(this.root, this.rng, this.fx);

    // some emplacements are already smoking from earlier shelling
    for (const t of [...this.mgNests, ...this.bunkers]) {
      if (this.rng() < 0.4) this.detail.addFire(t.pos.x + 3, t.pos.z + 2, 0.7);
    }
  }

  get targets() {
    return [
      ...this.mgNests, ...this.bunkers, ...this.balloons,
      ...this.batteries, ...this.armor, ...this.barracks, ...this.railyards,
    ];
  }

  // drop a group onto the terrain and return the ground height there
  _seat(group, x, z) {
    const y = sampleHeight(x, z);
    group.position.set(x, y, z);
    return y;
  }

  // ---- trench line: a zig-zag of revetment walls + firing step ----
  _buildTrenchLine(z) {
    // length grows with the field; the segment grows with it too so the trench
    // stays the same number of meshes (keeps the draw-call count flat)
    const len = 9000 * FIELD;
    const seg = 80 * FIELD;
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
      const zz = z + row * 22 * FIELD;
      const pts = [];
      for (let x = -4200 * FIELD; x <= 4200 * FIELD; x += 42 * FIELD) {
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
    for (let i = 0; i < 220 * FIELD; i++) {
      const x = (rng() - 0.5) * 9500 * FIELD;
      const z = (rng() - 0.5) * 9500 * FIELD;
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
    // more nests over the bigger frontage, kept inside the combat radius so the
    // objectives stay reachable without straying into the flak
    const count = 16 + Math.floor(this.rng() * 8);
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * 13000;
      const z = -300 - this.rng() * 4200;
      this.mgNests.push(this._makeNest(x, z));
    }
  }

  _makeNest(x, z) {
    const g = new THREE.Group();
    const gy = this._seat(g, x, z);
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

    const t = new GroundTarget('mgnest', g, new THREE.Vector3(x, gy + 1.5, z), 6, 60);
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
    const count = 6 + Math.floor(this.rng() * 4);
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push([(this.rng() - 0.5) * 7200, (180 + this.rng() * 360) * FIELD]);
    }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const gy = this._seat(g, x, z);
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
      const t = new GroundTarget('bunker', g, new THREE.Vector3(x, gy + 2.5, z), 9, 100);
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
    const count = 5 + Math.floor(this.rng() * 3);
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push([(this.rng() - 0.5) * 7800, (-650 - this.rng() * 650) * FIELD]);
    }
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      this._seat(g, x, z);
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

  // ---- artillery batteries: clusters of field guns behind sandbag berms ----
  _placeBatteries() {
    const count = 4 + Math.floor(this.rng() * 3);
    for (let b = 0; b < count; b++) {
      const cx = (this.rng() - 0.5) * 11000;
      const cz = (260 + this.rng() * 900) * FIELD; // enemy rear
      const g = new THREE.Group();
      const gy = this._seat(g, cx, cz);
      const facing = Math.PI + (this.rng() - 0.5) * 0.5;
      // sandbag berm
      const berm = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1.4, 16, 1, true), M.sandbag);
      berm.position.y = 0.7; g.add(berm);
      // a row of three guns
      for (let i = 0; i < 3; i++) {
        const gun = new THREE.Group();
        gun.position.set(-7 + i * 7, 0, 0);
        gun.rotation.y = facing;
        for (const sx of [-1.2, 1.2]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 10), M.wood);
          wheel.rotation.z = Math.PI / 2; wheel.position.set(sx, 1.1, 0); gun.add(wheel);
        }
        const trail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4), M.metal);
        trail.position.set(0, 0.5, 2.2); gun.add(trail);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5.5, 10), M.metal);
        barrel.rotation.x = Math.PI / 2 - 0.3; barrel.position.set(0, 1.7, -1.8); gun.add(barrel);
        g.add(gun);
      }
      // ammo crates
      for (let i = 0; i < 4; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), M.plank);
        crate.position.set(6 + (this.rng() - 0.5) * 3, 0.6, -4 + (this.rng() - 0.5) * 4);
        g.add(crate);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.root.add(g);
      const t = new GroundTarget('battery', g, new THREE.Vector3(cx, gy + 2, cz), 13, 150);
      t.onDestroyed = () => {
        g.rotation.z = (this.rng() - 0.5) * 0.2;
        if (this.detail) {
          this.detail.addFire(cx, cz, 1.6);
          this.detail.addFire(cx + 5, cz + 4, 1.0);
        }
      };
      this.batteries.push(t);
    }
  }

  // ---- armoured column: tanks & trucks parked along a track ----
  _placeArmor() {
    const olive = M.olive || (M.olive = mat(0x434832));
    const dark = M.armorDark || (M.armorDark = mat(0x2a2c20));
    const tyre = mat(0x18160f);
    const mkTruck = (g) => {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5), olive); bed.position.y = 1.4; g.add(bed);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), dark); cab.position.set(0, 1.7, -2.2); g.add(cab);
      const tilt = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3), M.canvas); tilt.position.set(0, 2.7, 0.6); g.add(tilt);
      for (const sx of [-1.1, 1.1]) for (const sz of [-1.8, 1.8]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 8), tyre);
        w.rotation.z = Math.PI / 2; w.position.set(sx, 0.6, sz); g.add(w);
      }
    };
    const mkTank = (g) => {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6), olive); hull.position.y = 1.2; g.add(hull);
      const turret = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.4), dark); turret.position.y = 2.3; g.add(turret);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.6, 8), dark);
      gun.rotation.x = Math.PI / 2; gun.position.set(0, 2.3, -2.4); g.add(gun);
      for (const sx of [-1.7, 1.7]) {
        const track = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 6.2), M.metal);
        track.position.set(sx, 0.65, 0); g.add(track);
      }
    };
    // a couple of laagers (parking groups), each a mix of tanks & trucks
    const laagers = 2 + Math.floor(this.rng() * 2);
    for (let L = 0; L < laagers; L++) {
      const lx = (this.rng() - 0.5) * 10000;
      const lz = (120 + this.rng() * 1000) * FIELD;
      const n = 3 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const isTank = this.rng() > 0.55;
        const g = new THREE.Group();
        const x = lx + (this.rng() - 0.5) * 70;
        const z = lz + (this.rng() - 0.5) * 50;
        const gy = this._seat(g, x, z);
        g.rotation.y = this.rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
        g.rotation.y += (this.rng() - 0.5) * 0.3;
        if (isTank) mkTank(g); else mkTruck(g);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.root.add(g);
        const t = new GroundTarget(isTank ? 'tank' : 'truck', g,
          new THREE.Vector3(x, gy + 1.5, z), isTank ? 6 : 5, isTank ? 90 : 55);
        t.onDestroyed = () => {
          g.children.forEach((c) => { c.rotation.z += (this.rng() - 0.5) * 0.5; });
          if (this.detail) this.detail.addFire(x, z, isTank ? 1.2 : 0.9);
        };
        this.armor.push(t);
      }
    }
  }

  // ---- barracks: hutted camps behind the rear ----
  _placeBarracks() {
    const count = 3 + Math.floor(this.rng() * 3);
    for (let b = 0; b < count; b++) {
      const cx = (this.rng() - 0.5) * 9000;
      const cz = (500 + this.rng() * 1100) * FIELD;
      const g = new THREE.Group();
      const gy = this._seat(g, cx, cz);
      g.rotation.y = this.rng() * Math.PI;
      const rows = 2, per = 2 + Math.floor(this.rng() * 2);
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          const hut = new THREE.Group();
          hut.position.set(-((per - 1) * 7) / 2 + i * 7, 0, -8 + r * 16);
          const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 9), M.plank);
          wall.position.y = 1.3; hut.add(wall);
          const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 9.2, 8, 1, false, 0, Math.PI), M.canvas);
          roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.y = 2.6;
          hut.add(roof);
          g.add(hut);
        }
      }
      // a flagpole / central post
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 5), M.bark);
      pole.position.set(0, 3.5, 0); g.add(pole);
      g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.root.add(g);
      const t = new GroundTarget('barracks', g, new THREE.Vector3(cx, gy + 2, cz), 14, 120);
      t.onDestroyed = () => {
        g.traverse((o) => { if (o.isMesh && o.geometry.type !== 'CylinderGeometry') o.material = M.bark; });
        if (this.detail) { this.detail.addFire(cx, cz, 1.5); this.detail.addFire(cx + 6, cz - 5, 1.1); }
      };
      this.barracks.push(t);
    }
  }

  // ---- railroad: a long track with a parked supply train at a railhead ----
  _buildRailroad() {
    const rail = M.rail || (M.rail = mat(0x35332c, { metalness: 0.4, roughness: 0.6 }));
    const tie = M.tie || (M.tie = mat(0x2a2218));
    // the line runs along z behind the lines, wandering a little
    this._railX = (this.rng() - 0.5) * 6000;
    const x0 = this._railX;
    const len = WORLD.groundSize * 0.9;
    const ties = [];
    const railL = [];
    const railR = [];
    const gauge = 2.2;
    const tieGeo = new THREE.BoxGeometry(5, 0.3, 0.7);
    const step = 6;
    for (let z = -len / 2; z <= len / 2; z += step) {
      const x = x0 + Math.sin(z * 0.0004) * 400;
      const y = sampleHeight(x, z) + 0.2;
      ties.push({ p: new THREE.Vector3(x, y, z), ry: 0 });
      railL.push(new THREE.Vector3(x - gauge / 2, y + 0.35, z));
      railR.push(new THREE.Vector3(x + gauge / 2, y + 0.35, z));
    }
    // ties as one instanced mesh
    const im = new THREE.InstancedMesh(tieGeo, tie, ties.length);
    const mtx = new THREE.Matrix4();
    ties.forEach((t, i) => { mtx.makeTranslation(t.p.x, t.p.y, t.p.z); im.setMatrixAt(i, mtx); });
    im.instanceMatrix.needsUpdate = true;
    im.receiveShadow = true;
    this.root.add(im);
    // the two rails as tube-ish lines
    const railMat = new THREE.LineBasicMaterial({ color: 0x6a6660 });
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(railL), railMat));
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(railR), railMat));
    this._rail = rail;
  }

  // a supply train (loco + wagons) parked on the line — a juicy target
  _placeRailyards() {
    const count = 2 + Math.floor(this.rng() * 2);
    const steel = M.rail;
    const olive = M.olive || (M.olive = mat(0x434832));
    for (let r = 0; r < count; r++) {
      const z0 = (this.rng() - 0.5) * WORLD.groundSize * 0.5;
      const x = this._railX + Math.sin(z0 * 0.0004) * 400;
      const g = new THREE.Group();
      const gy = this._seat(g, x, z0);
      // locomotive
      const loco = new THREE.Group();
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 6, 12), steel);
      boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 1.8, -1); loco.add(boiler);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 2.6), M.metal); cab.position.set(0, 2.2, 3); loco.add(cab);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8), steel); stack.position.set(0, 3.4, -3.4); loco.add(stack);
      loco.position.set(0, 0, 0); g.add(loco);
      // a few wagons trailing along +z
      const wagons = 3 + Math.floor(this.rng() * 3);
      for (let i = 0; i < wagons; i++) {
        const wag = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 6.5), i % 2 ? olive : M.plank);
        wag.position.set(0, 1.6, 8 + i * 7.2); g.add(wag);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.root.add(g);
      const t = new GroundTarget('train', g, new THREE.Vector3(x, gy + 2, z0), 14, 130);
      t.onDestroyed = () => {
        g.children.forEach((c, i) => { c.rotation.z += (this.rng() - 0.5) * 0.3; c.position.y -= 0.3; });
        if (this.detail) {
          this.detail.addFire(x, z0, 1.8);
          this.detail.addFire(x, z0 + 9, 1.2);
        }
      };
      this.railyards.push(t);
    }
  }

  // attach a glowing objective beam + radiating ground rings to a target
  markObjective(target) {
    if (target._marker) {
      target._marker.visible = true;
      if (target._rings) for (const r of target._rings) r.mesh.visible = true;
      return;
    }
    const st = styleFor(target.type);
    const tint = new THREE.Color(st.color);
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 260),
      new THREE.MeshBasicMaterial({
        map: this._markerTex, color: tint, transparent: true,
        opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    beam.position.set(target.pos.x, 130, target.pos.z);
    target._marker = beam;
    beam.userData.spin = true;
    this.scene.add(beam);

    // expanding/fading ground rings that radiate out from the target
    if (!this._ringGeo) {
      this._ringGeo = new THREE.RingGeometry(0.86, 1.0, 44);
      this._ringGeo.rotateX(-Math.PI / 2);
    }
    const gy = sampleHeight(target.pos.x, target.pos.z) + 0.6;
    const r0 = target.radius * 1.3;
    const r1 = r0 + 46;
    target._rings = [];
    for (let i = 0; i < 2; i++) {                 // two rings, half a cycle apart
      const mesh = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({
        color: tint, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }));
      mesh.position.set(target.pos.x, gy, target.pos.z);
      this.scene.add(mesh);
      target._rings.push({ mesh, phase: i * 0.5, r0, r1 });
    }
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
      if (t._rings) {
        for (const r of t._rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
      }
    }
    if (this._ringGeo) this._ringGeo.dispose();
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
      // radiating rings: each ring grows and fades on a repeating cycle
      if (t._rings && t.alive) {
        for (const r of t._rings) {
          r.phase = (r.phase + dt * 0.7) % 1;       // ~1.4s per pulse
          const p = r.phase;
          const rad = r.r0 + (r.r1 - r.r0) * p;
          r.mesh.scale.set(rad, rad, rad);
          r.mesh.material.opacity = 0.6 * Math.min(1, p * 6) * (1 - p);
        }
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
