import * as THREE from 'three';

// Touch-first controls with a keyboard fallback so the sim is playable on a
// desktop too. Exposes a simple polled state the game reads each frame.
export default class Input {
  constructor() {
    this.pitch = 0;      // -1 nose down .. +1 nose up
    this.yaw = 0;        // -1 left .. +1 right (bank)
    this.throttle = 0.7;
    this.firing = false;
    this.bombQueued = false;

    this._keys = {};
    this._bindStick();
    this._bindThrottle();
    this._bindButtons();
    this._bindKeyboard();
  }

  _bindStick() {
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    const R = 48; // max knob travel
    let active = false, id = null;
    const rectCenter = () => {
      const r = base.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const move = (cx, cy) => {
      const c = rectCenter();
      let dx = cx - c.x, dy = cy - c.y;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.yaw = dx / R;
      this.pitch = dy / R; // drag down = pull back = nose up
    };
    const reset = () => {
      active = false; id = null;
      knob.style.transform = 'translate(-50%, -50%)';
      this.yaw = 0; this.pitch = 0;
    };
    base.addEventListener('pointerdown', (e) => {
      active = true; id = e.pointerId; base.setPointerCapture(id);
      move(e.clientX, e.clientY); e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => {
      if (active && e.pointerId === id) move(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', reset);
    base.addEventListener('pointercancel', reset);
  }

  _bindThrottle() {
    const track = document.getElementById('throttle-track');
    const fill = document.getElementById('throttle-fill');
    const knob = document.getElementById('throttle-knob');
    const pct = document.getElementById('throttle-pct');
    let active = false, id = null;
    // apply a normalized value to both state and the slider visuals
    const applyValue = (t) => {
      t = THREE.MathUtils.clamp(t, 0, 1);
      this.throttle = t;
      fill.style.height = `${t * 100}%`;
      knob.style.bottom = `calc(${t * 100}% - 16px)`;
      pct.textContent = `${Math.round(t * 100)}%`;
    };
    this._applyThrottle = applyValue;
    const setFromY = (cy) => {
      const r = track.getBoundingClientRect();
      if (r.height <= 0) return;            // ignore while hidden
      applyValue(1 - (cy - r.top) / r.height);
    };
    track.addEventListener('pointerdown', (e) => {
      active = true; id = e.pointerId; track.setPointerCapture(id);
      setFromY(e.clientY); e.preventDefault();
    });
    track.addEventListener('pointermove', (e) => {
      if (active && e.pointerId === id) setFromY(e.clientY);
    });
    const end = () => { active = false; id = null; };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    const fire = document.getElementById('btn-fire');
    const press = (v) => { this.firing = v; fire.classList.toggle('held', v); };
    fire.addEventListener('pointerdown', (e) => { press(true); e.preventDefault(); });
    fire.addEventListener('pointerup', () => press(false));
    fire.addEventListener('pointerleave', () => press(false));
    fire.addEventListener('pointercancel', () => press(false));

    const bomb = document.getElementById('btn-bomb');
    bomb.addEventListener('pointerdown', (e) => {
      this.bombQueued = true;
      bomb.classList.add('held');
      setTimeout(() => bomb.classList.remove('held'), 120);
      e.preventDefault();
    });
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space') { this.firing = true; e.preventDefault(); }
      if (e.code === 'KeyB') this.bombQueued = true;
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
      if (e.code === 'Space') this.firing = false;
    });
  }

  // fold keyboard into the analog state each frame
  pollKeyboard(dt) {
    const k = this._keys;
    let p = 0, y = 0;
    if (k.ArrowUp || k.KeyW) p += 1;
    if (k.ArrowDown || k.KeyS) p -= 1;
    if (k.ArrowLeft || k.KeyA) y -= 1;
    if (k.ArrowRight || k.KeyD) y += 1;
    if (p || y) { this.pitch = p; this.yaw = y; }
    if (k.ShiftLeft || k.Equal) this.setThrottle(this.throttle + dt * 0.6);
    if (k.ControlLeft || k.Minus) this.setThrottle(this.throttle - dt * 0.6);
  }

  setThrottle(t) {
    // drive value + visuals directly, never via screen geometry (works even
    // while the HUD is hidden)
    if (this._applyThrottle) this._applyThrottle(t);
    else this.throttle = THREE.MathUtils.clamp(t, 0, 1);
  }

  consumeBomb() {
    if (this.bombQueued) { this.bombQueued = false; return true; }
    return false;
  }
}
