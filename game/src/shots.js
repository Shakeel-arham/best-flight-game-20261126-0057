// Canyon Courier — deterministic screenshot presets.
// One clear job: read ?shot=start|play|end&seed=N&t=S from the URL and
// place the aircraft in a fixed, composed scene. The same seed always
// builds the same canyon, and t advances the flight a fixed number of
// seconds before the frame freezes, so two captures with different t show
// the loop moving.

var CC_SHOTS = (function () {
  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      shot: params.get('shot') || '',
      seed: parseInt(params.get('seed') || '1', 10) || 1,
      t: parseFloat(params.get('t') || '0') || 0,
    };
  }

  // Advance the frozen scene by a fixed number of autopilot seconds so the
  // play shot is mid-flight instead of parked on the runway. Deterministic:
  // fixed steps, no wall-clock input.
  function advanceFrozen(game, seconds) {
    var steps = Math.round(seconds / 0.05);
    var savedState = game.state;
    game.state = 'flying';
    game.autopilot = true;
    for (var i = 0; i < steps; i++) {
      game.time += 0.05;
      // Reuse the flight update without the input edge: call the loop's
      // update through a direct step by faking a frame tick.
      stepFlight(game, 0.05);
      if (game.state !== 'flying') break;
    }
    game.state = 'shot';
    game.time = 12.4; // fixed visual clock so the prop and clouds are set
  }

  // One deterministic physics step, copied from the main loop's update but
  // without keyboard handling (the shot must not depend on real input).
  function stepFlight(game, dt) {
    // This mirrors CC_MAIN's flying update for the autopilot case. It is
    // kept here so a shot never reads live input state.
    var cfg = CC_CONFIG;
    var world = game.world;
    var controls = autopilotControls(game, cfg);
    game.throttle = controls.throttle;
    game.bank += (controls.bank - game.bank) * Math.min(1, 3.2 * dt);
    game.heading += game.bank * cfg.turnRate * dt;
    game.pitchVisual += (controls.pitch * 0.3 - game.pitchVisual) * Math.min(1, 4 * dt);
    var targetSpeed = cfg.minSpeed + game.throttle * (cfg.maxSpeed - cfg.minSpeed);
    var accel = game.speed < targetSpeed ? cfg.accelRate : cfg.accelRate * 1.6;
    game.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - game.speed));
    game.x += game.bank * cfg.lateralSpeed * dt;
    game.y += controls.pitch * (controls.pitch > 0 ? cfg.climbRate : cfg.sinkRate) * dt;
    game.y = Math.max(0, Math.min(cfg.maxAltitude, game.y));
    game.distance += game.speed * dt;
    game.elapsed += dt;
    var drain = cfg.fuelIdleDrain + game.throttle * cfg.fuelDrainPerSecond;
    game.fuel = Math.max(0, game.fuel - drain * dt);
    markCrossedRings(game, cfg);
  }

  function autopilotControls(game, cfg) {
    var controls = { throttle: 0.7, bank: 0, pitch: 0 };
    var seg = Math.floor(game.distance / cfg.segmentLength);
    var onStartRunway = CC_WORLD.isOnRunway(seg, cfg) && game.distance < cfg.trackSegments * cfg.segmentLength / 2;
    if (onStartRunway && game.speed < 58) {
      controls.throttle = 1;
      controls.pitch = 0;
      controls.bank = Math.max(-0.4, Math.min(0.4, -game.x * 0.05));
      return controls;
    }
    var ring = null;
    for (var i = 0; i < game.world.rings.length; i++) {
      if (!game.world.rings[i].passed && !game.world.rings[i].missed) { ring = game.world.rings[i]; break; }
    }
    var targetX = ring ? ring.x : 0;
    var targetY = ring ? ring.y : 42;
    targetX = Math.max(-cfg.canyonHalfWidth + 10, Math.min(cfg.canyonHalfWidth - 10, targetX));
    controls.bank = Math.max(-cfg.maxBank, Math.min(cfg.maxBank, (targetX - game.x) * 0.045));
    controls.pitch = Math.max(-0.7, Math.min(0.7, (targetY - game.y) * 0.012));
    controls.throttle = game.y < 12 ? 0.85 : 0.7;
    return controls;
  }

  function markCrossedRings(game, cfg) {
    var segNow = Math.floor(game.distance / cfg.segmentLength);
    for (var i = 0; i < game.world.rings.length; i++) {
      var ring = game.world.rings[i];
      if (ring.passed || ring.missed) continue;
      // Only judge rings the plane is actually crossing right now: a
      // teleported scene must not score rings far behind it.
      if (ring.segment < segNow - 1 || ring.segment > segNow) continue;
      var dx = ring.x - game.x;
      var dy = ring.y - game.y;
      var gap = Math.sqrt(dx * dx + dy * dy);
      if (gap <= cfg.ringRadius) {
        ring.passed = true;
        game.ringsPassed++;
        game.combo++;
        game.score += cfg.ringScore + (game.combo - 1) * cfg.ringComboBonus;
        game.fuel = Math.min(cfg.fuelCapacity, game.fuel + cfg.fuelPerRing);
        game.flashText = '+' + (cfg.ringScore + (game.combo - 1) * cfg.ringComboBonus) + '  RING!';
        game.flashTimer = 1.4;
      } else {
        ring.missed = true;
        game.combo = 0;
      }
    }
  }

  function applyShotPreset(game) {
    var q = readQuery();
    if (!q.shot) return;
    var cfg = CC_CONFIG;
    // Rebuild the world with the requested seed so the shot is reproducible.
    var fresh = CC_MAIN.newGame(game.world.missionIndex, q.seed);
    fresh.seed = q.seed;

    if (q.shot === 'start') {
      // On the start runway, throttle up, nose on the strip ahead.
      fresh.state = 'flying';
      fresh.autopilot = true;
      advanceFrozen(fresh, Math.max(q.t, 1.2));
      fresh.flashText = '';
      fresh.flashTimer = 0;
    } else if (q.shot === 'play') {
      // Mid-flight: park the plane 45 m ahead of the third ring and freeze,
      // so the glowing ring fills the frame over the canyon. No advance:
      // the ring must stay ahead, not behind.
      var ring = fresh.world.rings[2] || fresh.world.rings[0];
      fresh.distance = ring.segment * cfg.segmentLength - 45;
      fresh.y = ring.y - 4;
      fresh.x = ring.x * 0.4;
      fresh.speed = 104;
      fresh.throttle = 0.78;
      fresh.bank = 0.12;
      fresh.state = 'flying';
      fresh.autopilot = true;
      if (q.t > 0) advanceFrozen(fresh, q.t);
      fresh.state = 'shot';
      fresh.time = 12.4;
      fresh.flashText = '';
      fresh.flashTimer = 0;
    } else if (q.shot === 'end') {
      // Landing approach: low and slow over the far runway, strip ahead.
      // Staged as a completed sortie — every ring threaded, fuel to spare.
      var spans = CC_WORLD.runwaySpans(cfg);
      fresh.distance = (spans.end.from - 2) * cfg.segmentLength;
      fresh.y = 9;
      fresh.x = 1;
      fresh.speed = 58;
      fresh.throttle = 0.34;
      fresh.state = 'flying';
      fresh.autopilot = true;
      if (q.t > 0) advanceFrozen(fresh, q.t);
      fresh.state = 'shot';
      fresh.time = 12.4;
      for (var ri = 0; ri < fresh.world.rings.length; ri++) fresh.world.rings[ri].passed = true;
      fresh.ringsPassed = fresh.world.rings.length;
      fresh.score = 940;
      fresh.fuel = 61;
      fresh.flashText = 'ALL RINGS — LAND ON THE FAR STRIP';
      fresh.flashTimer = 1.0;
    } else {
      return;
    }

    fresh.state = 'shot';
    // Swap the live game for the composed one.
    CC_MAIN.replaceGame(fresh);
  }

  return {
    readQuery: readQuery,
    applyShotPreset: applyShotPreset,
  };
})();
