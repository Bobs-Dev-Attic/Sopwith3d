import * as THREE from 'three';

// All aircraft are built from primitives so the game ships with zero external
// assets. Forward is -Z, up is +Y, right is +X. Parts that move in flight
// (prop, elevator, rudder, ailerons) are returned so the entity can animate them.

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });

// --- canvas insignia --------------------------------------------------------
function roundelTexture(rings) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  const cx = 64, cy = 64;
  rings.forEach((r) => {
    x.beginPath();
    x.arc(cx, cy, r.r, 0, Math.PI * 2);
    x.fillStyle = r.c;
    x.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

const rafRoundel = () =>
  roundelTexture([
    { r: 32, c: '#1b3a6b' },
    { r: 21, c: '#d8d3c4' },
    { r: 10, c: '#9c2b22' },
  ]);

function ironCrossTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0)';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#15140f';
  const arm = 18, len = 52, cx = 64, cy = 64;
  x.fillRect(cx - arm, cy - len, arm * 2, len * 2);
  x.fillRect(cx - len, cy - arm, len * 2, arm * 2);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function decal(texture, size, rot = -Math.PI / 2) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  m.rotation.x = rot;
  return m;
}

// ---------------------------------------------------------------------------
// Sopwith Camel — player aircraft. Olive/khaki camo with RAF roundels.
export function buildCamel() {
  const g = new THREE.Group();
  const camo = mat(0x6f6a3e);          // olive drab
  const camoDark = mat(0x4f4a2c);
  const linen = mat(0xb8a878);
  const wood = mat(0x6b4a2c, { roughness: 0.7 });
  const metal = mat(0x8a8a82, { metalness: 0.5, roughness: 0.5 });
  const black = mat(0x1a1a16);

  // Fuselage — tapered box stack
  const fus = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 7.2), camo);
  fus.position.z = 0.4;
  g.add(fus);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.4, 12), metal);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, -3.4);
  g.add(nose);

  // Cowl ring + spinner
  const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.18, 8, 16), black);
  cowl.position.set(0, 0, -4.1);
  g.add(cowl);

  // Propeller (animated)
  const propHub = new THREE.Group();
  propHub.position.set(0, 0, -4.25);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.12), wood);
  propHub.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  propHub.add(blade2);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), metal);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.4;
  propHub.add(spinner);
  g.add(propHub);

  // Cockpit hole + pilot
  const pit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.1), black);
  pit.position.set(0, 0.75, 0.6);
  g.add(pit);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0x6b5436));
  head.position.set(0, 1.05, 0.7);
  g.add(head);

  // cockpit coaming + windscreen (frames the first-person view)
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), mat(0x241f16));
  coaming.position.set(0, 0.92, -0.05);
  g.add(coaming);
  const wsFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.06), mat(0x15110b));
  wsFrame.position.set(0, 1.2, -0.32);
  g.add(wsFrame);
  for (const sx of [-0.46, 0.46]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), mat(0x15110b));
    post.position.set(sx, 1.04, -0.28);
    post.rotation.x = -0.3;
    g.add(post);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xb6ccd2, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  glass.position.set(0, 1.04, -0.3);
  glass.rotation.x = -0.3;
  g.add(glass);

  // Biplane wings
  const wingGeo = new THREE.BoxGeometry(13.5, 0.18, 2.4);
  const upper = new THREE.Mesh(wingGeo, linen);
  upper.position.set(0, 1.55, -0.4);
  g.add(upper);
  const lower = new THREE.Mesh(wingGeo, linen);
  lower.position.set(0, -0.55, 0.1);
  g.add(lower);

  // Roundels on the upper wing
  const rTex = rafRoundel();
  [-4.4, 4.4].forEach((sx) => {
    const d = decal(rTex, 2.0);
    d.position.set(sx, 1.66, -0.4);
    g.add(d);
  });

  // Interplane struts
  const strutGeo = new THREE.BoxGeometry(0.1, 2.1, 0.1);
  [-4.6, -2.0, 2.0, 4.6].forEach((sx) => {
    const s = new THREE.Mesh(strutGeo, wood);
    s.position.set(sx, 0.5, -0.3);
    g.add(s);
  });

  // Ailerons (animated) — outer trailing edge of upper wing
  const ailGeo = new THREE.BoxGeometry(3.2, 0.14, 0.7);
  const aileronL = new THREE.Mesh(ailGeo, camoDark);
  aileronL.position.set(-4.8, 1.55, 0.9);
  g.add(aileronL);
  const aileronR = new THREE.Mesh(ailGeo, camoDark);
  aileronR.position.set(4.8, 1.55, 0.9);
  g.add(aileronR);

  // Tail group
  const tail = new THREE.Group();
  tail.position.z = 3.6;
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 1.5), linen);
  tail.add(hstab);
  // Elevator (animated)
  const elevator = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.8), camoDark);
  elevator.position.z = 1.0;
  tail.add(elevator);
  // Vertical fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.4), linen);
  fin.position.set(0, 0.8, 0.2);
  tail.add(fin);
  // Rudder (animated)
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.8), camoDark);
  rudder.position.set(0, 0.8, 1.0);
  tail.add(rudder);
  g.add(tail);

  // Tail roundel on fin & rudder stripes
  const finStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5),
    new THREE.MeshBasicMaterial({ color: 0x9c2b22, side: THREE.DoubleSide }));
  finStripe.position.set(0.08, 4.4, 4.0);
  g.add(finStripe);

  // Landing gear
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), wood);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, -1.5, -1.0);
  g.add(axle);
  [-1.5, 1.5].forEach((sx) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 14), black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, -1.5, -1.0);
    g.add(wheel);
    const leg = new THREE.Mesh(strutGeo, wood);
    leg.position.set(sx * 0.7, -1.0, -0.8);
    leg.rotation.z = sx * 0.3;
    g.add(leg);
  });

  // Twin Vickers guns
  [-0.3, 0.3].forEach((sx) => {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), black);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(sx, 0.55, -2.2);
    g.add(gun);
  });

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    group: g,
    prop: propHub,
    elevator,
    rudder,
    aileronL,
    aileronR,
    head,
    // muzzle in local space (nose, between guns)
    muzzle: new THREE.Vector3(0, 0.55, -3.2),
  };
}

// ---------------------------------------------------------------------------
// Fokker Dr.I triplane — enemy. Crimson with iron crosses.
export function buildFokker(color = 0x7a2a22) {
  const g = new THREE.Group();
  const body = mat(color);
  const bodyDark = mat(0x4a1a14);
  const metal = mat(0x6a6a62, { metalness: 0.5, roughness: 0.5 });
  const wood = mat(0x5b3a20);
  const black = mat(0x16140f);

  const fus = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 6.4), body);
  g.add(fus);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.8, 1.0, 12), metal);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -3.2;
  g.add(cowl);

  const propHub = new THREE.Group();
  propHub.position.z = -3.7;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.1), wood);
  propHub.add(blade);
  const blade2 = blade.clone(); blade2.rotation.z = Math.PI / 2; propHub.add(blade2);
  g.add(propHub);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0x4a3a28));
  head.position.set(0, 0.85, 0.4);
  g.add(head);

  // Three stacked wings
  const wingGeo = new THREE.BoxGeometry(12.5, 0.16, 2.1);
  const cTex = ironCrossTexture();
  [[1.5, -0.6], [-0.1, 0.0], [-1.7, 0.4]].forEach(([y, z], i) => {
    const w = new THREE.Mesh(wingGeo, body);
    w.position.set(0, y, z);
    g.add(w);
    if (i === 0) {
      [-4.0, 4.0].forEach((sx) => {
        const d = decal(cTex, 1.9);
        d.position.set(sx, y + 0.11, z);
        g.add(d);
      });
    }
  });
  // struts
  [-3.4, 3.4].forEach((sx) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), wood);
    s.position.set(sx, 0.0, 0);
    g.add(s);
  });

  const tail = new THREE.Group();
  tail.position.z = 3.2;
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.13, 1.3), body);
  tail.add(hstab);
  const elevator = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.11, 0.7), bodyDark);
  elevator.position.z = 0.9; tail.add(elevator);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.2), body);
  fin.position.set(0, 0.7, 0.2); tail.add(fin);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.7), bodyDark);
  rudder.position.set(0, 0.7, 0.9); tail.add(rudder);
  g.add(tail);

  [-1.3, 1.3].forEach((sx) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12), black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, -1.35, -0.9);
    g.add(wheel);
  });

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return { group: g, prop: propHub, elevator, rudder,
    muzzle: new THREE.Vector3(0, 0.4, -3.0) };
}
