import * as THREE from 'three';
import { setupSky } from '../world/sky.js';
import { buildTerrain } from '../world/terrain.js';
import Battlefield from '../world/battlefield.js';
import Plane from '../entities/Plane.js';
import EnemyPlane from '../entities/EnemyPlane.js';
import ParticleSystem from '../fx/particles.js';
import Debris from '../fx/debris.js';
import { Projectiles, Bombs } from '../entities/weapons.js';
import ChaseCamera from './chaseCamera.js';
import { steerToward } from '../entities/steering.js';
import AudioManager from '../audio/sound.js';
import Environment from './environment.js';
import Rain from '../fx/rain.js';
import settings from './settings.js';
import HUD from '../ui/hud.js';
import MissionManager, { MISSIONS } from '../ui/missions.js';
import Clouds from '../world/clouds.js';
import { PLANE, ENEMY, WORLD, FLAK, BARRAGE, FIELD } from './config.js';

// score, blast size, debris count and HUD banner per ground-target type
const GROUND_KILL = {
  balloon:  { pts: 75, blast: 2.8, debris: 0,  label: 'BALLOON BURST' },
  bunker:   { pts: 60, blast: 3.2, debris: 0,  label: 'BUNKER FLATTENED' },
  mgnest:   { pts: 40, blast: 2.2, debris: 0,  label: 'NEST SILENCED' },
  battery:  { pts: 90, blast: 3.6, debris: 16, label: 'BATTERY KNOCKED OUT' },
  tank:     { pts: 70, blast: 2.8, debris: 14, label: 'TANK BREWED UP' },
  truck:    { pts: 50, blast: 2.4, debris: 10, label: 'TRUCK DESTROYED' },
  barracks: { pts: 80, blast: 3.4, debris: 12, label: 'BARRACKS RAZED' },
  train:    { pts: 120, blast: 4.0, debris: 20, label: 'SUPPLY TRAIN WRECKED' },
  default:  { pts: 40, blast: 2.2, debris: 0,  label: 'TARGET DESTROYED' },
};

export default class Game {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.fx = new ParticleSystem(scene);
    this.debris = new Debris(scene);
    this.sky = setupSky(scene);
    this.environment = new Environment();
    this.rain = new Rain(scene);
    // remember fair-weather fog so we can thicken it for rain and restore it
    this._fog = scene.fog
      ? { near: scene.fog.near, far: scene.fog.far, color: scene.fog.color.clone() }
      : null;
    this.terrain = buildTerrain(scene);
    this.clouds = new Clouds(scene);
    this.battlefield = new Battlefield(scene, this.fx);

    this.plane = new Plane(scene, this.fx);
    this.enemies = [];
    this.projectiles = new Projectiles(scene, this.fx);
    this.bombs = new Bombs(scene, this.fx);
    this.chase = new ChaseCamera(camera);
    this.hud = new HUD();
    this.audio = new AudioManager();

    this.missions = new MissionManager({
      battlefield: this.battlefield,
      hud: this.hud,
      spawnEnemy: (p, h) => this._spawnEnemy(p, h),
      game: this,
    });

    this.peaceful = false;   // training sector: hostiles hold fire

    // bomb cam
    this._bombCam = false;
    this._bombCamTarget = null;
    this._bcTmp = new THREE.Vector3();
    this._bcHoriz = new THREE.Vector3();
    this._bcSide = new THREE.Vector3();
    this._bcImpact = new THREE.Vector3();
    this._bcUp = new THREE.Vector3(0, 1, 0);

    this.running = false;
    this._viewMode = 'chase';
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

    this.plane.reset(new THREE.Vector3(0, PLANE.startAltitude, 900 * FIELD), 0);
    this.chase.snap();
    this.kills = 0;
    this.groundKills = 0;
    this.score = 0;
    this.hud.setKills(0);
    this.hud.setScore(0);
    this._deathTimer = 0;
    this._fuelWarned = false;
    this._deathSoundPlayed = false;
    this._flakTimer = FLAK.battlefieldInterval;
    this._flakAcc = 0;
    this._tracerAcc = 0;
    this._barrageDmgAcc = 0;
    this._oobTimer = 0;
    this._crashed = false;
    this._postCrash = 0;
    this._viewMode = 'chase';
    this._bombCam = false;
    this._bombCamTarget = null;
    this.hud.setCinematic(false);
    if (this.plane.parts.head) this.plane.parts.head.visible = true;
    this.hud.setViewCaption('VIEW');

    // apply assist options (a mission's begin() may override, e.g. training)
    this.peaceful = false;
    this.plane.flightAssist = settings.get('flightAssist');
    this.plane.unlimitedFuel = settings.get('unlimitedFuel');
    this.plane.damageScale = settings.get('reinforcedHull') ? 0.5 : 1;
    this.aimAssist = settings.get('aimAssist');

    // weather / atmosphere
    this.environment.reset();
    this.environment.configure(settings);
    this._applyWeather();

    this.input.setThrottle(PLANE.startThrottle);
    this.missions.start(missionIndex);
    this.hud.show();
    this.audio.unlock();
    this.audio.startMission();
    this.running = true;
    const m = MISSIONS[missionIndex];
    this.hud.banner(m.name.toUpperCase());
  }

  setInput(input) { this.input = input; }

  // A fresh battlefield each sortie — simplest way to guarantee destroyed
  // bunkers/balloons and spent objective markers don't linger between runs.
  _rebuildBattlefield() {
    if (this.battlefield) this.battlefield.dispose();
    const seed = (Math.floor(Math.random() * 1e9) + 1) | 0;
    this.battlefield = new Battlefield(this.scene, this.fx, seed);
    this.missions.ctx.battlefield = this.battlefield;
  }

  // Patrol boundary with teeth. Stray past the combat radius and you're eased
  // back with a warning; desert far enough and the whole sky opens up with
  // flak and ground fire while your fuel pours away — you will not make it out.
  _enforceBoundary(dt) {
    const p = this.plane;
    const x = p.state.position.x, z = p.state.position.z;
    const r = Math.hypot(x, z);
    this.hud.setBarrage(0);
    if (r < WORLD.combatRadius) { this._oobTimer = 0; return; }

    // steer back toward the front (stronger the further out)
    const t = THREE.MathUtils.clamp((r - WORLD.combatRadius) / WORLD.boundaryBand, 0, 1);
    const desired = new THREE.Vector3(-x, 0, -z).normalize();
    p.setSteer(steerToward(p.state.quaternion, desired), Math.max(t, 0.3) * 0.9);

    const overBarrage = r - (WORLD.combatRadius + BARRAGE.start);
    if (overBarrage <= 0 || this.peaceful) {
      // warning band (or training) — just a nudge and a message, no barrage
      this._oobTimer -= dt;
      if (this._oobTimer <= 0) { this._oobTimer = 3.2; this.hud.banner('RETURN TO THE FRONT'); }
      return;
    }

    // --- deserter's barrage ---
    const bt = THREE.MathUtils.clamp(overBarrage / BARRAGE.full, 0.25, 1);
    this.hud.setBarrage(bt);

    // fuel pours out — forces you down fast (unless you've got infinite fuel)
    if (!p.unlimitedFuel) p.fuel = Math.max(0, p.fuel - BARRAGE.fuelDrain * dt);

    this._oobTimer -= dt;
    if (this._oobTimer <= 0) { this._oobTimer = 2.4; this.hud.banner('TURN BACK — YOU WILL BE SHOT DOWN'); }

    // fill the sky with bursting flak around the plane
    this._flakAcc += BARRAGE.flakPerSec * bt * dt;
    while (this._flakAcc >= 1) {
      this._flakAcc -= 1;
      this._burstFlakNear(p.state.position, 130, 0.45); // lethal-ish near the cockpit
    }

    // and streaking ground fire (real tracers that can hit)
    this._tracerAcc += BARRAGE.tracersPerSec * bt * dt;
    while (this._tracerAcc >= 1) {
      this._tracerAcc -= 1;
      this._spawnBarrageTracer(p.state.position);
    }

    // sustained ack-ack damage applied in small chunks
    this._barrageDmgAcc += BARRAGE.damagePerSec * bt * dt;
    if (this._barrageDmgAcc >= 6) {
      this._barrageDmgAcc = 0;
      p.takeDamage(6);
      this.hud.flashHit();
    }
  }

  // Ambient flak over the battlefield — mostly atmospheric near-misses.
  _ambientFlak(dt) {
    if (this.peaceful) return;
    const p = this.plane;
    const r = Math.hypot(p.state.position.x, p.state.position.z);
    if (r > WORLD.combatRadius || p.state.position.y < FLAK.minAlt) return;
    this._flakTimer -= dt;
    if (this._flakTimer > 0) return;
    this._flakTimer = FLAK.battlefieldInterval * (0.6 + Math.random() * 0.9);
    this._burstFlakNear(p.state.position, 240, FLAK.ambientDamageChance);
  }

  _burstFlakNear(center, spread, dmgChance) {
    const off = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread * 0.5,
      (Math.random() - 0.5) * spread
    );
    const pos = center.clone().add(off);
    pos.y = Math.max(FLAK.minAlt * 0.5, pos.y);
    const size = 0.9 + Math.random() * 0.8;
    this.fx.flak(pos, size);
    const dist = pos.distanceTo(this.plane.state.position);
    this.audio.explosion(Math.max(0.3, 1.2 - dist / 300));
    if (dist < FLAK.damageRadius && Math.random() < dmgChance) {
      this.plane.takeDamage(FLAK.damage);
      this.hud.flashHit();
    }
  }

  _spawnBarrageTracer(target) {
    // fire from a random point off to the side/below, aimed with a small miss
    const dir = new THREE.Vector3(Math.random() - 0.5, -0.4 - Math.random() * 0.5, Math.random() - 0.5).normalize();
    const origin = target.clone().addScaledVector(dir, -(320 + Math.random() * 220));
    const miss = new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
    const aim = target.clone().add(miss).sub(origin).normalize();
    this.projectiles.fire(origin, aim, 560, 'enemy', 8);
  }

  _applyWeather() {
    const raining = this.environment.rain;
    this.rain.setActive(raining);
    if (this.sky.setRain) this.sky.setRain(raining);
    if (this._fog && this.scene.fog) {
      if (raining) {
        this.scene.fog.near = 280;
        this.scene.fog.far = 2500;
        this.scene.fog.color.setHex(0x686b6e);
        if (this.scene.background && this.scene.background.setHex) this.scene.background.setHex(0x686b6e);
      } else {
        this.scene.fog.near = this._fog.near;
        this.scene.fog.far = this._fog.far;
        this.scene.fog.color.copy(this._fog.color);
        if (this.scene.background && this.scene.background.copy) this.scene.background.copy(this._fog.color);
      }
    }
  }

  // big ground blast: fireball + dirt + shockwave + flying debris + boom
  _groundExplosion(pos, size = 2.6) {
    const p = pos.clone(); p.y = Math.max(0, p.y);
    this.fx.groundBurst(p, size);
    this.debris.burst(p, Math.round(10 + size * 6), { spread: 14 + size * 6, up: 14 + size * 5 });
    this.audio.explosion(Math.min(1.4, 0.6 + size * 0.25));
  }

  // the Camel hits the deck — one decisive blast, then hold for the dialog
  _crashImpact() {
    if (this._crashed) return;
    this._crashed = true;
    this._postCrash = 0;
    const p = this.plane.state.position.clone();
    p.y = Math.max(0, p.y);
    this._groundExplosion(p, 3.4);
    this.debris.burst(p, 22, { spread: 26, up: 22 });   // extra wreckage
    this.plane.group.visible = false;
  }

  // --- bomb cam: cut to a chase view of the falling bomb to its impact ---
  _enterBombCam(bomb) {
    if (this._bombCam || !bomb || !settings.get('bombCam')) return;
    this._bombCam = true;
    this._bombCamTarget = bomb;
    this._bcTime = 0;
    this._bcHold = 0;
    this._bcImpact.copy(bomb.position);
    this._bcPrevAssist = this.plane.flightAssist;
    this.input.firing = false;          // don't carry a held trigger in
    this.hud.setCinematic(true, 'BOMB AWAY');
  }

  _exitBombCam() {
    if (!this._bombCam) return;
    this._bombCam = false;
    this._bombCamTarget = null;
    this.plane.flightAssist = this._bcPrevAssist;
    this.chase.snap();
    this.hud.setCinematic(false);
  }

  _updateBombCam(dt) {
    this._bcTime += dt;
    // tap bombs again, or run long, to skip
    if (this.input.consumeBomb() || this._bcTime > 6.5 || !this.plane.alive) {
      this._exitBombCam();
      return;
    }

    const bomb = this._bombCamTarget;
    const flying = bomb && this.bombs.active.includes(bomb);
    const k = 1 - Math.exp(-6 * dt);

    if (flying) {
      this._bcImpact.copy(bomb.position);
      const v = bomb.userData.vel;
      this._bcHoriz.set(v.x, 0, v.z);
      if (this._bcHoriz.lengthSq() < 0.01) this._bcHoriz.set(0, 0, -1);
      this._bcHoriz.normalize();
      this._bcSide.crossVectors(this._bcHoriz, this._bcUp).normalize();
      // up, off to the side, slightly trailing
      this._bcTmp.copy(bomb.position)
        .addScaledVector(this._bcUp, 7)
        .addScaledVector(this._bcSide, 9)
        .addScaledVector(this._bcHoriz, -5);
      this._bcTmp.y = Math.max(this._bcTmp.y, bomb.position.y + 3, 4);
      this.camera.position.lerp(this._bcTmp, k);
      this.camera.lookAt(
        bomb.position.x + this._bcHoriz.x * 4,
        bomb.position.y - 2,
        bomb.position.z + this._bcHoriz.z * 4
      );
    } else {
      // detonated — hold on the impact for a beat, then return
      this._bcHold += dt;
      this.camera.lookAt(this._bcImpact);
      if (this._bcHold > 0.8) this._exitBombCam();
    }
  }

  _spawnEnemy(pos, heading) {
    const color = this._enemyColor[this.enemies.length % this._enemyColor.length];
    const e = new EnemyPlane(this.scene, this.fx, color);
    e.spawn(pos, heading);
    e.onFire = (self) => {
      const { pos: mp, dir } = self.worldMuzzle();
      this.projectiles.fire(mp, dir, ENEMY.muzzleSpeed, 'enemy', ENEMY.gunDamage);
      this.audio.enemyGun(mp.distanceTo(this.plane.state.position));
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
    this.debris.update(dt);
    this.sky.update(dt, this.plane.state.position);
    this.clouds.update(dt);
    this.environment.update(dt);
    this.rain.update(dt, this.camera.position, this.environment.wind);

    if (!this.running) { this.renderer.render(this.scene, this.camera); return; }

    this.input.pollKeyboard(dt);

    // --- player control ---
    if (this.plane.alive) {
      if (this._bombCam) {
        // controls are suspended during the cinematic — hold her level
        this.plane.flightAssist = true;
        this.plane.setStick(0, 0);
        this.plane.setThrottle(this.input.throttle);
      } else {
        this.plane.setStick(this.input.pitch, this.input.yaw);
        this.plane.setThrottle(this.input.throttle);
        this._handlePlayerWeapons(dt);
        this._enforceBoundary(dt);
        this._ambientFlak(dt);
      }
    }
    const env = this.environment.envFor();
    this.plane.update(dt, env);
    this._checkGround(this.plane, true);

    // --- enemies ---
    for (const e of this.enemies) {
      e.update(dt, this.plane, env);
      if (e.alive) this._checkGround(e, false);
    }

    // --- battlefield (nests track & shoot the player) ---
    this.battlefield.update(dt, this.plane, (mp, dir) => {
      if (this.peaceful) return;            // training: nests hold fire
      this.projectiles.fire(mp, dir, 540, 'enemy', 7);
      this.audio.enemyGun(mp.distanceTo(this.plane.state.position));
    }, this.camera);

    // --- weapons & collisions ---
    const colliders = this._buildColliders();
    this.projectiles.update(dt, colliders);
    this.bombs.update(dt, this.battlefield.targets, (pos) => this._groundExplosion(pos, 3.2));

    this._tallyKills();

    const status = this.missions.update();
    if (status === 'won') return this._end(true);

    // --- game over: let the Camel fall and crash, then show the dialog ---
    if (!this.plane.alive) {
      if (!this._deathSoundPlayed) {
        this._deathSoundPlayed = true;
        this.audio.explosion(1.8);
        this.hud.banner('SHOT DOWN');
      }
      this._deathTimer += dt;
      // detect the wreck striking the ground
      if (!this._crashed && this.plane.state.position.y <= 3) this._crashImpact();
      if (this._crashed) {
        this._postCrash += dt;
        if (this._postCrash > 1.6) return this._end(false);
      } else if (this._deathTimer > 7) {
        return this._end(false);   // fallback if it never lands
      }
    }

    if (this.plane.fuelOut && !this._fuelWarned) {
      this._fuelWarned = true;
      this.hud.banner('ENGINE OUT — GLIDE HER DOWN');
    }

    this.audio.update(this.plane.rpm, this.plane.state.throttle, this.plane.state.speed, this.plane.alive);
    this.hud.update(dt, this.plane);

    if (this._bombCam) {
      this._updateBombCam(dt);
    } else {
      // cockpit view is disabled while going down (the wreck is hidden)
      const zoom = this.plane.alive ? this.input.cameraZoom : Math.max(0.3, this.input.cameraZoom);
      this.chase.setZoom(zoom);
      if (this.chase.mode !== this._viewMode) {
        this._viewMode = this.chase.mode;
        this.hud.flashViewFade();
        this.hud.setViewCaption(this._viewMode === 'cockpit' ? 'COCKPIT' : 'VIEW');
        if (this.plane.parts.head) this.plane.parts.head.visible = this._viewMode !== 'cockpit';
      }
      this.chase.follow(this.plane, dt);
    }

    // whiteout when the camera plunges into a cloud
    this.hud.setCloudVeil(this.clouds.whiteoutAt(this.camera.position));

    // arrows pointing to off-screen objectives
    this.hud.updateArrows(this.missions.marks(), this.camera);
    // radar / minimap
    this.hud.updateMinimap(dt, this.plane, this.enemies, this.battlefield.targets, this.missions.marks());

    // wind / weather indicator
    const fwd = this._bcHoriz.set(0, 0, -1).applyQuaternion(this.plane.state.quaternion);
    this.hud.setWind(this.environment.active, this.environment.readout(), Math.atan2(fwd.x, fwd.z));

    this.renderer.render(this.scene, this.camera);
  }

  _handlePlayerWeapons(dt) {
    // guns
    this._gunTimer -= dt;
    if (this.input.firing && this._gunTimer <= 0) {
      this._gunTimer = 60 / PLANE.gunRpm;
      this.plane.group.updateMatrixWorld();
      const { pos, dir } = this.plane.worldMuzzle();
      const aim = this.aimAssist ? this._assistedAim(pos, dir) : dir;
      // twin Vickers: fire from each side of the cowl
      for (const off of [-0.3, 0.3]) {
        const p = pos.clone();
        p.x += off;
        this.projectiles.fire(p, aim, PLANE.muzzleSpeed, 'player', PLANE.gunDamage);
      }
      this.audio.gun(0.5);
    }
    // bombs
    if (this.input.consumeBomb() && this.plane.bombs > 0) {
      this.plane.bombs--;
      const belly = this.plane.state.position.clone().add(new THREE.Vector3(0, -1.2, 0));
      const bomb = this.bombs.drop(belly, this.plane.state.velocity);
      this._enterBombCam(bomb);
    }
  }

  // Aim Assist: bend the burst onto the nearest target inside a forward cone,
  // leading moving aircraft so shots actually connect.
  _assistedAim(muzzle, forward) {
    const cosCone = Math.cos(0.3);   // ~17° half-angle
    const maxRange = 1050;
    let best = null, bestDot = cosCone;
    const consider = (pos, vel) => {
      const to = pos.clone().sub(muzzle);
      const dist = to.length();
      if (dist < 1 || dist > maxRange) return;
      if (vel) to.addScaledVector(vel, dist / PLANE.muzzleSpeed); // lead
      to.normalize();
      const dot = to.dot(forward);
      if (dot > bestDot) { bestDot = dot; best = to.clone(); }
    };
    for (const e of this.enemies) if (e.alive) consider(e.state.position, e.state.velocity);
    for (const t of this.battlefield.targets) if (t.alive) consider(t.pos, null);
    return best ? forward.clone().lerp(best, 0.95).normalize() : forward;
  }

  _buildColliders() {
    const list = [];
    // player as a target for enemy fire
    list.push({
      pos: this.plane.state.position, radius: 5.5, faction: 'player',
      alive: this.plane.alive,
      hit: (d) => { this.plane.takeDamage(d); this.hud.flashHit(); this.audio.hit(); },
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
      if (isPlayer && !this._crashed && plane.state.position.y <= 2) this._crashImpact();
      if (plane.state.position.y < -30) plane.group.visible = false;
      return;
    }
    if (plane.state.position.y <= 2) {
      plane.state.position.y = 2;
      if (isPlayer) {
        // flying into the deck is a crash — kill, then the crash sequence runs
        plane.kill();
        this._crashImpact();
        return;
      }
      // enemies: a hard prang kills, a graze just hurts
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
        this._award(100);
        this.hud.setKills(this.kills);
        this.hud.banner('FOKKER DOWN  +100');
        this.fx.explosion(e.state.position, 1.8);
        this.debris.burst(e.state.position, 14, { spread: 16, up: 10 });
        this.audio.explosion(1.5);
      }
    }
    for (const t of this.battlefield.targets) {
      if (!t.alive && !t._counted) {
        t._counted = true;
        this.groundKills++;
        const info = GROUND_KILL[t.type] || GROUND_KILL.default;
        this._award(info.pts);
        this.hud.banner(`${info.label}  +${info.pts}`);
        if (t.type === 'balloon') {
          // a fireball aloft, raining debris
          this.fx.explosion(t.pos, 2.8);
          this.debris.burst(t.pos, 18, { spread: 16, up: 6 });
          this.audio.explosion(2.0);
        } else {
          this._groundExplosion(t.pos, info.blast);
          if (info.debris) this.debris.burst(t.pos, info.debris, { spread: 14, up: 8 });
        }
      }
    }
  }

  _award(points) {
    this.score += points;
    this.hud.setScore(this.score);
  }

  _end(win) {
    this.running = false;
    this._exitBombCam();
    this.hud.hide();
    this.audio.endMission();
    const bonus = win ? 500 : 0;
    if (win) this._award(bonus);
    if (this.onMissionEnd) {
      this.onMissionEnd(win, {
        kills: this.kills,
        groundKills: this.groundKills,
        bonus,
        score: this.score,
        missionIndex: this.missions.index,
      });
    }
  }
}
