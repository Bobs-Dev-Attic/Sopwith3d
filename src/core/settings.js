// Player-facing assist options, persisted to localStorage. All default off
// (normal difficulty); the player opts in to make things easier.
const KEY = 'sop-settings';

const defaults = {
  flightAssist: false,
  aimAssist: false,
  reinforcedHull: false,
  unlimitedFuel: false,
};

export const OPTION_DEFS = [
  { key: 'flightAssist', name: 'Flight Assist', desc: 'Auto-levels the aircraft when you ease off the stick.' },
  { key: 'aimAssist', name: 'Aim Assist', desc: 'Your guns nudge onto the nearest target in your sights.' },
  { key: 'reinforcedHull', name: 'Reinforced Hull', desc: 'Take half damage from bullets, flak and shells.' },
  { key: 'unlimitedFuel', name: 'Unlimited Fuel', desc: 'Never run dry — loiter as long as you like.' },
];

class Settings {
  constructor() {
    this.values = { ...defaults };
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) Object.assign(this.values, s);
    } catch (e) { /* ignore */ }
  }
  get(k) { return !!this.values[k]; }
  set(k, v) { this.values[k] = !!v; this._save(); }
  toggle(k) { this.set(k, !this.values[k]); return this.values[k]; }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* ignore */ } }
}

export default new Settings();
