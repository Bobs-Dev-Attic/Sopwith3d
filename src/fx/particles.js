import * as THREE from 'three';

// Soft round sprite used for every puff of smoke / fire / dust.
function softTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.5, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Expanding shockwave ring laid flat on the ground.
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,230,180,0.9)';
  x.lineWidth = 10;
  x.beginPath();
  x.arc(64, 64, 52, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = 'rgba(180,90,40,0.5)';
  x.lineWidth = 22;
  x.beginPath();
  x.arc(64, 64, 44, 0, Math.PI * 2);
  x.stroke();
  return new THREE.CanvasTexture(c);
}

export default class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.smokeTex = softTexture('rgba(120,116,108,0.9)', 'rgba(60,58,54,0.5)');
    this.fireTex = softTexture('rgba(255,210,120,1)', 'rgba(200,70,20,0.6)');
    this.dustTex = softTexture('rgba(150,130,95,0.9)', 'rgba(90,75,50,0.4)');

    // shockwave rings (flat, expanding planes)
    this.ringTex = ringTexture();
    this.ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.rings = [];

    this.pool = [];
    this.active = [];
    this.max = 600;
    for (let i = 0; i < this.max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTex, transparent: true, depthWrite: false,
      }));
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }
  }

  _get() {
    const s = this.pool.pop();
    if (!s) return null;
    s.visible = true;
    this.active.push(s);
    return s;
  }

  _spawn(pos, opts) {
    const s = this._get();
    if (!s) return;
    s.position.copy(pos);
    s.material.map = opts.tex;
    s.material.blending = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.color.setHex(opts.color ?? 0xffffff);
    s.material.opacity = opts.opacity ?? 1;
    s.material.needsUpdate = true;
    const sc = opts.size ?? 4;
    s.scale.set(sc, sc, sc);
    s.userData = {
      vel: opts.vel ? opts.vel.clone() : new THREE.Vector3(),
      life: 0,
      maxLife: opts.maxLife ?? 1,
      grow: opts.grow ?? 6,
      rise: opts.rise ?? 0,
      fade: opts.fade ?? 1,
      startOpacity: opts.opacity ?? 1,
    };
  }

  // engine/damage trail
  puff(pos, type, vel) {
    const drift = (Math.random() - 0.5);
    if (type === 'fire') {
      this._spawn(pos, {
        tex: this.fireTex, additive: true, size: 2.5 + Math.random() * 2,
        maxLife: 0.4, grow: 5, rise: 6,
        vel: vel ? vel.clone().multiplyScalar(0.2) : null, opacity: 0.95,
      });
      this._spawn(pos, {
        tex: this.smokeTex, size: 3, maxLife: 1.3, grow: 9, rise: 8,
        color: 0x2a2824, opacity: 0.7,
      });
    } else {
      this._spawn(pos, {
        tex: this.smokeTex, size: 2.5 + Math.random() * 1.5,
        maxLife: 1.6, grow: 11, rise: 7, color: 0x4a463e,
        vel: new THREE.Vector3(drift * 2, 0, drift * 2), opacity: 0.55,
      });
    }
  }

  explosion(pos, scale = 1) {
    for (let i = 0; i < 12 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 36 * scale,
        Math.random() * 26 * scale,
        (Math.random() - 0.5) * 36 * scale
      );
      this._spawn(pos, {
        tex: this.fireTex, additive: true, size: 5 * scale + Math.random() * 5 * scale,
        maxLife: 0.5 + Math.random() * 0.35, grow: 18 * scale, vel: v, opacity: 1,
      });
    }
    for (let i = 0; i < 9 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 22, Math.random() * 16, (Math.random() - 0.5) * 22
      );
      this._spawn(pos, {
        tex: this.smokeTex, size: 7 * scale, maxLife: 2.0, grow: 24 * scale, rise: 11,
        color: 0x1f1d18, vel: v, opacity: 0.88,
      });
    }
  }

  // ground impact dust + fire — a big, billowing blast
  groundBurst(pos, scale = 1) {
    // bright initial fireball
    for (let i = 0; i < 4; i++) {
      this._spawn(pos, {
        tex: this.fireTex, additive: true, size: 9 * scale + Math.random() * 6 * scale,
        maxLife: 0.45, grow: 26 * scale, vel: new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 14, (Math.random() - 0.5) * 10),
        opacity: 1,
      });
    }
    // kicked-up dirt
    for (let i = 0; i < 16 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 38 * scale, Math.random() * 26 + 6, (Math.random() - 0.5) * 38 * scale
      );
      this._spawn(pos, {
        tex: this.dustTex, size: 6 * scale, maxLife: 1.8, grow: 24 * scale, rise: 2,
        color: 0x8c7c58, vel: v, opacity: 0.85,
      });
    }
    // rolling black smoke column
    for (let i = 0; i < 6 * scale; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 18 + 6, (Math.random() - 0.5) * 14);
      this._spawn(pos, {
        tex: this.smokeTex, size: 8 * scale, maxLife: 2.6, grow: 26 * scale, rise: 14,
        color: 0x1b1913, vel: v, opacity: 0.92,
      });
    }
    this.shockwave(pos, scale);
    this.explosion(pos, scale * 0.8);
  }

  // flat expanding shockwave ring on the deck
  shockwave(pos, scale = 1) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      map: this.ringTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    m.position.set(pos.x, 1.5, pos.z);
    const start = 6 * scale, end = 70 * scale;
    m.scale.set(start, start, start);
    this.scene.add(m);
    this.rings.push({ m, life: 0, maxLife: 0.6, start, end });
  }

  // anti-aircraft flak: a sharp flash, a lingering oily black puff, and sparks
  flak(pos, size = 1) {
    this._spawn(pos, {
      tex: this.fireTex, additive: true, size: 5 * size, maxLife: 0.13, grow: 12, opacity: 1,
    });
    for (let i = 0; i < 5; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10);
      this._spawn(pos.clone().add(off), {
        tex: this.smokeTex, size: 6 * size, maxLife: 2.6 + Math.random(), grow: 7, rise: 1.5,
        color: 0x14130e, opacity: 0.92,
      });
    }
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 36, (Math.random() - 0.5) * 36, (Math.random() - 0.5) * 36);
      this._spawn(pos, { tex: this.fireTex, additive: true, size: 1.6, maxLife: 0.3, grow: 2, vel: v, opacity: 0.9 });
    }
  }

  muzzleFlash(pos) {
    this._spawn(pos, {
      tex: this.fireTex, additive: true, size: 2.2, maxLife: 0.06,
      grow: 4, opacity: 1,
    });
  }

  update(dt) {
    // expanding shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const s = r.start + (r.end - r.start) * t;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = 0.8 * (1 - t);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      const d = s.userData;
      d.life += dt;
      if (d.life >= d.maxLife) {
        s.visible = false;
        this.active.splice(i, 1);
        this.pool.push(s);
        continue;
      }
      const t = d.life / d.maxLife;
      s.position.addScaledVector(d.vel, dt);
      s.position.y += d.rise * dt;
      d.vel.multiplyScalar(1 - dt * 1.5);
      const grown = s.scale.x + d.grow * dt;
      s.scale.set(grown, grown, grown);
      s.material.opacity = d.startOpacity * (1 - t);
    }
  }
}
