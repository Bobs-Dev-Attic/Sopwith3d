// Central tuning for the whole sim. Units are loose "game units"; the HUD
// scales them into period-flavoured ft / mph for readout only.

export const WORLD = {
  groundSize: 11000,      // battlefield extent (square) — large open arena
  fogColor: 0x9a9488,     // hazy, overcast horizon
  fogNear: 900,
  fogFar: 6200,
  skyTop: 0x3a3d42,       // bruised grey storm sky
  skyBottom: 0xb8b0a0,    // pale smoke-lit horizon
  gravity: 9.8,
  seaLevel: 0,
  // soft patrol boundary: beyond `combatRadius` the plane is eased back toward
  // the action (with a warning) rather than letting you fly off into the fog
  combatRadius: 3000,
  boundaryBand: 1400,     // how far past the radius the turn-back ramps to full
};

// Fly-through cloud field.
export const CLOUDS = {
  count: 30,
  minAlt: 160,
  maxAlt: 620,
  spread: 5200,           // horizontal scatter radius
  puffsPer: 9,
  cloudRadius: 95,        // whiteout / fly-through radius
  drift: 5,               // slow easterly drift
};

// Anti-aircraft flak.
export const FLAK = {
  battlefieldInterval: 2.2,  // seconds between ambient bursts over the lines
  ambientDamageChance: 0.18, // a near miss occasionally stings
  damageRadius: 26,
  damage: 12,
  minAlt: 110,
};

// What happens when you desert — flee well past the boundary.
export const BARRAGE = {
  start: 1400,            // metres beyond combatRadius where the barrage opens up
  full: 1200,             // further out again => full intensity
  fuelDrain: 26,          // %/sec fuel burned while deserting (forces you down)
  flakPerSec: 5,
  tracersPerSec: 14,
  damagePerSec: 14,       // sustained ack-ack damage at full intensity
};

// Semi-realistic arcade flight model for the Sopwith Camel.
export const PLANE = {
  maxThrust: 34,          // forward acceleration at full throttle
  liftCoef: 0.0019,       // lift ~ liftCoef * speed^2 along wing-up
  dragCoef: 0.00055,      // parasitic drag ~ dragCoef * speed^2
  inducedDrag: 0.9,       // extra drag while hauling on the stick
  mass: 1,
  cruiseSpeed: 95,
  stallSpeed: 42,         // below this the wing lets go
  maxSpeed: 175,
  // Control authority (radians/sec at full deflection) — gentled for a less
  // twitchy feel; the expo curve in Plane.setStick softens small inputs further
  pitchRate: 0.95,
  rollRate: 1.7,
  yawRate: 0.42,
  yawFromRoll: 0.5,       // banked turns yaw the nose (coordinated turn)
  grip: 1.6,              // how hard velocity is dragged toward the nose
  rollReturn: 1.4,        // auto-levelling of roll when stick released
  stickExpo: 1.7,         // >1 = gentler near centre, full at the edges
  stickDeadzone: 0.06,
  // bank-angle control: stick X holds a bank (auto-levels when centred) so
  // turns are smooth and intuitive on a touchscreen instead of rate-rolling
  maxBank: 1.0,           // radians at full stick (~57°)
  rollGain: 2.2,          // how quickly we settle onto the commanded bank
  coordYaw: 0.2,          // rudder mixed in with the bank
  turnPull: 0.5,          // auto back-pressure per radian of bank (coordination)
  startThrottle: 0.7,
  startAltitude: 320,
  startSpeed: 95,
  hull: 100,
  gunDamage: 9,
  gunRpm: 600,
  bombs: 6,
  muzzleSpeed: 620,
  bombCount: 6,
  // fuel as a real resource (percent); burn scales with throttle
  fuel: 100,
  fuelBurnIdle: 0.15,
  fuelBurnFull: 0.9,
  rpmIdle: 650,
  rpmMax: 1250,
};

export const ENEMY = {
  maxThrust: 28,
  liftCoef: 0.0020,
  dragCoef: 0.0006,
  pitchRate: 1.1,
  rollRate: 2.0,
  yawRate: 0.45,
  yawFromRoll: 0.55,
  inducedDrag: 0.9,
  grip: 1.5,
  cruiseSpeed: 84,
  stallSpeed: 40,
  maxSpeed: 150,
  hull: 45,
  gunDamage: 6,
  gunRange: 720,
  gunCone: 0.06,          // how tightly it must be aimed to fire
  fireInterval: 0.12,
  engageRange: 1400,
  muzzleSpeed: 560,
};

export const CAMERA = {
  // chase distance/height are interpolated between these by the VIEW slider
  distanceNear: 13,
  distanceFar: 46,
  heightNear: 4.5,
  heightFar: 17,
  lookAhead: 14,
  defaultZoom: 0.26,      // closer than before by default
  stiffness: 3.4,         // position follow
  rotStiffness: 2.6,      // aim follow
  fov: 75,                // wider field of view
};

// Readout scaling — purely cosmetic flavour for the HUD.
export const HUD_SCALE = {
  altToFeet: 3.4,
  spdToMph: 1.15,
};
