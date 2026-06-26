import * as THREE from 'three';

// Three escalating sorties. Each mission's begin() wires up the live
// objective against the battlefield and returns a small runtime tracker.
export const MISSIONS = [
  {
    no: 'TRAINING',
    name: 'Flight School',
    desc: 'A quiet sector behind our lines to find your wings. Practice flying, strafe the ground targets with your guns, bomb the bunkers, and down a couple of target drones. Nobody shoots back — fuel is unlimited.',
    begin(ctx) {
      const g = ctx.game;
      g.peaceful = true;           // hostiles hold fire
      g.plane.unlimitedFuel = true; // practice as long as you like

      // practice ground targets, laid out ahead of the start point
      const nests = ctx.battlefield.mgNests.slice(0, 3);
      const bunkers = ctx.battlefield.bunkers.slice(0, 2);
      const place = (t, x, z) => { t.group.position.set(x, 0, z); t.pos.set(x, t.pos.y, z); };
      place(nests[0], -260, -280); place(nests[1], 260, -440); place(nests[2], 0, -640);
      place(bunkers[0], -260, -920); place(bunkers[1], 260, -1040);
      [...nests, ...bunkers].forEach((t) => ctx.battlefield.markObjective(t));

      // disarmed target drones for gunnery practice
      const drones = [];
      [[-320, 360, -780], [340, 410, -1000]].forEach(([x, y, z]) => {
        const e = ctx.spawnEnemy(new THREE.Vector3(x, y, z), Math.PI);
        e.onFire = () => {};       // they won't shoot back
        drones.push(e);
      });

      return {
        text: () => `Strafe ${killed(nests)}/3 · Bomb ${killed(bunkers)}/2 · Drones ${downed(drones)}/2`,
        isWon: () => nests.every((t) => !t.alive) && bunkers.every((t) => !t.alive) && downed(drones) >= 2,
        liveMarks: () => [...nests, ...bunkers].filter((t) => t.alive).map((t) => t.pos)
          .concat(drones.filter((d) => d.alive).map((d) => d.state.position)),
      };
    },
  },
  {
    no: 'SORTIE I',
    name: 'Silence the Guns',
    desc: 'Enemy machine-gun nests are pinning our infantry in no-man’s-land. Strafe and destroy three of them.',
    begin(ctx) {
      const targets = ctx.battlefield.mgNests.slice(0, 3);
      targets.forEach((t) => ctx.battlefield.markObjective(t));
      return {
        text: () => `Destroy machine-gun nests  ${killed(targets)}/3`,
        isWon: () => targets.every((t) => !t.alive),
        targets,
        liveMarks: () => targets.filter((t) => t.alive).map((t) => t.pos),
      };
    },
  },
  {
    no: 'SORTIE II',
    name: 'Trench Buster',
    desc: 'Reduce two fortified bunkers on the support line. Bombs will do the job — line up your run and pickle them.',
    begin(ctx) {
      const targets = ctx.battlefield.bunkers.slice(0, 2);
      targets.forEach((t) => ctx.battlefield.markObjective(t));
      // a couple of nests stay hot to keep the run dangerous
      return {
        text: () => `Flatten the bunkers  ${killed(targets)}/2`,
        isWon: () => targets.every((t) => !t.alive),
        targets,
        liveMarks: () => targets.filter((t) => t.alive).map((t) => t.pos),
      };
    },
  },
  {
    no: 'SORTIE III',
    name: 'Dawn Patrol',
    desc: 'A flight of Fokker triplanes is hunting our observation balloons. Climb to meet them and clear the skies — down three.',
    begin(ctx) {
      const need = 3;
      // mark balloons they are after, for flavour / navigation
      ctx.battlefield.balloons.forEach((b) => ctx.battlefield.markObjective(b));
      const enemies = [];
      const spawnPts = [
        new THREE.Vector3(-300, 360, -900),
        new THREE.Vector3(350, 420, -1100),
        new THREE.Vector3(0, 480, -1400),
      ];
      spawnPts.forEach((p, i) => {
        const e = ctx.spawnEnemy(p, Math.PI + i * 0.3);
        enemies.push(e);
      });
      return {
        text: () => `Shoot down Fokkers  ${downed(enemies)}/${need}`,
        isWon: () => downed(enemies) >= need,
        enemies,
        liveMarks: () => enemies.filter((e) => e.alive).map((e) => e.state.position),
      };
    },
  },
];

const killed = (arr) => arr.filter((t) => !t.alive).length;
const downed = (arr) => arr.filter((e) => !e.alive).length;

export default class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;        // { battlefield, spawnEnemy, hud }
    this.runtime = null;
    this.index = -1;
    this.state = 'idle';   // idle | running | won | lost
  }

  start(index) {
    this.index = index;
    const mission = MISSIONS[index];
    this.runtime = mission.begin(this.ctx);
    this.state = 'running';
    this.ctx.hud.setObjective(this.runtime.text());
    return mission;
  }

  update() {
    if (this.state !== 'running' || !this.runtime) return this.state;
    this.ctx.hud.setObjective(this.runtime.text());
    if (this.runtime.isWon()) this.state = 'won';
    return this.state;
  }

  fail() { if (this.state === 'running') this.state = 'lost'; }

  // live world positions of the current objectives (for off-screen arrows)
  marks() {
    return (this.runtime && this.runtime.liveMarks) ? this.runtime.liveMarks() : [];
  }
}
