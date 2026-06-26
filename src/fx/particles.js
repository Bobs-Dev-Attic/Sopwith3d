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

export default class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.smokeTex = softTexture('rgba(120,116,108,0.9)', 'rgba(60,58,54,0.5)');
    this.fireTex = softTexture('rgba(255,210,120,1)', 'rgba(200,70,20,0.6)');
    this.dustTex = softTexture('rgba(150,130,95,0.9)', 'rgba(90,75,50,0.4)');

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
    for (let i = 0; i < 10 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        Math.random() * 22,
        (Math.random() - 0.5) * 30
      );
      this._spawn(pos, {
        tex: this.fireTex, additive: true, size: 4 * scale + Math.random() * 4,
        maxLife: 0.5 + Math.random() * 0.3, grow: 14, vel: v, opacity: 1,
      });
    }
    for (let i = 0; i < 8 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18
      );
      this._spawn(pos, {
        tex: this.smokeTex, size: 6 * scale, maxLife: 1.8, grow: 20, rise: 10,
        color: 0x1f1d18, vel: v, opacity: 0.85,
      });
    }
  }

  // ground impact dust + fire
  groundBurst(pos, scale = 1) {
    for (let i = 0; i < 10 * scale; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 26, Math.random() * 16 + 4, (Math.random() - 0.5) * 26
      );
      this._spawn(pos, {
        tex: this.dustTex, size: 5 * scale, maxLife: 1.4, grow: 18, rise: 2,
        color: 0x9a8a64, vel: v, opacity: 0.8,
      });
    }
    this.explosion(pos, scale * 0.7);
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
