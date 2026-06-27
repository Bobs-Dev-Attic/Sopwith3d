import * as THREE from 'three';
import { WORLD, FIELD } from '../core/config.js';

// Deterministic little PRNG so the battlefield looks the same every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- shared landform -------------------------------------------------------
// The terrain is more than rolling ground now: it carries small hills, big
// shell craters and long ditches. The feature set is generated once with a
// fixed seed so every consumer (the mesh, and anything that wants to seat a
// prop on the ground) agrees on the same heights via sampleHeight().
const SIZE = WORLD.groundSize;

function buildFeatures() {
  const rng = mulberry32(42);
  const hills = [];
  const craters = [];
  const ditches = [];

  // gentle rises and knolls dotted across the field
  for (let i = 0; i < 20 * FIELD; i++) {
    hills.push({
      x: (rng() - 0.5) * SIZE * 0.85,
      z: (rng() - 0.5) * SIZE * 0.85,
      r: 200 + rng() * 480,
      h: 10 + rng() * 28,
    });
  }
  // a few huge bowl craters from heavy shelling
  for (let i = 0; i < 10 * FIELD; i++) {
    craters.push({
      x: (rng() - 0.5) * SIZE * 0.7,
      z: (rng() - 0.5) * 4200 * FIELD,
      r: 90 + rng() * 150,
      d: 12 + rng() * 16,
    });
  }
  // dense small cratering through the churned central scar
  for (let i = 0; i < 170 * FIELD; i++) {
    craters.push({
      x: (rng() - 0.5) * SIZE * 0.7,
      z: (rng() - 0.5) * 1800 * FIELD,
      r: 30 + rng() * 80,
      d: 4 + rng() * 9,
    });
  }
  // long ditches / sunken lanes gouged across no-man's-land
  for (let i = 0; i < 9 * FIELD; i++) {
    const cx = (rng() - 0.5) * SIZE * 0.6;
    const cz = (rng() - 0.5) * 3200 * FIELD;
    const ang = rng() * Math.PI;
    const len = 700 + rng() * 1600;
    const dx = Math.cos(ang) * len / 2;
    const dz = Math.sin(ang) * len / 2;
    ditches.push({
      ax: cx - dx, az: cz - dz, bx: cx + dx, bz: cz + dz,
      w: 18 + rng() * 26, d: 5 + rng() * 6,
    });
  }
  return { hills, craters, ditches };
}

const FEAT = buildFeatures();

// closest-point parameter of (x,z) projected onto a ditch segment, clamped 0..1
function segParam(x, z, d) {
  const ex = d.bx - d.ax, ez = d.bz - d.az;
  const len2 = ex * ex + ez * ez || 1;
  let t = ((x - d.ax) * ex + (z - d.az) * ez) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Ground height at any world (x,z). Used by the terrain mesh and to seat props.
export function sampleHeight(x, z) {
  let y =
    Math.sin(x * 0.0018) * 6 +
    Math.cos(z * 0.0021) * 6 +
    Math.sin((x + z) * 0.004) * 2.5;

  // hills rise
  for (const h of FEAT.hills) {
    const dx = x - h.x, dz = z - h.z;
    const d2 = dx * dx + dz * dz;
    y += h.h * Math.exp(-d2 / (2 * h.r * h.r));
  }
  // craters dish in
  for (const c of FEAT.craters) {
    const dx = x - c.x, dz = z - c.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < c.r) {
      const f = 1 - dist / c.r;
      y -= Math.cos((1 - f) * Math.PI * 0.5) * c.d;
    }
  }
  // ditches cut a sunken lane
  for (const d of FEAT.ditches) {
    const t = segParam(x, z, d);
    const px = d.ax + (d.bx - d.ax) * t;
    const pz = d.az + (d.bz - d.az) * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < d.w) {
      const f = 1 - dist / d.w;
      y -= Math.cos((1 - f) * Math.PI * 0.5) * d.d;
    }
  }
  return y;
}

// Painted ground: churned mud, grass patches, shell holes.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  const rng = mulberry32(7);

  x.fillStyle = '#5c5436';
  x.fillRect(0, 0, 1024, 1024);

  // mottled mud + grass
  const cols = ['#6b6340', '#4f4830', '#736a44', '#3f3a26', '#5a5a3a'];
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = cols[(rng() * cols.length) | 0];
    const r = 6 + rng() * 34;
    x.globalAlpha = 0.25 + rng() * 0.4;
    x.beginPath();
    x.arc(rng() * 1024, rng() * 1024, r, 0, Math.PI * 2);
    x.fill();
  }
  // dark shell craters
  x.globalAlpha = 1;
  for (let i = 0; i < 120; i++) {
    const cx = rng() * 1024, cy = rng() * 1024, r = 8 + rng() * 22;
    const g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
    g.addColorStop(0, '#211d12');
    g.addColorStop(0.6, '#352f1d');
    g.addColorStop(1, 'rgba(60,54,34,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(132, 132);
  t.anisotropy = 8;
  return t;
}

export function buildTerrain(scene) {
  const size = WORLD.groundSize;
  const seg = 280;                       // more segments to keep detail on the bigger plane
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const rng = mulberry32(99);
  const pos = geo.attributes.position;
  const colors = [];
  const cMud = new THREE.Color(0x4a4530);
  const cField = new THREE.Color(0x59603a);
  const cScar = new THREE.Color(0x3b3522);
  const cHill = new THREE.Color(0x646a3e);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = sampleHeight(x, z);
    pos.setY(i, y);

    // colour by region: central scar = churned mud, outer = scrubby field,
    // raised ground greens up a little
    const scar = THREE.MathUtils.clamp(1 - Math.abs(z) / (2100 * FIELD), 0, 1);
    tmp.copy(cField).lerp(cMud, scar * 0.7).lerp(cScar, scar * 0.5);
    if (y > 8) tmp.lerp(cHill, THREE.MathUtils.clamp((y - 8) / 28, 0, 0.5));
    // a little per-vertex grime
    const n = 0.85 + rng() * 0.3;
    colors.push(tmp.r * n, tmp.g * n, tmp.b * n);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture(),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  return { mesh, sampleHeight };
}
