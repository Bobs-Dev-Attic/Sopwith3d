import * as THREE from 'three';

// Pooled rigid-body-style debris chunks: launched on a ballistic arc, tumbling,
// bouncing off the ground with restitution and friction, then settling and
// fading. Cheap (shared geometry, instanced-free pool of small meshes).
export default class Debris {
  constructor(scene, max = 140) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = [
      new THREE.MeshStandardMaterial({ color: 0x33291a, roughness: 0.9 }),  // charred wood
      new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.5, metalness: 0.5 }), // metal
      new THREE.MeshStandardMaterial({ color: 0x4a4530, roughness: 1 }),    // dirt clod
      new THREE.MeshStandardMaterial({ color: 0x24221c, roughness: 0.8 }),  // dark scrap
    ];
    this.pool = [];
    this.active = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(this.geo, this.mats[0]);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.pool.push(m);
    }
    this.gravity = 26;
  }

  burst(pos, count = 14, opts = {}) {
    const spread = opts.spread ?? 22;
    const up = opts.up ?? 20;
    for (let i = 0; i < count; i++) {
      const m = this.pool.pop();
      if (!m) break;
      m.visible = true;
      m.material = this.mats[(Math.random() * this.mats.length) | 0];
      m.position.copy(pos);
      m.position.y = Math.max(0.4, pos.y);
      const s = 0.4 + Math.random() * 1.3;
      m.scale.set(s, s * (0.5 + Math.random()), s * (0.6 + Math.random()));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const ang = Math.random() * Math.PI * 2;
      const horiz = spread * (0.3 + Math.random());
      m.userData = {
        vel: new THREE.Vector3(Math.cos(ang) * horiz, up * (0.5 + Math.random()), Math.sin(ang) * horiz),
        spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        life: 0,
        maxLife: 3.5 + Math.random() * 2.5,
        radius: 0.4 * s,
        rest: false,
      };
      this.active.push(m);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      const d = m.userData;
      d.life += dt;

      if (!d.rest) {
        d.vel.y -= this.gravity * dt;
        m.position.addScaledVector(d.vel, dt);
        m.rotation.x += d.spin.x * dt;
        m.rotation.y += d.spin.y * dt;
        m.rotation.z += d.spin.z * dt;
        // ground bounce
        if (m.position.y <= d.radius) {
          m.position.y = d.radius;
          d.vel.y = -d.vel.y * 0.34;          // restitution
          d.vel.x *= 0.6; d.vel.z *= 0.6;      // friction
          d.spin.multiplyScalar(0.5);
          if (d.vel.lengthSq() < 4) { d.rest = true; d.vel.set(0, 0, 0); }
        }
      }

      // fade out near end of life
      const fadeStart = d.maxLife - 0.8;
      if (d.life > fadeStart) {
        const f = Math.max(0, 1 - (d.life - fadeStart) / 0.8);
        m.scale.multiplyScalar(0.96);
        if (d.life >= d.maxLife || f <= 0.02) {
          m.visible = false;
          this.active.splice(i, 1);
          this.pool.push(m);
        }
      }
    }
  }
}
