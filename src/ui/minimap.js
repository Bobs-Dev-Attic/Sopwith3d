import * as THREE from 'three';
import { WORLD } from '../core/config.js';
import { styleFor } from './targetStyles.js';

// Top-right radar: player at centre (north-up) with a heading arrow, live
// enemies, ground targets, and the current objectives (which clamp to the rim
// when out of range so you always have a bearing).
export default class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = canvas.getContext('2d');
    this.S = canvas.width;          // logical pixels (square)
    this.range = WORLD.combatRadius * 0.9;
    this._fwd = new THREE.Vector3();
    this._t = 0;
  }

  // draw a small typed marker (fillStyle/alpha set by caller) at px,py
  _marker(px, py, r, shape) {
    const x = this.x;
    x.beginPath();
    switch (shape) {
      case 'square':
        x.rect(px - r, py - r, r * 2, r * 2); break;
      case 'rect':
        x.rect(px - r * 1.4, py - r * 0.7, r * 2.8, r * 1.4); break;
      case 'diamond':
        x.moveTo(px, py - r); x.lineTo(px + r, py); x.lineTo(px, py + r); x.lineTo(px - r, py); x.closePath(); break;
      case 'triangle':
        x.moveTo(px, py - r); x.lineTo(px + r, py + r); x.lineTo(px - r, py + r); x.closePath(); break;
      case 'circle':
        x.arc(px, py, r, 0, Math.PI * 2); break;
      default: // 'dot'
        x.arc(px, py, r * 0.82, 0, Math.PI * 2); break;
    }
    x.fill();
  }

  update(dt, playerPos, playerQuat, enemies, groundTargets, objectives) {
    this._t += dt;
    const x = this.x, S = this.S, R = S / 2, cx = R, cy = R;
    const rim = R - 3;
    const scale = (rim - 2) / this.range;
    x.clearRect(0, 0, S, S);

    x.save();
    x.beginPath(); x.arc(cx, cy, rim, 0, Math.PI * 2); x.clip();
    x.fillStyle = 'rgba(18,22,16,0.78)';
    x.fillRect(0, 0, S, S);

    // range rings + crosshair
    x.strokeStyle = 'rgba(124,139,74,0.28)'; x.lineWidth = 1;
    x.beginPath(); x.arc(cx, cy, rim * 0.5, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx, 4); x.lineTo(cx, S - 4); x.moveTo(4, cy); x.lineTo(S - 4, cy); x.stroke();

    const rel = (wx, wz) => [cx + (wx - playerPos.x) * scale, cy + (wz - playerPos.z) * scale];
    const within = (px, py) => ((px - cx) ** 2 + (py - cy) ** 2) <= (rim - 1) ** 2;

    // ground targets — coloured + shaped by type, drawn dim
    x.globalAlpha = 0.7;
    for (const t of groundTargets) {
      if (!t.alive) continue;
      const [px, py] = rel(t.pos.x, t.pos.z);
      if (!within(px, py)) continue;
      const st = styleFor(t.type);
      x.fillStyle = st.color;
      this._marker(px, py, 2.6, st.shape);
    }
    x.globalAlpha = 1;

    // enemy aircraft
    for (const e of enemies) {
      if (!e.alive) continue;
      const [px, py] = rel(e.state.position.x, e.state.position.z);
      if (!within(px, py)) continue;
      x.fillStyle = '#e0483a';
      x.beginPath(); x.arc(px, py, 2.6, 0, Math.PI * 2); x.fill();
    }

    // objectives — coloured by type, pulsing, clamped to the rim if out of range
    const pulse = 0.5 + 0.5 * Math.sin(this._t * 5);
    for (const o of objectives) {
      const op = o.pos || o;             // tolerate a bare Vector3
      const st = styleFor(o.type);
      let dx = (op.x - playerPos.x) * scale;
      let dz = (op.z - playerPos.z) * scale;
      const d = Math.hypot(dx, dz);
      let edge = false;
      if (d > rim - 2) { const k = (rim - 4) / d; dx *= k; dz *= k; edge = true; }
      const px = cx + dx, py = cy + dz;
      x.globalAlpha = 0.5 + pulse * 0.5;
      x.fillStyle = st.color;
      this._marker(px, py, edge ? 2.6 : 3.6, st.shape);
      x.globalAlpha = 1;
      if (!edge) {
        x.strokeStyle = st.color; x.globalAlpha = 0.4 + pulse * 0.4; x.lineWidth = 1.4;
        x.beginPath(); x.arc(px, py, 5.8, 0, Math.PI * 2); x.stroke();
        x.globalAlpha = 1;
      }
    }
    x.restore();

    // player heading arrow at centre
    this._fwd.set(0, 0, -1).applyQuaternion(playerQuat);
    const ang = Math.atan2(this._fwd.x, -this._fwd.z);
    x.save();
    x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = '#e8e0c8';
    x.beginPath(); x.moveTo(0, -6); x.lineTo(4.2, 5); x.lineTo(0, 2.5); x.lineTo(-4.2, 5); x.closePath();
    x.fill();
    x.restore();

    // bezel
    x.strokeStyle = 'rgba(194,162,90,0.6)'; x.lineWidth = 2;
    x.beginPath(); x.arc(cx, cy, rim, 0, Math.PI * 2); x.stroke();
  }
}
