// Player-facing assist options, persisted to localStorage. All default off
// (normal difficulty); the player opts in to make things easier.
const KEY = 'sop-settings';

const defaults = {
  flightAssist: false,
  aimAssist: false,
  reinforcedHull: false,
  unlimitedFuel: false,
  bombCam: true,
  // realism (all off by default — the base game flies the same)
  wind: false,
  rain: false,
  coldAir: false,
  realisticStall: false,
};

export const OPTION_DEFS = [
  { group: 'Assists & Extras', key: 'flightAssist', name: 'Flight Assist', desc: 'Auto-levels the aircraft when you ease off the stick.' },
  { group: 'Assists & Extras', key: 'aimAssist', name: 'Aim Assist', desc: 'Your guns nudge onto the nearest target in your sights.' },
  { group: 'Assists & Extras', key: 'reinforcedHull', name: 'Reinforced Hull', desc: 'Take half damage from bullets, flak and shells.' },
  { group: 'Assists & Extras', key: 'unlimitedFuel', name: 'Unlimited Fuel', desc: 'Never run dry — loiter as long as you like.' },
  { group: 'Assists & Extras', key: 'bombCam', name: 'Bomb Camera', desc: 'Cut to a cinematic view following each bomb to impact (tap to skip).' },
  { group: 'Realism', key: 'wind', name: 'Wind & Gusts', desc: 'A drifting, gusting wind you have to fly against — crab into it on a bomb run.' },
  { group: 'Realism', key: 'rain', name: 'Rain & Murk', desc: 'Rain, low cloud and poor visibility; the wet air is heavier and bumpier.' },
  { group: 'Realism', key: 'coldAir', name: 'Cold Air', desc: 'A cold front: denser air means more lift and engine bite, but more drag.' },
  { group: 'Realism', key: 'realisticStall', name: 'Realistic Stalls', desc: 'Sharper stalls, mushier controls at low speed, and thinner air up high.' },
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
