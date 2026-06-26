// Central tuning for the whole sim. Units are loose "game units"; the HUD
// scales them into period-flavoured ft / mph for readout only.

export const WORLD = {
  groundSize: 6000,       // battlefield extent (square)
  fogColor: 0x9a9488,     // hazy, overcast horizon
  fogNear: 700,
  fogFar: 4200,
  skyTop: 0x3a3d42,       // bruised grey storm sky
  skyBottom: 0xb8b0a0,    // pale smoke-lit horizon
  gravity: 9.8,
  seaLevel: 0,
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
  // Control authority (radians/sec at full deflection)
  pitchRate: 1.35,
  rollRate: 2.5,
  yawRate: 0.5,
  yawFromRoll: 0.55,      // banked turns yaw the nose (coordinated turn)
  grip: 1.6,              // how hard velocity is dragged toward the nose
  rollReturn: 1.4,        // auto-levelling of roll when stick released
  startThrottle: 0.7,
  startAltitude: 320,
  startSpeed: 95,
  hull: 100,
  gunDamage: 9,
  gunRpm: 600,
  bombs: 6,
  muzzleSpeed: 620,
  bombCount: 6,
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
  distance: 26,
  height: 9,
  lookAhead: 14,
  stiffness: 3.4,         // position follow
  rotStiffness: 2.6,      // aim follow
  fov: 62,
};

// Readout scaling — purely cosmetic flavour for the HUD.
export const HUD_SCALE = {
  altToFeet: 3.4,
  spdToMph: 1.15,
};
