import * as THREE from 'three';
import Game from './core/game.js';
import Input from './controls/input.js';
import { CAMERA } from './core/config.js';
import { MISSIONS } from './ui/missions.js';
import { VERSION } from './core/version.js';
import settings, { OPTION_DEFS } from './core/settings.js';

// stamp the version on the home screen
const versionTag = document.getElementById('version-tag');
if (versionTag) versionTag.textContent = `v${VERSION}`;

// register the service worker for offline play (production build only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
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

// --- menu wiring ------------------------------------------------------------
const overlay = document.getElementById('overlay');
const titleScreen = document.getElementById('title-screen');
const endScreen = document.getElementById('end-screen');
const optionsScreen = document.getElementById('options-screen');
const loading = document.getElementById('loading');
let highestUnlocked = 0;

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
document.getElementById('btn-options').addEventListener('click', () => {
  buildOptions();
  titleScreen.classList.add('hidden');
  optionsScreen.classList.remove('hidden');
});
document.getElementById('btn-options-back').addEventListener('click', () => {
  optionsScreen.classList.add('hidden');
  titleScreen.classList.remove('hidden');
});

function buildMissionList() {
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'mission-card' + (i > highestUnlocked ? ' locked' : '');
    card.innerHTML = `
      <div class="m-no">${m.no}</div>
      <div class="m-name">${m.name}</div>
      <div class="m-desc">${m.desc}</div>
      <div class="m-status">${i > highestUnlocked ? 'LOCKED' : 'READY'}</div>`;
    if (i <= highestUnlocked) {
      card.addEventListener('click', () => launch(i));
    }
    list.appendChild(card);
  });
}

function showTitle() {
  buildMissionList();
  overlay.classList.remove('hidden');
  titleScreen.classList.remove('hidden');
  endScreen.classList.add('hidden');
  optionsScreen.classList.add('hidden');
}

function launch(index) {
  overlay.classList.add('hidden');
  titleScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  optionsScreen.classList.add('hidden');
  game.start(index);
}

game.onMissionEnd = (win, info) => {
  if (win && info.missionIndex >= highestUnlocked && highestUnlocked < MISSIONS.length - 1) {
    highestUnlocked = info.missionIndex + 1;
  }
  const title = document.getElementById('end-title');
  const summary = document.getElementById('end-summary');
  title.textContent = win ? 'MISSION COMPLETE' : 'SHOT DOWN';
  title.className = win ? 'win' : 'lose';
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
  summary.innerHTML =
    `<div class="end-flavour">${flavour}</div>${stats}` +
    `<div class="end-score"><span>SCORE</span><span>${info.score}</span></div>${unlock}`;
  overlay.classList.remove('hidden');
  endScreen.classList.remove('hidden');
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
  loading.classList.add('hidden');
  showTitle();
  requestAnimationFrame(loop);
});
