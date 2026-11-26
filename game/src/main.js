// Canyon Courier — game loop, physics and states.
// One clear job: own the game state machine (menu / flying / crashed /
// landed), move the plane, check rings, walls, fuel and landings, and run
// the autopilot that flies the demo until the player takes the stick.

var CC_MAIN = (function () {
  var cfg = CC_CONFIG;

  var game = null;

  function newGame(missionIndex, seed) {
    var world = CC_WORLD.buildWorld(seed, missionIndex);
    return {
      world: world,
      state: 'menu',
      distance: cfg.segmentLength * 2,   // parked on the start runway
      x: 0,
      y: 0,
      speed: 0,
      throttle: 0,
      bank: 0,
      heading: 0,
      pitchVisual: 0,
      fuel: world.mission.fuelStart,
      hull: 100,
      score: 0,
      ringsPassed: 0,
      combo: 0,
      elapsed: 0,
      time: 0,                           // visual clock (prop, clouds)
      particles: [],
      flashText: '',
      flashTimer: 0,
      crashReason: '',
      autopilot: true,
      scrapeCooldown: 0,
      seed: seed,
    };
  }

  function startMission(missionIndex) {
    var seed = game ? game.seed : 1;
    game = newGame(missionIndex, seed);
    game.state = 'flying';
    game.autopilot = true;               // autopilot until first input
    CC_AUDIO.startEngine();
  }

  function restartMission() {
    if (!game) return;
    startMission(game.world.missionIndex);
  }

  // ---- autopilot -----------------------------------------------------

  function nextRingTarget() {
    for (var i = 0; i < game.world.rings.length; i++) {
      if (!game.world.rings[i].passed && !game.world.rings[i].missed) return game.world.rings[i];
    }
    return null;
  }

  function autopilotControls(dt) {
    var controls = { throttle: 0.7, bank: 0, pitch: 0 };
    var onStartRunway = CC_WORLD.isOnRunway(Math.floor(game.distance / cfg.segmentLength), cfg) &&
      game.distance < cfg.trackSegments * cfg.segmentLength / 2;
    if (onStartRunway && game.speed < 58) {
      // Takeoff roll: full throttle, stay on the strip.
      controls.throttle = 1;
      controls.pitch = 0;
      controls.bank = clamp(-game.x * 0.05, -0.4, 0.4);
      return controls;
    }
    var ring = nextRingTarget();
    var targetX = ring ? ring.x : 0;
    var targetY = ring ? ring.y : 42;
    targetX = clamp(targetX, -cfg.canyonHalfWidth + 10, cfg.canyonHalfWidth - 10);
    controls.bank = clamp((targetX - game.x) * 0.045, -cfg.maxBank, cfg.maxBank);
    controls.pitch = clamp((targetY - game.y) * 0.012, -0.7, 0.7);
    controls.throttle = game.y < 12 ? 0.85 : 0.7;
    return controls;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---- physics -------------------------------------------------------

  function updateFlying(dt) {
    var input = CC_INPUT;
    var controls;

    if (input.consumeAnyInput()) game.autopilot = false;

    if (game.autopilot) {
      controls = autopilotControls(dt);
      game.throttle = controls.throttle;
    } else {
      if (input.throttleUp()) game.throttle = clamp(game.throttle + 0.6 * dt, 0, 1);
      if (input.throttleDown()) game.throttle = clamp(game.throttle - 0.6 * dt, 0, 1);
      var mouse = input.mouseSteer();
      var bankTarget = 0;
      if (input.turnLeft()) bankTarget = -cfg.maxBank;
      if (input.turnRight()) bankTarget = cfg.maxBank;
      if (mouse.roll !== 0) bankTarget = clamp(mouse.roll * cfg.maxBank, -cfg.maxBank, cfg.maxBank);
      var pitchTarget = 0;
      if (input.climbKey()) pitchTarget = 1;
      if (input.diveKey()) pitchTarget = -1;
      if (mouse.pitch !== 0) pitchTarget = clamp(-mouse.pitch, -1, 1);
      controls = { throttle: game.throttle, bank: bankTarget, pitch: pitchTarget };
    }

    // Smooth the bank toward its target; the heading follows the bank.
    game.bank += (controls.bank - game.bank) * Math.min(1, 3.2 * dt);
    game.heading += game.bank * cfg.turnRate * dt;
    game.pitchVisual += (controls.pitch * 0.3 - game.pitchVisual) * Math.min(1, 4 * dt);

    // Speed chases the throttle target; a dry tank means a dead stick.
    var targetSpeed = cfg.minSpeed + game.throttle * (cfg.maxSpeed - cfg.minSpeed);
    if (game.fuel <= 0) targetSpeed = 0;
    var accel = game.speed < targetSpeed ? cfg.accelRate : cfg.accelRate * 1.6;
    game.speed += clamp(targetSpeed - game.speed, -accel * dt, accel * dt);

    // Lateral drift from the bank, vertical speed from the pitch.
    game.x += game.bank * cfg.lateralSpeed * dt;
    game.y += controls.pitch * (controls.pitch > 0 ? cfg.climbRate : cfg.sinkRate) * dt;
    game.y = clamp(game.y, 0, cfg.maxAltitude);
    game.distance += game.speed * dt;
    game.elapsed += dt;

    // Fuel: thirsty at full throttle, sipping at idle.
    var drain = cfg.fuelIdleDrain + game.throttle * cfg.fuelDrainPerSecond;
    game.fuel = Math.max(0, game.fuel - drain * dt);
    if (game.fuel <= 0 && game.throttle > 0) game.throttle = 0;

    // Sprint clock.
    if (game.world.mission.timeLimit > 0 && game.elapsed > game.world.mission.timeLimit) {
      crash('Out of time — the sprint window closed.');
      return;
    }

    checkRings();
    checkTerrain();
    if (game.scrapeCooldown > 0) game.scrapeCooldown -= dt;
    if (game.flashTimer > 0) game.flashTimer -= dt;
    CC_AUDIO.setEngine(game.throttle, game.speed);
  }

  function checkRings() {
    var segNow = Math.floor(game.distance / cfg.segmentLength);
    for (var i = 0; i < game.world.rings.length; i++) {
      var ring = game.world.rings[i];
      if (ring.passed || ring.missed) continue;
      if (ring.segment < segNow - 1 || ring.segment > segNow) continue;
      // The plane just crossed the ring's segment: measure the gap.
      var dx = ring.x - game.x;
      var dy = ring.y - game.y;
      var gap = Math.sqrt(dx * dx + dy * dy);
      if (gap <= cfg.ringRadius) {
        ring.passed = true;
        game.ringsPassed++;
        game.combo++;
        var gained = cfg.ringScore + (game.combo - 1) * cfg.ringComboBonus;
        game.score += gained;
        game.fuel = Math.min(cfg.fuelCapacity, game.fuel + cfg.fuelPerRing);
        game.flashText = '+' + gained + '  RING!' + (game.combo > 1 ? '  x' + game.combo + ' COMBO' : '');
        game.flashTimer = 1.4;
        CC_AUDIO.ringChime(game.combo);
        if (game.ringsPassed >= game.world.rings.length) {
          game.flashText = 'ALL RINGS — LAND ON THE FAR STRIP';
          game.flashTimer = 2.5;
        }
      } else if (gap <= cfg.ringOuterRadius) {
        ring.missed = true;
        game.combo = 0;
        damageHull(cfg.damagePerWallScrape, 'Clipped a ring post.');
      } else {
        ring.missed = true;
        game.combo = 0;
        game.flashText = 'RING MISSED';
        game.flashTimer = 1.0;
      }
    }
  }

  function checkTerrain() {
    var seg = Math.floor(game.distance / cfg.segmentLength);
    var wall = game.world.segments[Math.min(seg, game.world.segments.length - 1)];
    var halfW = cfg.canyonHalfWidth;

    // Canyon wall scrape.
    if (Math.abs(game.x) > halfW - 2 && game.y < wall.wallHeight) {
      if (game.scrapeCooldown <= 0) {
        game.scrapeCooldown = 0.8;
        game.x = clamp(game.x, -(halfW - 2), halfW - 2);
        game.bank = -game.bank * 0.5;
        spawnSparks();
        damageHull(cfg.damagePerWallScrape, 'Scraped the canyon wall.');
        CC_AUDIO.crashThud();
      }
    }

    // Ground contact.
    if (game.y <= 0) {
      if (CC_WORLD.isLandingRunway(seg, cfg)) {
        if (game.speed <= 78 && Math.abs(game.x) <= cfg.runwayHalfWidth + 3) {
          land();
        } else {
          crash(game.speed > 78 ? 'Came in too hot for the strip.' : 'Landed off the runway.');
        }
      } else if (CC_WORLD.isOnRunway(seg, cfg)) {
        game.y = 0; // takeoff roll on the start strip
      } else {
        crash('Flew into the canyon floor.');
      }
    }

    // Ran out of canyon.
    if (seg >= game.world.segments.length - 1 && game.state === 'flying') {
      if (game.y <= 0.5) land();
      else crash('Overshot the valley — no strip beyond the canyon.');
    }
  }

  function damageHull(amount, reason) {
    game.hull -= amount;
    if (game.hull <= 0) crash(reason);
  }

  function crash(reason) {
    if (game.state !== 'flying') return;
    game.state = 'crashed';
    game.crashReason = reason;
    game.score = Math.max(0, game.score - 50);
    spawnDebris();
    CC_AUDIO.crashThud();
    CC_AUDIO.stopEngine();
  }

  function land() {
    if (game.state !== 'flying') return;
    game.state = 'landed';
    game.y = 0;
    game.speed = Math.min(game.speed, 20);
    game.score += Math.round(game.fuel) * 2; // fuel bonus for a gentle landing
    CC_AUDIO.landingTick();
    CC_AUDIO.stopEngine();
  }

  // ---- particles -----------------------------------------------------

  function spawnSparks() {
    for (var i = 0; i < 12; i++) {
      game.particles.push({
        x: 640 + (Math.random() - 0.5) * 120,
        y: 610 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 220,
        vy: -Math.random() * 160,
        life: 0.7,
        maxLife: 0.7,
        size: 4 + Math.random() * 4,
        color: '#ffb347',
      });
    }
  }

  function spawnDebris() {
    var colours = ['#e8e4d8', '#d94f3d', '#ffb347', '#3d3d46'];
    for (var i = 0; i < 46; i++) {
      game.particles.push({
        x: 640 + (Math.random() - 0.5) * 200,
        y: 610 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 320,
        vy: -Math.random() * 260,
        life: 1.2 + Math.random(),
        maxLife: 2.2,
        size: 3 + Math.random() * 7,
        color: colours[i % colours.length],
      });
    }
  }

  function updateParticles(dt) {
    for (var i = game.particles.length - 1; i >= 0; i--) {
      var p = game.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 480 * dt;
      p.life -= dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
  }

  // ---- main loop -----------------------------------------------------

  function update(dt) {
    game.time += dt;
    updateParticles(dt);
    if (game.state === 'menu') {
      // Demo flight behind the menu: autopilot on, same physics.
      var saved = game.state;
      game.state = 'flying';
      updateFlying(dt);
      if (game.state === 'flying') game.state = saved;
      else { game.state = 'menu'; resetDemo(); }
    } else if (game.state === 'flying') {
      updateFlying(dt);
    }
    // crashed / landed / shot: frozen scene, particles settle.
  }

  function resetDemo() {
    var missionIndex = game.world.missionIndex;
    var seed = game.seed;
    game = newGame(missionIndex, seed);
    game.state = 'menu';
  }

  function handleMenuKeys() {
    var input = CC_INPUT;
    if (input.wasPressed('Digit1')) startMission(0);
    else if (input.wasPressed('Digit2')) startMission(1);
    else if (input.wasPressed('Digit3')) startMission(2);
    else if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) startMission(0);
  }

  function handleEndKeys() {
    if (CC_INPUT.wasPressed('KeyR') || CC_INPUT.wasPressed('Enter')) restartMission();
  }

  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (!game) return;
    var now = timestamp / 1000;
    if (frame.last === undefined) frame.last = now;
    var dt = Math.min(0.05, Math.max(0, now - frame.last));
    frame.last = now;

    if (game.state === 'menu') handleMenuKeys();
    if (game.state === 'crashed' || game.state === 'landed') handleEndKeys();
    if (game.state !== 'shot') update(dt);

    var canvas = frame.canvas;
    var ctx = canvas.getContext('2d');
    CC_RENDER.renderScene(ctx, game, game.world, cfg);
  }

  function boot(canvas) {
    game = newGame(0, 1);
    game.state = 'menu';
    frame.canvas = canvas;
    CC_INPUT.attach(canvas);
    CC_SHOTS.applyShotPreset(game);
    requestAnimationFrame(frame);
  }

  return {
    boot: boot,
    newGame: newGame,
    startMission: startMission,
    getGame: function () { return game; },
    // Used by the shot presets: swap the live game for a composed scene.
    replaceGame: function (fresh) { game = fresh; },
  };
})();
