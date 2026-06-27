import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD } from '../core/config.js';
import { sampleHeight } from './terrain.js';

// Dense, atmospheric battlefield dressing. Everything repeated hundreds of
// times is an InstancedMesh (one draw call); only a few unique props (ruins,
// vehicles, field guns, smoke columns) are individual objects. Animated things
// (marching infantry, trucks/tanks, recoiling guns, smoulder) update each frame.

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, ...o });

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(70,66,60,0.8)');
  g.addColorStop(0.6, 'rgba(45,42,38,0.4)');
  g.addColorStop(1, 'rgba(30,28,24,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Denser, lumpier puff for the tall smoke columns so they read as solid plumes
// rather than thin wisps. White core so the per-sprite tint sets the colour.
function plumeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  // a few overlapping soft blobs give a billowy edge
  const blob = (cx, cy, r, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  };
  blob(64, 64, 60, 0.95);
  blob(46, 52, 34, 0.7);
  blob(82, 70, 38, 0.7);
  blob(58, 82, 30, 0.6);
  return new THREE.CanvasTexture(c);
}

// crude infantryman: body + head + helmet merged into one geometry
function soldierGeo() {
  const body = new THREE.CapsuleGeometry(0.22, 0.6, 3, 6); body.translate(0, 0.62, 0);
  const head = new THREE.SphereGeometry(0.17, 6, 5); head.translate(0, 1.18, 0);
  const helmet = new THREE.SphereGeometry(0.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  helmet.translate(0, 1.22, 0);
  return mergeGeometries([body, head, helmet].map((g) => g.toNonIndexed()), false);
}

export default class GroundDetail {
  constructor(root, rng, fx) {
    this.root = root;
    this.rng = rng || Math.random;
    this.fx = fx;
    this._mats = [];
    this._textures = [];
    this._anim = { soldiers: null, vehicles: [], guns: [], fires: [] };
    this._smokeCols = [];
    this._t = 0;

    this._soldierGeo = soldierGeo();

    this._stumps();
    this._craters();
    this._sandbags();
    this._wireExtra();
    this._deadBodies();
    this._mines();
    this._depots();
    this._ruins();
    this._artillery();
    this._vehicles();
    this._fires();
    this._smokeColumns();
    this._soldiers();   // animated, last
  }

  _M(c, o) { const m = mat(c, o); this._mats.push(m); return m; }

  // place an instanced mesh from a list of {p:Vec3, r:Euler-y, s:scale}
  _instanced(geo, material, list, { cast = false, receive = true } = {}) {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0);
      q.setFromEuler(e);
      sc.set(it.s ?? 1, it.sy ?? it.s ?? 1, it.s ?? 1);
      mtx.compose(it.p, q, sc);
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    this.root.add(im);
    return im;
  }

  _scatter(n, fx, fz, fr) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = fx(this.rng());
      const z = fz(this.rng());
      out.push({ p: new THREE.Vector3(x, 0, z), ry: this.rng() * Math.PI * 2, s: fr ? fr(this.rng()) : 1 });
    }
    return out;
  }

  // ---- shattered tree stumps ----
  _stumps() {
    const geo = new THREE.CylinderGeometry(0.35, 0.6, 3, 5);
    geo.translate(0, 1.5, 0);
    // jagged top by shearing a couple verts
    const list = this._scatter(150 * FIELD, (r) => (r - 0.5) * 9000 * FIELD, (r) => (r - 0.5) * 9000 * FIELD,
      (r) => 0.5 + r * 1.1);
    list.forEach((it) => { it.rz = (this.rng() - 0.5) * 0.4; });
    this._instanced(geo, this._M(0x2c2418), list, { cast: true });
  }

  // ---- bomb crater scorch discs ----
  _craters() {
    const geo = new THREE.CircleGeometry(1, 12);
    geo.rotateX(-Math.PI / 2);
    // dense cratering, heaviest through the churned central ground
    const list = this._scatter(190 * FIELD, (r) => (r - 0.5) * 8000 * FIELD, (r) => (r - 0.5) * 3400 * FIELD,
      (r) => 6 + r * 26);
    list.forEach((it) => { it.p.y = 0.15; });
    this._instanced(geo, this._M(0x1d190f, { roughness: 1 }), list, { cast: false });
  }

  // ---- sandbag piles / low walls ----
  _sandbags() {
    const geo = new THREE.BoxGeometry(1.6, 0.7, 1.0);
    const list = [];
    // clustered into short walls
    for (let w = 0; w < 36 * FIELD; w++) {
      const bx = (this.rng() - 0.5) * 4000 * FIELD;
      const bz = (-200 - this.rng() * 700) * FIELD;
      const ang = this.rng() * Math.PI;
      const len = 3 + Math.floor(this.rng() * 5);
      for (let i = 0; i < len; i++) {
        const x = bx + Math.cos(ang) * i * 1.5;
        const z = bz + Math.sin(ang) * i * 1.5;
        list.push({ p: new THREE.Vector3(x, 0.35, z), ry: ang });
        if (this.rng() > 0.5) list.push({ p: new THREE.Vector3(x, 1.0, z + 0.2), ry: ang });
      }
    }
    this._instanced(geo, this._M(0x6e6240), list, { cast: true });
  }

  // a few extra barbed-wire belts in no-man's-land
  _wireExtra() {
    const postGeo = new THREE.CylinderGeometry(0.16, 0.16, 2.6, 5);
    postGeo.translate(0, 1.3, 0);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2620, transparent: true, opacity: 0.5 });
    this._mats.push(lineMat);
    for (let b = 0; b < 4 * FIELD; b++) {
      const z = (-120 - this.rng() * 500) * FIELD;
      const posts = [];
      const pts = [];
      for (let x = -3500 * FIELD; x <= 3500 * FIELD; x += 45) {
        posts.push({ p: new THREE.Vector3(x, 0, z + (this.rng() - 0.5) * 8) });
        pts.push(new THREE.Vector3(x, 1.4 + Math.sin(x * 0.7) * 0.4, z));
      }
      this._instanced(postGeo, this._M(0x2e2618), posts, { cast: false });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.root.add(line);
    }
  }

  // ---- the fallen, prone in the mud ----
  _deadBodies() {
    const list = this._scatter(110 * FIELD, (r) => (r - 0.5) * 6000 * FIELD, (r) => (r - 0.5) * 1600 * FIELD, () => 1);
    list.forEach((it) => { it.p.y = 0.15; it.rx = Math.PI / 2; it.rz = (this.rng() - 0.5) * 0.6; });
    this._instanced(this._soldierGeo, this._M(0x4a4636), list, { cast: false });
  }

  // ---- minefields: patches of little domes + warning posts ----
  _mines() {
    const geo = new THREE.SphereGeometry(0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const list = [];
    const signs = [];
    for (let f = 0; f < 6 * FIELD; f++) {
      const cx = (this.rng() - 0.5) * 5000 * FIELD;
      const cz = (-150 - this.rng() * 900) * FIELD;
      for (let i = 0; i < 26; i++) {
        list.push({ p: new THREE.Vector3(cx + (this.rng() - 0.5) * 160, 0.1, cz + (this.rng() - 0.5) * 160) });
      }
      signs.push({ p: new THREE.Vector3(cx, 0, cz - 90), ry: this.rng() });
    }
    this._instanced(geo, this._M(0x26241c, { metalness: 0.3, roughness: 0.6 }), list, { cast: false });
    // warning posts
    const postGeo = new THREE.BoxGeometry(0.15, 1.6, 0.15); postGeo.translate(0, 0.8, 0);
    this._instanced(postGeo, this._M(0x3a2f1e), signs, { cast: true });
  }

  // ---- supply depots: crates, barrels, tents ----
  _depots() {
    const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 8); barrelGeo.translate(0, 0.7, 0);
    const crates = [];
    const barrels = [];
    const tents = [];
    for (let d = 0; d < 6 * FIELD; d++) {
      const cx = (this.rng() - 0.5) * 4200 * FIELD;
      const cz = (200 + this.rng() * 700) * FIELD; // friendly rear
      for (let i = 0; i < 14; i++) {
        const x = cx + (this.rng() - 0.5) * 26, z = cz + (this.rng() - 0.5) * 26;
        const stack = this.rng() > 0.6 ? 2 : 1;
        for (let s = 0; s < stack; s++) crates.push({ p: new THREE.Vector3(x, 0.7 + s * 1.4, z), ry: this.rng() });
      }
      for (let i = 0; i < 8; i++) barrels.push({ p: new THREE.Vector3(cx + (this.rng() - 0.5) * 24, 0, cz + (this.rng() - 0.5) * 24) });
      tents.push({ x: cx, z: cz });
    }
    this._instanced(crateGeo, this._M(0x5b4127), crates, { cast: true });
    this._instanced(barrelGeo, this._M(0x444a3a, { metalness: 0.3 }), barrels, { cast: true });
    // tents (individual cones)
    const tentMat = this._M(0x55563f);
    for (const t of tents) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.2, 5), tentMat);
      tent.position.set(t.x + 8, 1.6, t.z + 8); tent.castShadow = true;
      this.root.add(tent);
    }
  }

  // ---- ruined buildings (broken walls) ----
  _ruins() {
    const stone = this._M(0x6a6358);
    const stoneDark = this._M(0x4c4640);
    for (let b = 0; b < 9 * FIELD; b++) {
      const g = new THREE.Group();
      const x = (this.rng() - 0.5) * 7000 * FIELD;
      const z = (this.rng() - 0.5) * 4000 * FIELD;
      g.position.set(x, 0, z);
      g.rotation.y = this.rng() * Math.PI;
      const w = 6 + this.rng() * 6, d = 5 + this.rng() * 5;
      // jagged walls of varying height
      const walls = [
        [0, -d / 2, w, 0.7 + this.rng() * 3.5],
        [-w / 2, 0, d, 0.5 + this.rng() * 3],
        [w / 2, 0, d, 0.5 + this.rng() * 2.5],
      ];
      for (const [wx, wz, wlen, h] of walls) {
        const horiz = wz !== 0;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(horiz ? wlen : 0.6, h, horiz ? 0.6 : wlen),
          this.rng() > 0.5 ? stone : stoneDark
        );
        wall.position.set(wx, h / 2, wz);
        wall.castShadow = wall.receiveShadow = true;
        g.add(wall);
      }
      // rubble
      for (let i = 0; i < 5; i++) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), stoneDark);
        r.position.set((this.rng() - 0.5) * w, 0.3, (this.rng() - 0.5) * d);
        g.add(r);
      }
      this.root.add(g);
      if (this.rng() > 0.4) this._anim.fires.push({ x: x + (this.rng() - 0.5) * 4, z: z + (this.rng() - 0.5) * 4 });
    }
  }

  // ---- field artillery that recoils & flashes ----
  _artillery() {
    const metal = this._M(0x3a3a32, { metalness: 0.4, roughness: 0.6 });
    const wood = this._M(0x4a3a22);
    for (let i = 0; i < 5 * FIELD; i++) {
      const g = new THREE.Group();
      const x = (this.rng() - 0.5) * 4000 * FIELD;
      const z = (260 + this.rng() * 800) * FIELD;
      g.position.set(x, 0, z);
      g.rotation.y = Math.PI + (this.rng() - 0.5) * 0.6; // aimed toward the front
      // wheels
      for (const sx of [-1.2, 1.2]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 12), wood);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx, 1.1, 0); g.add(wheel);
      }
      // trail legs
      const trail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4), metal);
      trail.position.set(0, 0.5, 2.2); g.add(trail);
      // barrel (recoils)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 5, 10), metal);
      barrel.rotation.x = Math.PI / 2 - 0.25;
      barrel.position.set(0, 1.6, -1.6);
      g.add(barrel);
      g.castShadow = true;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.root.add(g);
      this._anim.guns.push({ g, barrel, baseZ: barrel.position.z, cd: 1 + this.rng() * 4, recoil: 0 });
    }
  }

  // ---- trucks & tanks crawling behind / across the lines ----
  _vehicles() {
    const olive = this._M(0x434832);
    const dark = this._M(0x2a2c20);
    const tyre = this._M(0x18160f);
    const mkTruck = () => {
      const g = new THREE.Group();
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5), olive); bed.position.y = 1.4; g.add(bed);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), dark); cab.position.set(0, 1.7, -2.2); g.add(cab);
      for (const sx of [-1.1, 1.1]) for (const sz of [-1.8, 1.8]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 8), tyre);
        w.rotation.z = Math.PI / 2; w.position.set(sx, 0.6, sz); g.add(w);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return g;
    };
    const mkTank = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6), olive); hull.position.y = 1.2; g.add(hull);
      const turret = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.4), dark); turret.position.y = 2.3; g.add(turret);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 8), dark);
      gun.rotation.x = Math.PI / 2; gun.position.set(0, 2.3, -2.2); g.add(gun);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return g;
    };
    const make = (g, behindLines) => {
      const dir = this.rng() > 0.5 ? 1 : -1;
      const z = (behindLines ? (300 + this.rng() * 600) : (-100 - this.rng() * 400)) * FIELD;
      g.position.set((this.rng() - 0.5) * 5000 * FIELD, 0, z);
      g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.root.add(g);
      this._anim.vehicles.push({ g, dir, speed: 8 + this.rng() * 14, z });
    };
    for (let i = 0; i < 4 * FIELD; i++) make(mkTruck(), true);
    for (let i = 0; i < 2 * FIELD; i++) make(mkTank(), false);
  }

  // ---- smouldering fires (smoke columns) ----
  _fires() {
    this._smokeTex = smokeTexture(); this._textures.push(this._smokeTex);
    // lots of standalone fires across the field (ruins add more on top)
    for (let i = 0; i < 18 * FIELD; i++) {
      this.addFire((this.rng() - 0.5) * 8000 * FIELD, (this.rng() - 0.5) * 3800 * FIELD, 0.8 + this.rng() * 0.7);
    }
    // ruins flagged fires built earlier
    const pending = this._anim.fires.filter((f) => !f.sprites);
    for (const f of pending) this._buildFire(f, 1);
  }

  // public: start a smoke column anywhere (smouldering wrecks, hit emplacements)
  addFire(x, z, scale = 1) {
    const f = { x, z };
    this._anim.fires.push(f);
    if (this._smokeTex) this._buildFire(f, scale);
    return f;
  }

  _buildFire(f, scale = 1) {
    if (!this._smokeTex) { this._smokeTex = smokeTexture(); this._textures.push(this._smokeTex); }
    f.sprites = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._smokeTex, transparent: true, depthWrite: false, opacity: 0.5,
        color: 0x2a2824,
      }));
      const sc = (3 + i * 2.5) * scale;
      s.scale.set(sc, sc, 1);
      s.position.set(f.x, i * 4, f.z);
      s.userData = { base: i * 4, phase: i / n };
      this.root.add(s);
      f.sprites.push(s);
    }
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._smokeTex, transparent: true, depthWrite: false, opacity: 0.5,
      color: 0xc05020, blending: THREE.AdditiveBlending,
    }));
    ember.scale.set(2.4 * scale, 2.4 * scale, 1); ember.position.set(f.x, 1, f.z);
    this.root.add(ember); f.ember = ember;
  }

  // ---- tall drifting smoke columns of varying sizes across the field ----
  _smokeColumns() {
    this._plumeTex = plumeTexture(); this._textures.push(this._plumeTex);
    // each plume is tinted light at the foot (catching the smoke-lit ground)
    // fading to dark soot at the crown, so it reads against both the dark
    // ground below and the pale horizon above. A few greyer dust plumes vary it.
    const palettes = [
      { light: 0x8c8470, dark: 0x161310 }, // oily black
      { light: 0x968d78, dark: 0x221d15 }, // brown coal smoke
      { light: 0xa39a86, dark: 0x33302a }, // pale grey dust
    ];
    const count = Math.round(20 * FIELD);
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * 9200 * FIELD;
      const z = (this.rng() - 0.5) * 4400 * FIELD;
      // squared bias => mostly modest plumes with a few towering ones
      const size = 0.5 + this.rng() * this.rng() * 2.6;
      const pal = palettes[(this.rng() * palettes.length) | 0];
      this._buildSmokeColumn(x, z, size, pal);
    }
  }

  _buildSmokeColumn(x, z, size, pal) {
    const baseY = sampleHeight(x, z);
    const height = 45 + size * 65;              // ~50 (wisp) to ~220 (towering)
    const baseW = 9 + size * 8;
    const puffs = Math.round(9 + size * 7);     // dense overlap => solid plume
    const col = {
      x, z, baseY, size, height, baseW,
      rise: 7 + size * 4,                       // taller stacks billow up faster
      leanX: 0.05 + (this.rng() - 0.5) * 0.08,  // sheared by the easterly wind
      leanZ: (this.rng() - 0.5) * 0.06,
      swayRate: 0.4 + this.rng() * 0.5,
      maxOpacity: 0.85 + this.rng() * 0.15,
      light: new THREE.Color(pal.light),
      dark: new THREE.Color(pal.dark),
      sprites: [],
      ember: null,
    };
    for (let i = 0; i < puffs; i++) {
      const m = new THREE.SpriteMaterial({
        map: this._plumeTex, transparent: true, depthWrite: false, opacity: 0,
      });
      this._mats.push(m);
      const sp = new THREE.Sprite(m);
      sp.userData = { h: (i / puffs) * height, phase: this.rng() * Math.PI * 2 };
      this.root.add(sp);
      col.sprites.push(sp);
    }
    // a faint fire glow at the foot of the larger columns
    if (size > 1.5) {
      const em = new THREE.SpriteMaterial({
        map: this._smokeTex, transparent: true, depthWrite: false, opacity: 0.4,
        color: 0xc04a18, blending: THREE.AdditiveBlending,
      });
      this._mats.push(em);
      const ember = new THREE.Sprite(em);
      const es = 3 + size * 2;
      ember.scale.set(es, es, 1);
      ember.position.set(x, baseY + es * 0.4, z);
      this.root.add(ember);
      col.ember = ember;
    }
    this._smokeCols.push(col);
    this._updateSmokeColumn(col, 0);          // initial placement
  }

  _updateSmokeColumn(c, dt) {
    for (const sp of c.sprites) {
      const d = sp.userData;
      d.h += c.rise * dt;
      if (d.h > c.height) d.h -= c.height;     // recycle (invisible at the seam)
      const f = d.h / c.height;                // 0 at the base, 1 at the crown
      const sway = Math.sin(this._t * c.swayRate + d.phase) * (1 + f * 3) * c.size;
      sp.position.set(c.x + c.leanX * d.h + sway, c.baseY + d.h, c.z + c.leanZ * d.h);
      const w = c.baseW * (0.5 + f * 1.8);     // narrow at the foot, broad plume up top
      sp.scale.set(w, w, 1);
      // light near the deck, darkening to soot up top
      sp.material.color.copy(c.light).lerp(c.dark, f);
      // fade in quickly off the deck, thin out toward the top so the loop hides
      sp.material.opacity = c.maxOpacity * Math.min(1, f * 6) * (1 - f);
    }
    if (c.ember) c.ember.material.opacity = 0.3 + Math.sin(this._t * 7 + c.x) * 0.12;
  }

  // ---- marching infantry (instanced, animated) ----
  _soldiers() {
    const N = 150 * FIELD;
    const im = new THREE.InstancedMesh(this._soldierGeo, this._M(0x5b5a44), N);
    im.castShadow = false; im.receiveShadow = false;
    const troops = [];
    for (let i = 0; i < N; i++) {
      // columns advancing across no-man's-land toward the front (−z)
      const x = (this.rng() - 0.5) * 6000 * FIELD;
      const z = (300 - this.rng() * 1100) * FIELD;
      troops.push({
        x, z, heading: this.rng() > 0.15 ? -1 : 1, // most advance, some retreat
        speed: 1.2 + this.rng() * 1.6,
        phase: this.rng() * Math.PI * 2,
        scale: 1.2 + this.rng() * 0.5,
      });
    }
    this.root.add(im);
    this._anim.soldiers = { im, troops, mtx: new THREE.Matrix4(), q: new THREE.Quaternion(),
      e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() };
    this._updateSoldiers(0); // initial placement
  }

  _updateSoldiers(dt) {
    const S = this._anim.soldiers;
    if (!S) return;
    const { im, troops, mtx, q, e, v, s } = S;
    for (let i = 0; i < troops.length; i++) {
      const t = troops[i];
      t.z += t.heading * t.speed * dt;
      if (t.z < -1200 * FIELD) t.z = 320 * FIELD;
      if (t.z > 340 * FIELD) t.z = -1180 * FIELD;
      t.phase += dt * 6;
      const bob = Math.abs(Math.sin(t.phase)) * 0.18;        // marching bob
      const sway = Math.sin(t.phase) * 0.12;
      e.set(0, t.heading < 0 ? Math.PI : 0, sway);
      q.setFromEuler(e);
      v.set(t.x, 0.1 + bob, t.z);
      s.set(t.scale, t.scale, t.scale);
      mtx.compose(v, q, s);
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  update(dt, fx) {
    this._t += dt;
    this._updateSoldiers(dt);

    // vehicles roll along their lane and loop across the field
    for (const veh of this._anim.vehicles) {
      veh.g.position.x += veh.dir * veh.speed * dt;
      if (veh.g.position.x > 5200 * FIELD) veh.g.position.x = -5200 * FIELD;
      if (veh.g.position.x < -5200 * FIELD) veh.g.position.x = 5200 * FIELD;
    }

    // artillery: count down, flash + recoil + smoke when firing
    for (const gun of this._anim.guns) {
      gun.cd -= dt;
      if (gun.cd <= 0) {
        gun.cd = 3 + Math.random() * 5;
        gun.recoil = 1;
        const muzzle = new THREE.Vector3(0, 0, -3).applyMatrix4(gun.barrel.matrixWorld);
        if (fx) { fx.muzzleFlash(muzzle); fx.puff(muzzle, 'smoke'); }
      }
      if (gun.recoil > 0) {
        gun.recoil = Math.max(0, gun.recoil - dt * 3);
        gun.barrel.position.z = gun.baseZ + (1 - gun.recoil) * 0 + gun.recoil * 0.8;
      }
    }

    // smouldering smoke columns rise and recycle
    for (const f of this._anim.fires) {
      if (!f.sprites) continue;
      for (const sp of f.sprites) {
        sp.position.y += dt * 5;
        const d = sp.userData;
        if (sp.position.y > 22) sp.position.y = d.base;
        sp.material.opacity = 0.5 * (1 - sp.position.y / 24);
        sp.position.x = f.x + Math.sin(this._t * 0.5 + d.phase * 6) * (sp.position.y * 0.15);
      }
      if (f.ember) f.ember.material.opacity = 0.35 + Math.sin(this._t * 8 + f.x) * 0.15;
    }

    // tall drifting smoke columns
    for (const c of this._smokeCols) this._updateSmokeColumn(c, dt);
  }

  dispose() {
    for (const m of this._mats) m.dispose();
    for (const t of this._textures) t.dispose();
    if (this._soldierGeo) this._soldierGeo.dispose();
  }
}
