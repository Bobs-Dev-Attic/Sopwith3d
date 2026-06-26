import * as THREE from 'three';
import { CLOUDS } from '../core/config.js';

// Puffy white cloud texture (soft, bright core).
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 60, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(244,242,236,0.95)');
  g.addColorStop(0.45, 'rgba(214,210,200,0.7)');
  g.addColorStop(0.8, 'rgba(150,148,140,0.25)');
  g.addColorStop(1, 'rgba(120,118,110,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Drifting volumetric-ish clouds the player can actually fly through. Each
// cloud is a cluster of billboard puffs; whiteoutAt() reports how deep inside
// a cloud a point is so the HUD can fog the screen.
export default class Clouds {
  constructor(scene, seed = 1) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tex = puffTexture();
    this.clouds = [];

    let s = (seed * 2654435761) >>> 0;
    const rng = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    for (let i = 0; i < CLOUDS.count; i++) {
      const center = new THREE.Vector3(
        (rng() - 0.5) * CLOUDS.spread * 2,
        CLOUDS.minAlt + rng() * (CLOUDS.maxAlt - CLOUDS.minAlt),
        (rng() - 0.5) * CLOUDS.spread * 2
      );
      const cloud = new THREE.Group();
      cloud.position.copy(center);
      const puffs = 5 + Math.floor(rng() * CLOUDS.puffsPer);
      for (let p = 0; p < puffs; p++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.tex, transparent: true, depthWrite: false, opacity: 0.55 + rng() * 0.3,
        }));
        spr.position.set((rng() - 0.5) * 130, (rng() - 0.5) * 45, (rng() - 0.5) * 130);
        const sc = 70 + rng() * 90;
        spr.scale.set(sc, sc * 0.7, 1);
        cloud.add(spr);
      }
      this.group.add(cloud);
      this.clouds.push({ obj: cloud, center, radius: CLOUDS.cloudRadius });
    }
  }

  update(dt) {
    for (const c of this.clouds) {
      c.center.x += CLOUDS.drift * dt;
      if (c.center.x > CLOUDS.spread) c.center.x -= CLOUDS.spread * 2;
      c.obj.position.x = c.center.x;
    }
  }

  // 0 outside, ramps to ~1 deep inside the nearest cloud
  whiteoutAt(pos) {
    let best = 0;
    for (const c of this.clouds) {
      const d = c.center.distanceTo(pos);
      if (d < c.radius) {
        const v = 1 - d / c.radius;
        if (v > best) best = v;
      }
    }
    return Math.min(1, best * 1.3);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.material) o.material.dispose(); });
  }
}
