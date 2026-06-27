import * as THREE from 'three';
import { WORLD } from '../core/config.js';

// Deterministic little PRNG so the battlefield looks the same every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  const rng = mulberry32(42);
  // big craters carved into the (now wider) no-man's-land band
  const craters = [];
  for (let i = 0; i < 170; i++) {
    craters.push({
      x: (rng() - 0.5) * size * 0.7,
      z: (rng() - 0.5) * 1800,  // clustered around the central scar
      r: 30 + rng() * 80,
      d: 4 + rng() * 9,
    });
  }

  const pos = geo.attributes.position;
  const colors = [];
  const cMud = new THREE.Color(0x4a4530);
  const cField = new THREE.Color(0x59603a);
  const cScar = new THREE.Color(0x3b3522);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y =
      Math.sin(x * 0.0018) * 6 +
      Math.cos(z * 0.0021) * 6 +
      Math.sin((x + z) * 0.004) * 2.5;

    // carve craters
    for (const c of craters) {
      const dx = x - c.x, dz = z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < c.r) {
        const f = 1 - dist / c.r;
        y -= Math.cos((1 - f) * Math.PI * 0.5) * c.d;
      }
    }
    pos.setY(i, y);

    // colour by region: central scar = churned mud, outer = scrubby field
    const scar = THREE.MathUtils.clamp(1 - Math.abs(z) / 2100, 0, 1);
    tmp.copy(cField).lerp(cMud, scar * 0.7).lerp(cScar, scar * 0.5);
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

  return { mesh, craters };
}
