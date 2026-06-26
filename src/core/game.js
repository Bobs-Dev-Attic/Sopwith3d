import * as THREE from 'three';
import { setupSky } from '../world/sky.js';
import { buildTerrain } from '../world/terrain.js';
import Battlefield from '../world/battlefield.js';
import Plane from '../entities/Plane.js';
import EnemyPlane from '../entities/EnemyPlane.js';
import ParticleSystem from '../fx/particles.js';
import { Projectiles, Bombs } from '../entities/weapons.js';
import ChaseCamera from './chaseCamera.js';
import HUD from '../ui/hud.js';
import MissionManager, { MISSIONS } from '../ui/missions.js';
import { PLANE, ENEMY } from './config.js';

export default class Game {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.fx = new ParticleSystem(scene);
    this.sky = setupSky(scene);
    this.terrain = buildTerrain(scene);
    this.battlefield = new Battlefield(scene, this.fx);

    this.plane = new Plane(scene, this.fx);
    this.enemies = [];
    this.projectiles = new Projectiles(scene, this.fx);
    this.bombs = new Bombs(scene, this.fx);
    this.chase = new ChaseCamera(camera);
    this.hud = new HUD();

    this.missions = new MissionManager({
      battlefield: this.battlefield,
      hud: this.hud,
      spawnEnemy: (p, h) => this._spawnEnemy(p, h),
    });

    this.running = false;
    this.kills = 0;
    this._gunTimer = 0;
    this._deathTimer = 0;
    this.onMissionEnd = null;

    this._enemyColor = [0x7a2a22, 0x6a6256, 0x3a4a5a];
  }

  start(missionIndex) {
    this._clearEnemies();
    this.projectiles.clear();
    this.bombs.clear();
    this._rebuildBattlefield();

    this.plane.reset(new THREE.Vector3(0, PLANE.startAltitude, 900), 0);
    this.chase.snap();
    this.kills = 0;
    this.hud.setKills(0);
    this._deathTimer = 0;
    this._fuelWarned = false;

    this.input.setThrottle(PLANE.startThrottle);
    this.missions.start(missionIndex);
    this.hud.show();
    this.running = true;
    const m = MISSIONS[missionIndex];
    this.hud.banner(m.name.toUpperCase());
  }

  setInput(input) { this.input = input; }

  // A fresh battlefield each sortie — simplest way to guarantee destroyed
  // bunkers/balloons and spent objective markers don't linger between runs.
  _rebuildBattlefield() {
    if (this.battlefield) this.battlefield.dispose();
    this.battlefield = new Battlefield(this.scene, this.fx);
    this.missions.ctx.battlefield = this.battlefield;
  }

  _spawnEnemy(pos, heading) {
    const color = this._enemyColor[this.enemies.length % this._enemyColor.length];
    const e = new EnemyPlane(this.scene, this.fx, color);
    e.spawn(pos, heading);
    e.onFire = (self) => {
      const { pos: mp, dir } = self.worldMuzzle();
      this.projectiles.fire(mp, dir, ENEMY.muzzleSpeed, 'enemy', ENEMY.gunDamage);
    };
    this.enemies.push(e);
    return e;
  }

  _clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies.length = 0;
  }

  update(dt) {
    // cosmetic systems run even on menus
    this.fx.update(dt);
    this.sky.update(dt, this.plane.state.position);

    if (!this.running) { this.renderer.render(this.scene, this.camera); return; }

    this.input.pollKeyboard(dt);

    // --- player control ---
    if (this.plane.alive) {
      this.plane.setStick(this.input.pitch, this.input.yaw);
      this.plane.setThrottle(this.input.throttle);
      this._handlePlayerWeapons(dt);
    }
    this.plane.update(dt);
    this._checkGround(this.plane, true);

    // --- enemies ---
    for (const e of this.enemies) {
      e.update(dt, this.plane);
      if (e.alive) this._checkGround(e, false);
    }

    // --- battlefield (nests track & shoot the player) ---
    this.battlefield.update(dt, this.plane, (mp, dir) => {
      this.projectiles.fire(mp, dir, 540, 'enemy', 7);
    }, this.camera);

    // --- weapons & collisions ---
    const colliders = this._buildColliders();
    this.projectiles.update(dt, colliders);
    this.bombs.update(dt, this.battlefield.targets, () => {});

    this._tallyKills();

    const status = this.missions.update();
    if (status === 'won') return this._end(true);

    // death handling
    if (!this.plane.alive) {
      this._deathTimer += dt;
      if (this._deathTimer > 3) return this._end(false);
    }

    if (this.plane.fuelOut && !this._fuelWarned) {
      this._fuelWarned = true;
      this.hud.banner('ENGINE OUT — GLIDE HER DOWN');
    }

    this.hud.update(dt, this.plane);
    this.chase.setZoom(this.input.cameraZoom);
    this.chase.follow(this.plane, dt);
    this.renderer.render(this.scene, this.camera);
  }

  _handlePlayerWeapons(dt) {
    // guns
    this._gunTimer -= dt;
    if (this.input.firing && this._gunTimer <= 0) {
      this._gunTimer = 60 / PLANE.gunRpm;
      this.plane.group.updateMatrixWorld();
      const { pos, dir } = this.plane.worldMuzzle();
      // twin Vickers: fire from each side of the cowl
      for (const off of [-0.3, 0.3]) {
        const p = pos.clone();
        p.x += off;
        this.projectiles.fire(p, dir, PLANE.muzzleSpeed, 'player', PLANE.gunDamage);
      }
    }
    // bombs
    if (this.input.consumeBomb() && this.plane.bombs > 0) {
      this.plane.bombs--;
      const belly = this.plane.state.position.clone().add(new THREE.Vector3(0, -1.2, 0));
      this.bombs.drop(belly, this.plane.state.velocity);
    }
  }

  _buildColliders() {
    const list = [];
    // player as a target for enemy fire
    list.push({
      pos: this.plane.state.position, radius: 5.5, faction: 'player',
      alive: this.plane.alive,
      hit: (d) => { this.plane.takeDamage(d); this.hud.flashHit(); },
    });
    // enemy planes
    for (const e of this.enemies) {
      list.push({
        pos: e.state.position, radius: 6.5, faction: 'enemy', alive: e.alive,
        hit: (d) => e.takeDamage(d),
      });
    }
    // ground targets
    for (const t of this.battlefield.targets) {
      list.push(t); // already has pos/radius/faction/alive/hit
    }
    return list;
  }

  _checkGround(plane, isPlayer) {
    if (!plane.alive) {
      if (plane.state.position.y < -30) plane.group.visible = false;
      return;
    }
    if (plane.state.position.y <= 2) {
      plane.state.position.y = 2;
      // a gentle skim is survivable-ish; a real prang kills
      const vy = plane.state.velocity.y;
      if (vy < -8 || plane.state.speed > 70) {
        plane.kill();
        this.fx.groundBurst(plane.state.position, 1.8);
      } else {
        plane.takeDamage(20);
        plane.state.velocity.y = Math.max(0, vy);
      }
    }
  }

  _tallyKills() {
    for (const e of this.enemies) {
      if (!e.alive && !e._counted) {
        e._counted = true;
        this.kills++;
        this.hud.setKills(this.kills);
        this.hud.banner('FOKKER DOWN');
      }
    }
    for (const t of this.battlefield.targets) {
      if (!t.alive && !t._counted) {
        t._counted = true;
        if (t.objective || true) { /* count all destructions toward score feel */ }
      }
    }
  }

  _end(win) {
    this.running = false;
    this.hud.hide();
    if (this.onMissionEnd) {
      this.onMissionEnd(win, {
        kills: this.kills,
        missionIndex: this.missions.index,
      });
    }
  }
}
