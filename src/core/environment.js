import * as THREE from 'three';

// Atmospheric conditions for a sortie: wind (with gusts), temperature, and
// rain. Feeds the flight integrator an `env` object and drives the HUD readout
// and the rain effect. Configured from the realism options each mission.
const ALT_SCALE = 10000;       // altitude lapse for air density (game units)

export default class Environment {
  constructor() {
    this._wind = new THREE.Vector3();
    this._env = { wind: null, densityBase: 1, dragMul: 1, turbulence: 0, realistic: false, altScale: ALT_SCALE };
    this.reset();
  }

  reset() {
    this.windEnabled = false;
    this.rain = false;
    this.cold = false;
    this.realistic = false;
    this.windSpeed = 0;
    this.windDir = 0;
    this.tempC = 15;
    this._t = 0;
    this._wind.set(0, 0, 0);
  }

  // settings: the global settings store (reads the realism toggles)
  configure(settings) {
    this.windEnabled = settings.get('wind');
    this.rain = settings.get('rain');
    this.cold = settings.get('coldAir');
    this.realistic = settings.get('realisticStall');
    this._t = 0;

    if (this.windEnabled) {
      this.windSpeed = 9 + Math.random() * 15;       // game units/s
      this.windDir = Math.random() * Math.PI * 2;
    } else {
      this.windSpeed = 0;
    }
    // temperature: cold front is cold, rain is cool, otherwise exactly standard
    // (15°C => air density 1.0, so the base game is unchanged with realism off)
    this.tempC = this.cold ? (-6 + Math.random() * 6)
      : this.rain ? (7 + Math.random() * 5)
        : 15;
  }

  update(dt) {
    this._t += dt;
    if (this.windEnabled) {
      // gusts: speed swells and dies, direction wanders
      const gust = this.windSpeed * (0.7 + 0.3 * Math.sin(this._t * 0.7) + 0.16 * Math.sin(this._t * 2.6));
      const dir = this.windDir + 0.22 * Math.sin(this._t * 0.5);
      this._wind.set(Math.cos(dir) * gust, 0, Math.sin(dir) * gust);
    } else {
      this._wind.set(0, 0, 0);
    }
  }

  densityBase() {
    // colder air is denser (ρ ∝ 1/T, absolute)
    return 288.15 / (273.15 + this.tempC);
  }

  // the object handed to integrateFlight (stable reference, updated in place)
  envFor() {
    const e = this._env;
    e.wind = this.windEnabled ? this._wind : null;
    e.densityBase = this.densityBase();
    e.dragMul = this.rain ? 1.12 : 1;          // wet, heavy air
    e.turbulence = (this.windEnabled ? this.windSpeed * 0.0009 : 0) + (this.rain ? 0.02 : 0);
    e.realistic = this.realistic;
    e.altScale = ALT_SCALE;
    return e;
  }

  get active() { return this.windEnabled || this.rain || this.cold || this.realistic; }

  // for the HUD: wind speed (units/s), the world-space heading the wind blows
  // toward, the temperature, and a short condition label
  readout() {
    let label = this.realistic ? 'REALISTIC' : 'STD';
    if (this.rain) label = 'RAIN';
    else if (this.cold) label = 'COLD';
    else if (this.windEnabled) label = 'WINDY';
    return {
      windSpeed: this._wind.length(),
      windToward: Math.atan2(this._wind.x, this._wind.z),
      tempC: this.tempC,
      label,
    };
  }
}
