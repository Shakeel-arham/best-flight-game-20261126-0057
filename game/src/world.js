// Canyon Courier — seeded canyon world.
// One clear job: build the track the plane flies through. Given the same
// seed it always builds the same canyon, the same rings and the same
// runways, so a screenshot preset is reproducible.

var CC_WORLD = (function () {
  // Small deterministic PRNG (mulberry32). No Math.random anywhere here.
  function makeSeededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One track segment: where the canyon centre sits and how tall the walls are.
  function buildTrack(seed, cfg) {
    var rand = makeSeededRandom(seed);
    var segments = [];
    var curve = 0;        // lateral drift of the canyon centre line
    var wallH = 34;       // wall height in metres
    for (var i = 0; i < cfg.trackSegments; i++) {
      // Gentle S-curves: the canyon wanders, never sharply.
      curve += (rand() - 0.5) * 0.55;
      curve = Math.max(-1.6, Math.min(1.6, curve));
      wallH += (rand() - 0.5) * 6;
      wallH = Math.max(22, Math.min(58, wallH));
      segments.push({
        index: i,
        curve: curve,
        wallHeight: wallH,
        // Wall tops get a few scrub pines and boulders for silhouette.
        scrub: rand() < 0.28 ? rand() : -1,
        // A lone mesa butte far off to one side on some segments.
        butte: rand() < 0.06 ? (rand() < 0.5 ? -1 : 1) : 0,
      });
    }
    return segments;
  }

  // Ring gates for one mission: spread along the track, alternating sides
  // and heights so the pilot has to work the stick, not just hold it.
  function placeRings(seed, cfg, mission) {
    var rand = makeSeededRandom(seed * 7919 + 13);
    var rings = [];
    var usable = cfg.trackSegments - cfg.runwayLength * 2 - 10;
    var gap = usable / (mission.rings + 1);
    for (var r = 0; r < mission.rings; r++) {
      var seg = Math.floor(cfg.runwayLength + 8 + gap * (r + 1));
      rings.push({
        segment: seg,
        // Lateral offset and height weave: low, high, left, right.
        x: (rand() - 0.5) * cfg.canyonHalfWidth * 0.9,
        y: 18 + rand() * 55,
        passed: false,
        missed: false,
      });
    }
    return rings;
  }

  // Runway strips: one at the start for takeoff, one at the end for landing.
  function runwaySpans(cfg) {
    return {
      start: { from: 0, to: cfg.runwayLength },
      end: { from: cfg.trackSegments - cfg.runwayLength, to: cfg.trackSegments },
    };
  }

  function isOnRunway(segmentIndex, cfg) {
    var spans = runwaySpans(cfg);
    return (segmentIndex >= spans.start.from && segmentIndex < spans.start.to) ||
      (segmentIndex >= spans.end.from && segmentIndex < spans.end.to);
  }

  function isLandingRunway(segmentIndex, cfg) {
    var spans = runwaySpans(cfg);
    return segmentIndex >= spans.end.from && segmentIndex < spans.end.to;
  }

  // Total lateral offset of the canyon centre at a given segment, so the
  // renderer can bend the road and the physics can keep the plane inside.
  function centreOffsetAt(segments, segmentIndex, cfg) {
    var total = 0;
    var n = Math.min(segmentIndex, segments.length - 1);
    for (var i = 0; i <= n; i++) total += segments[i].curve;
    return total * cfg.segmentLength * 0.12;
  }

  function buildWorld(seed, missionIndex) {
    var cfg = CC_CONFIG;
    var mission = cfg.missions[missionIndex] || cfg.missions[0];
    return {
      seed: seed,
      mission: mission,
      missionIndex: missionIndex,
      segments: buildTrack(seed, cfg),
      rings: placeRings(seed, cfg, mission),
      trackLengthMetres: cfg.trackSegments * cfg.segmentLength,
    };
  }

  return {
    makeSeededRandom: makeSeededRandom,
    buildWorld: buildWorld,
    runwaySpans: runwaySpans,
    isOnRunway: isOnRunway,
    isLandingRunway: isLandingRunway,
    centreOffsetAt: centreOffsetAt,
  };
})();
