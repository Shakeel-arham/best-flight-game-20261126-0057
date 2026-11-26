// Canyon Courier — tuning constants.
// One clear job: every number the game balances on lives here so a
// play-tester can retune the flight feel without touching the logic.

var CC_CONFIG = {
  // Canvas and camera.
  canvasWidth: 1280,
  canvasHeight: 800,
  horizonY: 330,          // screen y of the horizon line
  cameraHeight: 9,        // camera sits this far above the plane's altitude
  cameraDepth: 0.9,       // pseudo-3D projection depth factor
  drawDistance: 260,      // how many track segments ahead are drawn

  // Track.
  segmentLength: 20,      // metres of track per segment
  trackSegments: 340,     // total segments (~6.8 km of canyon)
  canyonHalfWidth: 46,    // metres from centre line to each canyon wall
  runwayHalfWidth: 9,     // metres, half the runway strip width
  runwayLength: 26,       // segments of runway at each end of the track

  // Flight model.
  minSpeed: 28,           // m/s, stall edge
  maxSpeed: 148,          // m/s at full throttle
  cruiseSpeed: 96,        // m/s the autopilot aims for
  climbRate: 26,          // m/s of vertical speed at full pull
  sinkRate: 18,           // m/s of sink at full push
  maxAltitude: 130,       // m, soft ceiling
  turnRate: 0.55,         // rad/s of heading change at full bank
  maxBank: 0.62,          // rad of visual bank
  lateralSpeed: 34,       // m/s of sideways drift at full bank
  accelRate: 22,          // m/s^2 toward the throttle target speed

  // Fuel and damage.
  fuelCapacity: 100,
  fuelDrainPerSecond: 0.55,   // at full throttle
  fuelIdleDrain: 0.12,        // at closed throttle
  fuelPerRing: 7,             // bonus fuel for threading a ring
  damagePerWallScrape: 34,    // hull lost on a canyon-wall scrape
  damagePerGroundHit: 100,    // ground contact away from a runway is fatal

  // Rings.
  ringRadius: 13,         // metres, inner glow ring
  ringOuterRadius: 19,    // metres, post ring — clipping a post hurts
  ringScore: 100,
  ringComboBonus: 25,     // extra per consecutive ring without a miss

  // Missions: three sorties with different goals.
  missions: [
    { id: 1, name: 'DAWN DELIVERY', blurb: 'Thread 8 rings, land on the far strip.', rings: 8,  fuelStart: 100, timeLimit: 0 },
    { id: 2, name: 'CANYON SPRINT', blurb: 'Thread 12 rings before the clock runs out.', rings: 12, fuelStart: 85, timeLimit: 150 },
    { id: 3, name: 'NIGHT FREIGHT', blurb: 'Thread 6 rings on half a tank. No mistakes.', rings: 6,  fuelStart: 55, timeLimit: 0 },
  ],

  // Colours — one warm desert-dusk palette for the whole game.
  palette: {
    skyTop: '#2b3a67',
    skyMid: '#e8804a',
    skyHorizon: '#f7c873',
    sunCore: '#fff3c4',
    sunGlow: '#ffb347',
    mesaFar: '#7a4a63',
    mesaNear: '#5d3550',
    wallLeft: '#8a4f3d',
    wallRight: '#6e3a2e',
    wallTop: '#c98a5a',
    groundLight: '#c99a5e',
    groundDark: '#b3814a',
    runway: '#3d3d46',
    runwayLine: '#f2e6c9',
    ringGlow: '#37f2c3',
    ringPost: '#ff5d73',
    hudPanel: 'rgba(12, 18, 34, 0.72)',
    hudText: '#ffe9b8',
    hudAccent: '#37f2c3',
    hudWarn: '#ff5d73',
    planeBody: '#e8e4d8',
    planeTrim: '#d94f3d',
    planeGlass: '#7ec8e3',
  },
};
