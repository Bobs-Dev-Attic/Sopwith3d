# Sopwith Camel — Western Front

A mobile-first 3D WWI flight sim. You fly a **Sopwith Camel** in 3rd-person over
a bleak, cratered no-man's-land — strafing machine-gun nests, bombing trench
bunkers, and dogfighting Fokker triplanes. Built with **Three.js** and **Vite**,
it runs in any modern mobile or desktop browser (and can be wrapped as a PWA /
Capacitor app). Every model, texture, and terrain feature is generated
procedurally — there are no external art assets.

## Run it

```bash
npm install
npm run dev      # dev server with hot reload (http://localhost:5173)
# or
npm run build && npm run preview
```

Open it on a phone (or use your browser's device toolbar) for the touch
controls. On desktop, keyboard fallbacks are wired up for testing.

## Controls

| Action            | Touch                          | Keyboard            |
|-------------------|--------------------------------|---------------------|
| Pitch / bank      | Left **stick** (circle)        | `W`/`S`, `A`/`D` or arrows |
| Engine power      | Right **throttle** slider      | `Shift` / `Ctrl`    |
| Fire guns         | **GUNS** button                | `Space`             |
| Drop bombs        | **BOMBS** button               | `B`                 |

Pulling the stick **down** pulls the nose **up** (stick-back = climb), like a
real control column. Banking carves a coordinated turn.

## Flight model

A semi-realistic arcade model (`src/entities/flight.js`):

- **Thrust** along the nose, scaled by throttle.
- **Lift** along the wing-up axis, proportional to *v²* — so airspeed keeps you
  up, and dropping below stall speed lets the wing quit on you.
- **Drag** (parasitic + induced when you haul on the stick) and **gravity**.
- **Aerodynamic stability** drags your velocity vector toward where the nose
  points, so the Camel flies with believable momentum instead of on rails.

The same model flies the AI Fokkers, which pursue, lead their shots, bank into
turns, pull up to avoid the dirt, and only fire when the nose is on target.

**Realism options** layer real atmospherics on top (all off by default, so the
base game is unchanged): **Wind & Gusts** (aerodynamics act on airspeed relative
to a drifting, gusting wind, so you drift and have to crab into it), **Rain &
Murk** (heavier, bumpier wet air and poor visibility), **Cold Air** (colder =
denser air = more lift and engine bite), and **Realistic Stalls** (a sharper
stall break, mushier controls near the stall, and thinner air — less lift and
power — as you climb). A HUD readout shows wind speed/direction and temperature.

## Missions

1. **Silence the Guns** — strafe and destroy three machine-gun nests.
2. **Trench Buster** — flatten two fortified bunkers with bombs.
3. **Dawn Patrol** — shoot down three Fokker triplanes.

Missions unlock in sequence. Get shot down — or prang into the ground — and the
sortie is over.

## Weather & hazards

- **Clouds you can fly through** — drifting puffy cloud banks scattered across
  the airspace; plunge into one and the screen whites out until you punch back
  through.
- **Flak** — anti-aircraft fire bursts in black puffs over the lines; a near
  miss will rattle your hull.
- **Don't desert.** Stray past the patrol boundary and you're warned and eased
  back; push on regardless and the whole sky erupts with flak and ground fire
  while your fuel pours away — you will not make it out alive.

## What's animated

- Spinning propeller, deflecting **elevator / rudder / ailerons** that track
  your stick.
- **Damage** smoke that thickens as your hull drops, bursting into flame and a
  tumbling wreck when you're downed.
- Tracer rounds, muzzle flashes, bomb craters, balloon explosions, a drifting
  cloud bank, and a sun-shadowed battlefield.

## Sound

All audio is **synthesised at runtime with the Web Audio API** — no sound files,
so it works offline too. A rotary-engine drone whose pitch/throb tracks RPM,
airspeed wind, twin-Vickers gun reports, explosions, hit clangs, and a distant
artillery ambience. Tap the speaker icon to mute (remembered between sessions).

## Project layout

```
src/
  main.js                 entry: renderer, menu flow, game loop
  core/
    config.js             all flight / camera / world tuning
    game.js               entity management, weapons, collisions, mission flow
    chaseCamera.js        damped 3rd-person camera
  entities/
    flight.js             shared flight-dynamics integrator
    models.js             procedural Camel & Fokker (with moving parts)
    Plane.js              player aircraft
    EnemyPlane.js         AI Fokker
    weapons.js            tracer projectiles + gravity bombs
  world/
    sky.js                gradient sky, overcast light, clouds
    terrain.js            cratered, vertex-coloured battlefield
    battlefield.js        trenches, MG nests, bunkers, balloons, wire, trees
  fx/
    particles.js          pooled sprite smoke / fire / explosions
  controls/
    input.js              virtual stick, throttle, buttons + keyboard
  ui/
    hud.js  missions.js  styles.css
```

## Tuning

Almost everything that affects feel — thrust, lift, turn rates, enemy
aggression, camera follow, fog, mission contents — lives in
`src/core/config.js` and `src/ui/missions.js`. Tweak and reload.
