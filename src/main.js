import * as THREE from 'three';
import Game from './core/game.js';
import Input from './controls/input.js';
import { CAMERA } from './core/config.js';
import { MISSIONS } from './ui/missions.js';
import { VERSION } from './core/version.js';
import settings, { OPTION_DEFS } from './core/settings.js';
import leaderboard from './core/leaderboard.js';

// stamp the version on the home screen
const versionTag = document.getElementById('version-tag');
if (versionTag) versionTag.textContent = `v${VERSION}`;

// --- PWA install / offline / update (modeled on the scrabble-offline app) ---
let deferredPrompt = null;
let swReg = null;
let updateReady = false;
let applyingUpdate = false;

const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  window.navigator.standalone === true;
const offlineReady = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { deferredPrompt = null; });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) window.location.reload();
  });
  window.addEventListener('load', () => {
    // updateViaCache:'none' => the SW script is re-fetched from network on every
    // check, so new deploys are detected promptly instead of being HTTP-cached.
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        swReg = reg;
        if (reg.waiting && navigator.serviceWorker.controller) updateReady = true;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) updateReady = true;
          });
        });
        try { reg.update(); } catch (e) { /* ignore */ }
      })
      .catch(() => {});
  });
}

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 1, 6000);
camera.position.set(0, 400, 1000);
camera.lookAt(0, 350, 0);

const game = new Game(renderer, scene, camera);
const input = new Input();
game.setInput(input);

// expose for debugging / automated checks
window.__sop = { game, input, THREE };

// audio needs a user gesture to start; unlock on the first interaction
const unlockAudio = () => game.audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });

// sound on/off toggle
const soundBtn = document.getElementById('sound-toggle');
const syncSoundGlyph = () => { soundBtn.textContent = game.audio.muted ? '🔇' : '🔊'; };
syncSoundGlyph();
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  game.audio.unlock();
  game.audio.toggleMuted();
  syncSoundGlyph();
});

// --- menu / screens ---------------------------------------------------------
const overlay = document.getElementById('overlay');
const SCREENS = ['title-screen', 'menu-screen', 'options-screen', 'ranks-screen', 'howto-screen', 'end-screen', 'loading'];
function showScreen(id) {
  overlay.classList.remove('hidden');
  SCREENS.forEach((s) => { const el = document.getElementById(s); if (el) el.classList.toggle('hidden', s !== id); });
}

// persisted mission progression (index 0 = training, 1 = first sortie open)
function loadUnlocked() {
  try { const v = parseInt(localStorage.getItem('sop-unlocked'), 10); return Number.isFinite(v) ? Math.max(1, v) : 1; }
  catch (e) { return 1; }
}
function saveUnlocked() { try { localStorage.setItem('sop-unlocked', String(highestUnlocked)); } catch (e) { /* ignore */ } }
let highestUnlocked = loadUnlocked();

// --- options / assists ------------------------------------------------------
function buildOptions() {
  const list = document.getElementById('options-list');
  list.innerHTML = '';
  OPTION_DEFS.forEach((opt) => {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
      <div class="option-info">
        <div class="option-name">${opt.name}</div>
        <div class="option-desc">${opt.desc}</div>
      </div>
      <div class="option-toggle${settings.get(opt.key) ? ' on' : ''}" role="switch"><div class="knob"></div></div>`;
    const toggle = row.querySelector('.option-toggle');
    toggle.addEventListener('click', () => {
      const on = settings.toggle(opt.key);
      toggle.classList.toggle('on', on);
      game.audio.unlock();
    });
    list.appendChild(row);
  });
}

// --- ranks / leaderboard ----------------------------------------------------
function buildRanks() {
  const list = document.getElementById('ranks-list');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const best = leaderboard.best(i);
    const has = best > 0;
    const row = document.createElement('div');
    row.className = 'rank-row' + (has ? '' : ' empty');
    row.innerHTML = `
      <div class="r-mission"><div class="r-no">${m.no}</div><div class="r-name">${m.name}</div></div>
      <div class="r-best"><div class="r-score">${has ? best : '—'}</div><div class="r-rank">${has ? rankForScore(best).name : 'unflown'}</div></div>`;
    list.appendChild(row);
  });
}

// --- mission select ---------------------------------------------------------
function buildMissionList() {
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'mission-card' + (i > highestUnlocked ? ' locked' : '');
    const best = leaderboard.best(i);
    const status = i > highestUnlocked ? 'LOCKED' : (best > 0 ? `BEST ${best}` : 'READY');
    card.innerHTML = `
      <div class="m-no">${m.no}</div>
      <div class="m-name">${m.name}</div>
      <div class="m-desc">${m.desc}</div>
      <div class="m-status">${status}</div>`;
    if (i <= highestUnlocked) card.addEventListener('click', () => launch(i));
    list.appendChild(card);
  });
}

function showTitle() { buildMissionList(); showScreen('title-screen'); }
function launch(index) { overlay.classList.add('hidden'); game.start(index); }

// --- menu navigation --------------------------------------------------------
const byId = (id) => document.getElementById(id);
byId('menu-icon').addEventListener('click', () => {
  byId('menu-version').textContent = (offlineReady() ? 'OFFLINE READY ✓ · ' : '') + `v${VERSION}`;
  showScreen('menu-screen');
});
byId('m-new').addEventListener('click', () => { highestUnlocked = 1; saveUnlocked(); showTitle(); });
byId('m-options').addEventListener('click', () => { buildOptions(); showScreen('options-screen'); });
byId('m-ranks').addEventListener('click', () => { buildRanks(); showScreen('ranks-screen'); });
byId('m-howto').addEventListener('click', () => showScreen('howto-screen'));
byId('m-install').addEventListener('click', (e) => installOrUpdate(e.currentTarget));
byId('m-close').addEventListener('click', showTitle);
byId('btn-options-back').addEventListener('click', () => showScreen('menu-screen'));
byId('ranks-back').addEventListener('click', () => showScreen('menu-screen'));
byId('howto-back').addEventListener('click', () => showScreen('menu-screen'));

// --- Install / Update button ------------------------------------------------
function applyUpdate(btn) {
  if (swReg && swReg.waiting) {
    btn.textContent = 'UPDATING…';
    applyingUpdate = true;                 // controllerchange handler reloads
    swReg.waiting.postMessage('SKIP_WAITING');
    return true;
  }
  return false;
}

async function installOrUpdate(btn) {
  game.audio.unlock();

  // 1) installable and not yet installed -> show the install prompt
  if (deferredPrompt && !isStandalone()) {
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      btn.textContent = outcome === 'accepted' ? 'INSTALLED ✓' : 'INSTALL / UPDATE';
    } catch (e) { /* ignore */ }
    deferredPrompt = null;
    return;
  }

  if (!('serviceWorker' in navigator) || !swReg) {
    btn.textContent = 'UNAVAILABLE';
    setTimeout(() => { btn.textContent = 'INSTALL / UPDATE'; }, 1600);
    return;
  }

  // 2) an update already downloaded and waiting -> apply it
  if (updateReady && applyUpdate(btn)) return;

  // 3) otherwise check the server for a new version
  btn.textContent = 'CHECKING…';
  try {
    await swReg.update();
    if (swReg.waiting && navigator.serviceWorker.controller) { applyUpdate(btn); return; }
    const installing = swReg.installing;
    if (installing) {
      btn.textContent = 'UPDATING…';
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) applyUpdate(btn);
      });
      return;
    }
  } catch (e) { /* ignore */ }
  btn.textContent = offlineReady() ? 'UP TO DATE ✓' : 'INSTALL / UPDATE';
  setTimeout(() => { btn.textContent = 'INSTALL / UPDATE'; }, 1800);
}

// rank earned from the mission score
const RANKS = [
  { min: 0, name: 'Recruit' },
  { min: 200, name: 'Cadet' },
  { min: 400, name: 'Sergeant' },
  { min: 600, name: 'Lieutenant' },
  { min: 850, name: 'Captain' },
  { min: 1150, name: 'Major' },
  { min: 1500, name: 'Ace of Aces' },
];
function rankForScore(score) {
  let idx = 0;
  RANKS.forEach((r, i) => { if (score >= r.min) idx = i; });
  return { name: RANKS[idx].name, pips: idx };
}

game.onMissionEnd = (win, info) => {
  if (win && info.missionIndex >= highestUnlocked && highestUnlocked < MISSIONS.length - 1) {
    highestUnlocked = info.missionIndex + 1;
    saveUnlocked();
  }
  const isRecord = leaderboard.submit(info.missionIndex, info.score);
  const title = document.getElementById('end-title');
  const summary = document.getElementById('end-summary');
  title.textContent = win ? 'MISSION COMPLETE' : 'SHOT DOWN';
  title.className = win ? 'win' : 'lose';
  const rank = rankForScore(info.score);
  const flavour = win ? 'The objective is yours, Captain.' : 'Your Camel went down over the lines.';
  const rows = [
    ['Aircraft downed', info.kills],
    ['Ground targets', info.groundKills],
  ];
  if (info.bonus) rows.push(['Mission bonus', `+${info.bonus}`]);
  const stats = rows
    .map(([k, v]) => `<div class="end-row"><span>${k}</span><span>${v}</span></div>`)
    .join('');
  const unlock = win && highestUnlocked > info.missionIndex
    ? '<div class="end-unlock">NEW SORTIE UNLOCKED</div>' : '';
  const record = isRecord ? '<div class="end-newbest">NEW HIGH SCORE!</div>' : '';
  const pips = '★'.repeat(rank.pips);
  summary.innerHTML =
    `<div class="end-flavour">${flavour}</div>${stats}` +
    `<div class="end-score"><span>SCORE</span><span>${info.score}</span></div>` +
    `<div class="end-rank"><span class="end-rank-label">RANK</span>` +
    `<span class="end-rank-name">${rank.name}</span>` +
    `<span class="end-rank-pips">${pips}</span></div>${record}${unlock}`;
  showScreen('end-screen');
};

document.getElementById('btn-continue').addEventListener('click', showTitle);

// --- boot -------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// render one frame of the world behind the menu, then reveal
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  requestAnimationFrame(loop);
}

// Give the GPU a beat to compile, then drop the loading veil.
requestAnimationFrame(() => {
  // park the camera on a cinematic angle for the menu
  camera.position.set(120, 420, 1200);
  camera.lookAt(0, 250, -200);
  renderer.render(scene, camera);
  showTitle();
  requestAnimationFrame(loop);
});
