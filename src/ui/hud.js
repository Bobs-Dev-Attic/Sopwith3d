import * as THREE from 'three';
import { HUD_SCALE } from '../core/config.js';
import Minimap from './minimap.js';

// Sweep of a 270° dial face with evenly spaced tick marks.
function faceSVG(majorTicks) {
  let ticks = '';
  for (let i = 0; i <= majorTicks; i++) {
    const deg = -135 + (i / majorTicks) * 270;
    const a = (deg * Math.PI) / 180;
    const long = i === 0 || i === majorTicks;
    const r1 = long ? 33 : 36;
    const x1 = 50 + Math.sin(a) * r1, y1 = 50 - Math.cos(a) * r1;
    const x2 = 50 + Math.sin(a) * 43, y2 = 50 - Math.cos(a) * 43;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#d8cdae" stroke-width="${long ? 2.4 : 1.4}"/>`;
  }
  return `<svg viewBox="0 0 100 100" class="g-face">
    <circle cx="50" cy="50" r="47" class="g-rim"/>
    <circle cx="50" cy="50" r="42" class="g-glass"/>
    ${ticks}
    <circle cx="50" cy="50" r="3.6" class="g-hub"/>
  </svg>`;
}

// Analog gauge: spec { id, label, min, max, ticks, fmt(value) }
class Gauge {
  constructor(spec) {
    this.spec = spec;
    const el = document.createElement('div');
    el.className = 'gauge';
    el.id = `g-${spec.id}`;
    el.innerHTML = `${faceSVG(spec.ticks)}
      <div class="needle"></div>
      <div class="g-label">${spec.label}</div>
      <div class="g-read">0</div>`;
    this.el = el;
    this.needle = el.querySelector('.needle');
    this.read = el.querySelector('.g-read');
  }
  set(value) {
    const { min, max } = this.spec;
    const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const deg = -135 + t * 270;
    this.needle.style.transform = `translateX(-50%) rotate(${deg.toFixed(1)}deg)`;
    this.read.textContent = this.spec.fmt(value);
  }
}

export default class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      kills: document.getElementById('kills-val'),
      score: document.getElementById('score-val'),
      objective: document.querySelector('#objective .objective-text'),
      health: document.getElementById('health-fill'),
      bombs: document.getElementById('bomb-count'),
      stall: document.getElementById('stall-warning'),
      flash: document.getElementById('hit-flash'),
      banner: document.getElementById('message-banner'),
      cloudVeil: document.getElementById('cloud-veil'),
      barrageVeil: document.getElementById('barrage-veil'),
      viewFade: document.getElementById('view-fade'),
      viewCaption: document.getElementById('view-caption'),
    };
    this._flash = 0;
    this._buildInstruments();

    this._arrowHost = document.getElementById('target-arrows');
    this._arrows = [];
    this._proj = new THREE.Vector3();

    this.minimap = new Minimap(document.getElementById('minimap'));
  }

  updateMinimap(dt, plane, enemies, groundTargets, objectives) {
    this.minimap.update(dt, plane.state.position, plane.state.quaternion, enemies, groundTargets, objectives);
  }

  // Edge arrows pointing toward off-screen objective positions.
  updateArrows(positions, camera) {
    const W = window.innerWidth, H = window.innerHeight;
    const cx = W / 2, cy = H / 2;
    const mx = cx - 30, my = cy - 30;     // inset rectangle the arrows ride
    let used = 0;
    for (const pos of positions) {
      this._proj.copy(pos).project(camera);
      let x = this._proj.x, y = this._proj.y;
      const behind = this._proj.z > 1;
      if (behind) { x = -x; y = -y; }
      if (!behind && Math.abs(x) <= 0.96 && Math.abs(y) <= 0.96) continue; // on-screen
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x /= m; y /= m;
      const sx = cx + x * mx;
      const sy = cy - y * my;
      const a = this._arrow(used++);
      const ang = Math.atan2(sy - cy, sx - cx);
      a.style.left = `${sx}px`;
      a.style.top = `${sy}px`;
      a.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
      a.style.display = 'block';
    }
    for (let i = used; i < this._arrows.length; i++) this._arrows[i].style.display = 'none';
  }

  _arrow(i) {
    if (!this._arrows[i]) {
      const el = document.createElement('div');
      el.className = 'target-arrow';
      this._arrowHost.appendChild(el);
      this._arrows[i] = el;
    }
    return this._arrows[i];
  }

  _buildInstruments() {
    const host = document.getElementById('instruments');
    this.gauges = {
      asi: new Gauge({ id: 'asi', label: 'A.S.I.', min: 0, max: 180, ticks: 9, fmt: (v) => `${Math.round(v)}` }),
      alt: new Gauge({ id: 'alt', label: 'ALT', min: 0, max: 4000, ticks: 8, fmt: (v) => `${Math.round(v)}` }),
      fuel: new Gauge({ id: 'fuel', label: 'FUEL', min: 0, max: 100, ticks: 4, fmt: (v) => `${Math.round(v)}` }),
      rpm: new Gauge({ id: 'rpm', label: 'RPM', min: 0, max: 1400, ticks: 7, fmt: (v) => `${Math.round(v)}` }),
    };
    for (const g of Object.values(this.gauges)) host.appendChild(g.el);
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  update(dt, plane) {
    const altFt = Math.max(0, plane.state.position.y) * HUD_SCALE.altToFeet;
    const spdMph = plane.state.speed * HUD_SCALE.spdToMph;
    this.gauges.asi.set(spdMph);
    this.gauges.alt.set(altFt);
    this.gauges.fuel.set(plane.fuel);
    this.gauges.rpm.set(plane.rpm);
    this.gauges.fuel.el.classList.toggle('warn', plane.fuel < 20);

    this.el.health.style.width = `${Math.max(0, plane.hull / plane.maxHull) * 100}%`;
    this.el.bombs.textContent = plane.bombs;
    this.el.stall.classList.toggle('hidden', !(plane.stalled && plane.alive));

    if (this._flash > 0) {
      this._flash -= dt;
      this.el.flash.style.opacity = Math.max(0, this._flash / 0.4);
    }
  }

  setKills(n) { this.el.kills.textContent = n; }
  setScore(n) { this.el.score.textContent = n; }
  setObjective(text) { this.el.objective.textContent = text; }
  setCloudVeil(v) { this.el.cloudVeil.style.opacity = (v * 0.7).toFixed(2); }
  setBarrage(v) { this.el.barrageVeil.style.opacity = (v * 0.7).toFixed(2); }
  setViewCaption(text) { if (this.el.viewCaption) this.el.viewCaption.textContent = text; }
  flashViewFade() {
    const f = this.el.viewFade;
    if (!f) return;
    f.style.animation = 'none';
    void f.offsetWidth;
    f.style.animation = 'viewfade 0.32s ease';
  }

  flashHit() { this._flash = 0.4; }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
  }
}
