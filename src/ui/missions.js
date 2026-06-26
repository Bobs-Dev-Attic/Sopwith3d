import * as THREE from 'three';

// Three escalating sorties. Each mission's begin() wires up the live
// objective against the battlefield and returns a small runtime tracker.
export const MISSIONS = [
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
