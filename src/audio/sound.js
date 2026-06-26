// Fully procedural audio (Web Audio API) — no asset files, so it works offline
// in the PWA. Synthesises a rotary engine, twin Vickers guns, explosions,
// airspeed wind, hit clangs, and a distant artillery ambience.

export default class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this._ambientOn = false;
    this._enginePlaying = false;
    try {
      this.muted = localStorage.getItem('sop-muted') === '1';
    } catch (e) { /* ignore */ }
  }

  // Must be called from a user gesture (browsers block audio otherwise).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // shared white-noise buffer
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // mixing buses
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.0; this.ambBus.connect(this.master);
    this.engBus = ctx.createGain(); this.engBus.gain.value = 0.0; this.engBus.connect(this.master);

    this._buildEngine();
    this._buildWind();
    this._buildAmbientBed();

    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('sop-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }
  toggleMuted() { this.setMuted(!this.muted); return this.muted; }

  // ---- persistent rotary engine -------------------------------------------
  _buildEngine() {
    const ctx = this.ctx;
    // two detuned saw oscillators + a noise growl, shaped by a lowpass, with a
    // tremolo LFO for the characteristic rotary throb
    this.eOsc1 = ctx.createOscillator(); this.eOsc1.type = 'sawtooth';
    this.eOsc2 = ctx.createOscillator(); this.eOsc2.type = 'square';
    this.eOsc1.frequency.value = 60; this.eOsc2.frequency.value = 90;

    this.eGrowl = ctx.createBufferSource(); this.eGrowl.buffer = this.noise; this.eGrowl.loop = true;
    const growlGain = ctx.createGain(); growlGain.gain.value = 0.25;
    const growlFilt = ctx.createBiquadFilter(); growlFilt.type = 'bandpass';
    growlFilt.frequency.value = 220; growlFilt.Q.value = 0.7;

    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass';
    this.eFilter.frequency.value = 700;

    // tremolo / throb
    this.eThrob = ctx.createOscillator(); this.eThrob.type = 'sine'; this.eThrob.frequency.value = 26;
    this.eThrobGain = ctx.createGain(); this.eThrobGain.gain.value = 0.35;
    this.eThrobDC = ctx.createGain(); this.eThrobDC.gain.value = 1.0;
    this.eThrob.connect(this.eThrobGain).connect(this.eThrobDC.gain);

    const mix = ctx.createGain();
    this.eOsc1.connect(mix); this.eOsc2.connect(mix);
    this.eGrowl.connect(growlFilt).connect(growlGain).connect(mix);
    mix.connect(this.eFilter).connect(this.eThrobDC).connect(this.engBus);

    this.eOsc1.start(); this.eOsc2.start(); this.eGrowl.start(); this.eThrob.start();
  }

  // ---- wind (airspeed) -----------------------------------------------------
  _buildWind() {
    const ctx = this.ctx;
    this.windSrc = ctx.createBufferSource(); this.windSrc.buffer = this.noise; this.windSrc.loop = true;
    this.windFilt = ctx.createBiquadFilter(); this.windFilt.type = 'bandpass';
    this.windFilt.frequency.value = 500; this.windFilt.Q.value = 0.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.0;
    this.windSrc.connect(this.windFilt).connect(this.windGain).connect(this.master);
    this.windSrc.start();
  }

  // ---- low ambient battlefield bed ----------------------------------------
  _buildAmbientBed() {
    const ctx = this.ctx;
    this.bedSrc = ctx.createBufferSource(); this.bedSrc.buffer = this.noise; this.bedSrc.loop = true;
    const bedFilt = ctx.createBiquadFilter(); bedFilt.type = 'lowpass'; bedFilt.frequency.value = 110;
    const bedGain = ctx.createGain(); bedGain.gain.value = 0.5;
    this.bedSrc.connect(bedFilt).connect(bedGain).connect(this.ambBus);
    this.bedSrc.start();
  }

  // ---- gameplay control ----------------------------------------------------
  startMission() {
    if (!this.ready) return;
    this._enginePlaying = true;
    this.engBus.gain.setTargetAtTime(0.34, this.ctx.currentTime, 0.3);
    this.ambBus.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.0);
    this._ambientOn = true;
    this._scheduleArtillery();
  }

  endMission() {
    this._enginePlaying = false;
    this._ambientOn = false;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engBus.gain.setTargetAtTime(0, t, 0.4);
    this.ambBus.gain.setTargetAtTime(0, t, 0.6);
    this.windGain.gain.setTargetAtTime(0, t, 0.4);
  }

  // called every frame with the player's flight state
  update(rpm, throttle, speed, alive) {
    if (!this.ready || !this._enginePlaying) return;
    const t = this.ctx.currentTime;
    const rev = Math.max(0, rpm) / 1250;       // 0..1
    const f = 46 + rev * 150;                  // fundamental
    this.eOsc1.frequency.setTargetAtTime(f, t, 0.08);
    this.eOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    this.eFilter.frequency.setTargetAtTime(420 + rev * 1700, t, 0.08);
    this.eThrob.frequency.setTargetAtTime(8 + rev * 30, t, 0.08);
    const eVol = alive ? (0.12 + rev * 0.34) : 0.04;
    this.engBus.gain.setTargetAtTime(eVol, t, 0.1);

    const ws = Math.min(1, speed / 175);
    this.windGain.gain.setTargetAtTime(0.04 + ws * 0.22, t, 0.15);
    this.windFilt.frequency.setTargetAtTime(350 + ws * 900, t, 0.15);
  }

  // ---- one-shot effects ----------------------------------------------------
  _burst({ dur = 0.3, type = 'lowpass', f0 = 800, f1 = 80, q = 0.8, vol = 0.6, rate = 1, dest }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = rate;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _thump(freq, dur, vol, dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  gun(vol = 0.5) {
    // sharp report: a snap of high noise + a little body
    const rate = 0.9 + Math.random() * 0.3;
    this._burst({ dur: 0.07, type: 'bandpass', f0: 1800, f1: 700, q: 1.2, vol, rate });
    this._thump(150, 0.06, vol * 0.5);
  }

  enemyGun(dist) {
    const v = Math.max(0, 0.32 * (1 - dist / 900));
    if (v > 0.02) this.gun(v);
  }

  explosion(size = 1) {
    this._burst({ dur: 0.5 + size * 0.3, f0: 700, f1: 60, q: 0.6, vol: Math.min(1, 0.5 + size * 0.25) });
    this._thump(70, 0.5 + size * 0.2, Math.min(1, 0.5 + size * 0.2));
  }

  groundBurst(size = 1) {
    this._burst({ dur: 0.4 + size * 0.25, f0: 500, f1: 70, q: 0.7, vol: 0.4 + size * 0.18 });
    this._thump(85, 0.35, 0.5);
  }

  hit() {
    // metallic clang on taking fire
    this._burst({ dur: 0.12, type: 'bandpass', f0: 2600, f1: 1400, q: 2.5, vol: 0.4 });
    this._thump(320, 0.1, 0.25);
  }

  // distant, muffled artillery rumbles at random intervals
  _scheduleArtillery() {
    if (!this.ready || !this._ambientOn) return;
    const delay = 2500 + Math.random() * 5000;
    this._artTimer = setTimeout(() => {
      if (this._ambientOn) {
        const size = 0.6 + Math.random() * 1.2;
        this._burst({ dur: 0.7 + size * 0.4, f0: 220, f1: 45, q: 0.5,
          vol: 0.12 + Math.random() * 0.16, dest: this.ambBus });
        this._thump(48, 0.6, 0.18, this.ambBus);
      }
      this._scheduleArtillery();
    }, delay);
  }
}
