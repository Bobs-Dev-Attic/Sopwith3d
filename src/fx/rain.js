import * as THREE from 'three';

// Cheap rain: a box of falling line streaks that follows the camera and is
// sheared by the wind. One LineSegments draw call. Toggle with setActive().
export default class Rain {
  constructor(scene, count = 900) {
    this.scene = scene;
    this.count = count;
    this.area = 600;       // box half-extent around the camera
    this.top = 260;
    this.speed = 420;

    const pos = new Float32Array(count * 6); // 2 endpoints per streak
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x9aa6b0, transparent: true, opacity: 0.35 });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);

    this.drops = [];
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * 2 * this.area,
        y: Math.random() * this.top,
        z: (Math.random() - 0.5) * 2 * this.area,
      });
    }
    this._wind = new THREE.Vector3();
  }

  setActive(on) { this.lines.visible = on; this._on = on; }

  update(dt, cameraPos, wind) {
    if (!this._on) return;
    if (wind) this._wind.copy(wind); else this._wind.set(0, 0, 0);
    const pos = this.geo.attributes.position.array;
    const len = 8 + Math.min(6, this._wind.length() * 0.2);
    const wx = this._wind.x * 0.06, wz = this._wind.z * 0.06;
    for (let i = 0; i < this.count; i++) {
      const d = this.drops[i];
      d.y -= this.speed * dt;
      d.x += wx * this.speed * dt * 0.02 + this._wind.x * dt;
      d.z += wz * this.speed * dt * 0.02 + this._wind.z * dt;
      // recycle relative to the camera so rain always surrounds the player
      if (d.y < -40 || Math.abs(d.x) > this.area || Math.abs(d.z) > this.area) {
        d.x = (Math.random() - 0.5) * 2 * this.area;
        d.y = this.top;
        d.z = (Math.random() - 0.5) * 2 * this.area;
      }
      const x = cameraPos.x + d.x, y = cameraPos.y + d.y - 60, z = cameraPos.z + d.z;
      const o = i * 6;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x - this._wind.x * 0.06; pos[o + 4] = y - len; pos[o + 5] = z - this._wind.z * 0.06;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
