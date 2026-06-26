import * as THREE from 'three';

// --- Tracer rounds ----------------------------------------------------------
// Pooled glowing capsules oriented along their flight path.
export class Projectiles {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.max = 240;
    this.pool = [];
    this.active = [];
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 5);
    geo.rotateX(Math.PI / 2); // length along local +Z
    const matPlayer = new THREE.MeshBasicMaterial({ color: 0xffe27a });
    const matEnemy = new THREE.MeshBasicMaterial({ color: 0xff7a4a });
    this.mats = { player: matPlayer, enemy: matEnemy };
    for (let i = 0; i < this.max; i++) {
      const m = new THREE.Mesh(geo, matPlayer);
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }
    this._dir = new THREE.Vector3();
    this._prev = new THREE.Vector3();
  }

  fire(pos, dir, speed, faction, damage) {
    const m = this.pool.pop();
    if (!m) return;
    m.visible = true;
    m.material = this.mats[faction] || this.mats.player;
    m.position.copy(pos);
    this._dir.copy(dir).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._dir);
    m.userData = {
      vel: this._dir.clone().multiplyScalar(speed),
      life: 0, maxLife: 2.2, faction, damage,
      prev: pos.clone(),
    };
    this.active.push(m);
    if (this.fx) this.fx.muzzleFlash(pos);
  }

  // colliders: [{ pos, radius, faction, hit(dmg) }]
  update(dt, colliders) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      const d = b.userData;
      d.prev.copy(b.position);
      b.position.addScaledVector(d.vel, dt);
      d.life += dt;

      let dead = d.life >= d.maxLife;

      if (!dead && b.position.y <= 0) {
        if (this.fx) this.fx.groundBurst(b.position, 0.4);
        dead = true;
      }

      if (!dead && colliders) {
        for (const c of colliders) {
          if (c.faction === d.faction || !c.alive) continue;
          // distance from target center to the bullet's travel segment
          if (segmentHitsSphere(d.prev, b.position, c.pos, c.radius)) {
            c.hit(d.damage);
            if (this.fx) this.fx.explosion(b.position, 0.4);
            dead = true;
            break;
          }
        }
      }

      if (dead) {
        b.visible = false;
        this.active.splice(i, 1);
        this.pool.push(b);
      }
    }
  }

  clear() {
    while (this.active.length) {
      const b = this.active.pop();
      b.visible = false;
      this.pool.push(b);
    }
  }
}

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
function segmentHitsSphere(a, b, center, radius) {
  _ab.copy(b).sub(a);
  _ac.copy(center).sub(a);
  const ab2 = _ab.lengthSq() || 1e-6;
  let t = _ac.dot(_ab) / ab2;
  t = THREE.MathUtils.clamp(t, 0, 1);
  _ab.multiplyScalar(t).add(a); // closest point on segment
  return _ab.distanceToSquared(center) <= radius * radius;
}

// --- Bombs ------------------------------------------------------------------
export class Bombs {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.active = [];
    this.geo = new THREE.CapsuleGeometry(0.35, 1.1, 4, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.6, metalness: 0.3 });
  }

  drop(pos, velocity) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(pos);
    m.userData = { vel: velocity.clone().multiplyScalar(0.6), life: 0 };
    this.scene.add(m);
    this.active.push(m);
    return m;
  }

  // groundTargets: [{ pos, radius, alive, hit(dmg) }]
  update(dt, groundTargets, onExplode) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      const d = b.userData;
      d.vel.y -= 9.8 * dt * 2.2;
      d.vel.multiplyScalar(1 - dt * 0.05);
      b.position.addScaledVector(d.vel, dt);
      // tumble nose-down toward velocity
      b.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.vel.clone().normalize().negate()
      );
      d.life += dt;

      if (b.position.y <= 0 || d.life > 12) {
        b.position.y = Math.max(0, b.position.y);
        this._detonate(b.position, groundTargets);
        if (onExplode) onExplode(b.position);
        this.scene.remove(b);
        this.active.splice(i, 1);
      }
    }
  }

  _detonate(pos, groundTargets) {
    // visuals/audio are handled by the game's onExplode (bigger blast + debris)
    const blast = 55;
    if (groundTargets) {
      for (const t of groundTargets) {
        if (!t.alive) continue;
        const dist = t.pos.distanceTo(pos);
        if (dist < blast + t.radius) {
          const dmg = 120 * (1 - dist / (blast + t.radius));
          t.hit(dmg);
        }
      }
    }
  }

  clear() {
    while (this.active.length) this.scene.remove(this.active.pop());
  }
}
