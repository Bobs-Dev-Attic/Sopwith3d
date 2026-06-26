import { HUD_SCALE } from '../core/config.js';

// Thin wrapper over the DOM HUD elements.
export default class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      alt: document.getElementById('alt-val'),
      spd: document.getElementById('spd-val'),
      kills: document.getElementById('kills-val'),
      objective: document.querySelector('#objective .objective-text'),
      health: document.getElementById('health-fill'),
      bombs: document.getElementById('bomb-count'),
      stall: document.getElementById('stall-warning'),
      flash: document.getElementById('hit-flash'),
      banner: document.getElementById('message-banner'),
    };
    this._flash = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  update(dt, plane) {
    const alt = Math.max(0, plane.state.position.y) * HUD_SCALE.altToFeet;
    const spd = plane.state.speed * HUD_SCALE.spdToMph;
    this.el.alt.textContent = Math.round(alt);
    this.el.spd.textContent = Math.round(spd);
    this.el.health.style.width = `${Math.max(0, plane.hull / plane.maxHull) * 100}%`;
    this.el.bombs.textContent = plane.bombs;
    this.el.stall.classList.toggle('hidden', !(plane.stalled && plane.alive));

    if (this._flash > 0) {
      this._flash -= dt;
      this.el.flash.style.opacity = Math.max(0, this._flash / 0.4);
    }
  }

  setKills(n) { this.el.kills.textContent = n; }
  setObjective(text) { this.el.objective.textContent = text; }

  flashHit() { this._flash = 0.4; }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    // restart the CSS animation
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
  }
}
