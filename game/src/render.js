// Canyon Courier — pseudo-3D renderer.
// One clear job: turn the game state into pixels. Sky, sun, mesas, the
// canyon walls and ground strips in perspective, the runway, the glowing
// rings, the aircraft sprite, particles, and the whole HUD. No game logic
// lives here; it only reads the state it is handed.

var CC_RENDER = (function () {
  var FOCAL = 520; // projection focal length in pixels

  // ---- small helpers -------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Cumulative lateral offset of the canyon centre line, cached per world.
  function centreCache(world, cfg) {
    if (world._centreCache) return world._centreCache;
    var cache = [0];
    var total = 0;
    for (var i = 0; i < world.segments.length; i++) {
      total += world.segments[i].curve;
      cache.push(total * cfg.segmentLength * 0.12);
    }
    world._centreCache = cache;
    return cache;
  }

  // Project a world point (lateral metres, height metres) at a distance
  // ahead of the camera into screen space. Returns null behind the camera.
  function project(distanceAhead, worldX, height, cameraY, w, horizonY) {
    if (distanceAhead < 2) return null;
    var scale = FOCAL / distanceAhead;
    return {
      x: w / 2 + scale * worldX,
      y: horizonY + scale * (cameraY - height),
      scale: scale,
    };
  }

  // Darken or lighten a hex colour by a factor (0.7..1.15), used to give
  // each canyon segment its own strata shade instead of flat slabs.
  function shade(hex, factor) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = clamp(Math.round(r * factor), 0, 255);
    g = clamp(Math.round(g * factor), 0, 255);
    b = clamp(Math.round(b * factor), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // Deterministic per-segment shade: a tiny hash of the segment index.
  function segmentShade(n) {
    var h = ((n * 2654435761) >>> 0) % 1000 / 1000;
    return 0.88 + h * 0.22;
  }

  function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  // ---- sky -----------------------------------------------------------

  function drawSky(ctx, w, h, cfg, heading, time) {
    var pal = cfg.palette;
    var g = ctx.createLinearGradient(0, 0, 0, cfg.horizonY + 40);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.55, pal.skyMid);
    g.addColorStop(1, pal.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, cfg.horizonY + 40);

    // Sun, low and warm, drifting slowly with the heading.
    var sunX = w * 0.72 - heading * 40;
    var sunY = cfg.horizonY - 150 + Math.sin(time * 0.05) * 4;
    var glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
    glow.addColorStop(0, pal.sunCore);
    glow.addColorStop(0.35, pal.sunGlow);
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
    ctx.fillStyle = pal.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();

    // Far mesas, two parallax layers that slide with the heading.
    drawMesaLayer(ctx, w, cfg, heading * 60, 0.42, pal.mesaFar, 118);
    drawMesaLayer(ctx, w, cfg, heading * 110, 0.75, pal.mesaNear, 74);

    // A few slow clouds, each a small cluster of puffs.
    ctx.fillStyle = 'rgba(255, 236, 200, 0.32)';
    for (var i = 0; i < 5; i++) {
      var cx = ((i * 317 + time * 6) % (w + 320)) - 160;
      var cy = 70 + (i % 3) * 42;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 58 + (i % 2) * 24, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 34, cy + 5, 34, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 36, cy + 5, 30, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMesaLayer(ctx, w, cfg, offset, alpha, colour, baseH) {
    // Smooth desert-mesa silhouette: two layered sine waves, no steps, so
    // the far ridge reads as rock instead of city blocks.
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
    var y = cfg.horizonY;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    for (var x = -20; x <= w + 20; x += 24) {
      var wave = 0.62 + 0.24 * Math.sin((x + offset) * 0.008) + 0.14 * Math.sin((x + offset) * 0.021 + 1.7);
      ctx.lineTo(x, y - baseH * wave);
    }
    ctx.lineTo(w + 20, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- terrain -------------------------------------------------------

  function renderTerrain(ctx, state, world, cfg, w, h) {
    var pal = cfg.palette;
    var cache = centreCache(world, cfg);
    var baseSeg = Math.floor(state.distance / cfg.segmentLength);
    var playerWorldX = cache[baseSeg] + state.x;
    var cameraY = state.y + cfg.cameraHeight;
    var horizonY = cfg.horizonY;

    // Ground base: fill below the horizon so no gaps show at the edges.
    ctx.fillStyle = pal.groundDark;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    var ringQueue = [];
    var maxSeg = Math.min(baseSeg + cfg.drawDistance, world.segments.length - 1);
    for (var n = maxSeg; n >= baseSeg; n--) {
      var seg = world.segments[n];
      var d1 = n * cfg.segmentLength - state.distance;
      var d2 = (n + 1) * cfg.segmentLength - state.distance;
      if (d2 < 2) continue;
      var p1 = project(Math.max(d1, 2), cache[n] - playerWorldX, 0, cameraY, w, horizonY);
      var p2 = project(d2, cache[n + 1] - playerWorldX, 0, cameraY, w, horizonY);
      if (!p1 || !p2) continue;
      var half1 = p1.scale * cfg.canyonHalfWidth;
      var half2 = p2.scale * cfg.canyonHalfWidth;
      var top1 = horizonY + p1.scale * (cameraY - seg.wallHeight);
      var top2 = horizonY + p2.scale * (cameraY - seg.wallHeight);

      // Canyon floor strip, alternating warm tones.
      var floor = (n % 2 === 0) ? pal.groundLight : pal.groundDark;
      quad(ctx, p1.x - half1, p1.y, p2.x - half2, p2.y, p2.x + half2, p2.y, p1.x + half1, p1.y, floor);

      // Runway strip on runway segments.
      if (CC_WORLD.isOnRunway(n, cfg)) {
        var rw1 = p1.scale * cfg.runwayHalfWidth;
        var rw2 = p2.scale * cfg.runwayHalfWidth;
        quad(ctx, p1.x - rw1, p1.y, p2.x - rw2, p2.y, p2.x + rw2, p2.y, p1.x + rw1, p1.y, pal.runway);
        if (n % 2 === 0) {
          var dash1 = p1.scale * 1.1;
          var dash2 = p2.scale * 1.1;
          quad(ctx, p1.x - dash1, p1.y, p2.x - dash2, p2.y, p2.x + dash2, p2.y, p1.x + dash1, p1.y, pal.runwayLine);
        }
        // Runway edge lights.
        ctx.fillStyle = pal.ringGlow;
        ctx.fillRect(p1.x - rw1 - 2, p1.y - 2, 4, 4);
        ctx.fillRect(p1.x + rw1 - 2, p1.y - 2, 4, 4);
      }

      // Canyon walls: left and right quads, plus a sunlit top face.
      // Each segment gets its own strata shade from a hash of its index.
      var sh = segmentShade(n);
      quad(ctx, p1.x - half1, p1.y, p2.x - half2, p2.y, p2.x - half2, top2, p1.x - half1, top1, shade(pal.wallLeft, sh));
      quad(ctx, p1.x + half1, p1.y, p2.x + half2, p2.y, p2.x + half2, top2, p1.x + half1, top1, shade(pal.wallRight, sh * 0.94));
      var topOut1 = p1.scale * 16;
      var topOut2 = p2.scale * 16;
      quad(ctx, p1.x - half1, top1, p2.x - half2, top2, p2.x - half2 - topOut2, top2 - p2.scale * 4, p1.x - half1 - topOut1, top1 - p1.scale * 4, pal.wallTop);
      quad(ctx, p1.x + half1, top1, p2.x + half2, top2, p2.x + half2 + topOut2, top2 - p2.scale * 4, p1.x + half1 + topOut1, top1 - p1.scale * 4, pal.wallTop);

      // Scrub pines on the wall tops for silhouette.
      if (seg.scrub >= 0 && p1.scale > 0.35) {
        var side = seg.scrub < 0.5 ? -1 : 1;
        var tx = p1.x + side * (half1 + topOut1 * 0.5);
        var ty = top1 - p1.scale * 4;
        var ts = p1.scale * 5;
        ctx.fillStyle = '#3f5a34';
        ctx.beginPath();
        ctx.moveTo(tx, ty - ts * 2);
        ctx.lineTo(tx - ts, ty);
        ctx.lineTo(tx + ts, ty);
        ctx.closePath();
        ctx.fill();
      }

      // Collect rings on this segment for depth-sorted drawing.
      for (var ri = 0; ri < world.rings.length; ri++) {
        if (world.rings[ri].segment === n) ringQueue.push(world.rings[ri]);
      }
    }

    // Rings, far to near.
    ringQueue.sort(function (a, b) { return b.segment - a.segment; });
    for (var q = 0; q < ringQueue.length; q++) {
      drawRing(ctx, ringQueue[q], state, world, cfg, w);
    }
  }

  function drawRing(ctx, ring, state, world, cfg, w) {
    var pal = cfg.palette;
    var cache = centreCache(world, cfg);
    var baseSeg = Math.floor(state.distance / cfg.segmentLength);
    var playerWorldX = cache[baseSeg] + state.x;
    var cameraY = state.y + cfg.cameraHeight;
    var d = ring.segment * cfg.segmentLength - state.distance;
    if (d < 4) return;
    var p = project(d, cache[ring.segment] + ring.x - playerWorldX, ring.y, cameraY, w, cfg.horizonY);
    if (!p) return;
    var r = p.scale * cfg.ringRadius;
    if (r < 2) return;
    ctx.save();
    ctx.globalAlpha = ring.passed ? 0.25 : (ring.missed ? 0.45 : 1);
    ctx.strokeStyle = ring.missed ? pal.ringPost : pal.ringGlow;
    ctx.shadowColor = ring.missed ? pal.ringPost : pal.ringGlow;
    ctx.shadowBlur = 18;
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Support posts down to the canyon floor, kept slim and muted so a
    // close ring does not throw red bars across the whole frame.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 93, 115, 0.75)';
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    var floorY = cfg.horizonY + p.scale * cameraY;
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y);
    ctx.lineTo(p.x - r, floorY);
    ctx.moveTo(p.x + r, p.y);
    ctx.lineTo(p.x + r, floorY);
    ctx.stroke();
    // Next-ring chevron so the pilot can see the goal: only the first
    // unpassed ring still ahead of the plane carries the label.
    var segNow = Math.floor(state.distance / cfg.segmentLength);
    var nextRing = null;
    for (var ni = 0; ni < world.rings.length; ni++) {
      if (!world.rings[ni].passed && !world.rings[ni].missed && world.rings[ni].segment >= segNow) { nextRing = world.rings[ni]; break; }
    }
    if (ring === nextRing) {
      ctx.fillStyle = pal.ringGlow;
      ctx.font = 'bold ' + Math.max(12, Math.min(28, Math.round(r * 0.28))) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT', p.x, p.y - r - 12);
    }
    ctx.restore();
  }

  // ---- aircraft ------------------------------------------------------

  function drawPlaneShadow(ctx, state, cfg, w, h) {
    var alt = clamp(state.y, 0, 120);
    var size = lerp(92, 22, alt / 120);
    var alpha = lerp(0.28, 0.05, alt / 120);
    ctx.fillStyle = 'rgba(20, 12, 8, ' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 88, size, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlane(ctx, state, cfg, w, h) {
    var pal = cfg.palette;
    var cx = w / 2;
    var cy = h - 190;
    var bank = state.bank;
    var pitch = clamp(state.pitchVisual || 0, -0.3, 0.3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank);
    ctx.scale(1, 1 - pitch * 0.35);

    // The plane is seen from behind and slightly above: the nose points
    // away up-screen, the tail and its fin are nearest the camera.
    // Prop disc at the far nose, seen almost face-on.
    var propAngle = state.time * (6 + state.speed * 0.25);
    ctx.save();
    ctx.translate(0, -56);
    ctx.strokeStyle = 'rgba(240, 240, 230, 0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(propAngle);
    ctx.strokeStyle = 'rgba(230, 230, 220, 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.restore();

    // Vertical tail fin, rising from the tail toward the top of the frame.
    ctx.fillStyle = pal.planeTrim;
    ctx.beginPath();
    ctx.moveTo(-9, -38);
    ctx.lineTo(9, -38);
    ctx.lineTo(5, -86);
    ctx.lineTo(-5, -86);
    ctx.closePath();
    ctx.fill();

    // Main wings, wide and slightly swept.
    ctx.fillStyle = pal.planeBody;
    ctx.strokeStyle = pal.planeTrim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-168, 24);
    ctx.lineTo(-160, 42);
    ctx.lineTo(-10, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, -8);
    ctx.lineTo(168, 24);
    ctx.lineTo(160, 42);
    ctx.lineTo(10, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fuselage, foreshortened: short and round from behind.
    var body = ctx.createLinearGradient(0, -52, 0, 40);
    body.addColorStop(0, '#f7f3e6');
    body.addColorStop(0.5, pal.planeBody);
    body.addColorStop(1, '#b9b29c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -4, 27, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.planeTrim;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cockpit glass, high on the fuselage.
    ctx.fillStyle = pal.planeGlass;
    ctx.beginPath();
    ctx.ellipse(0, -20, 13, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-4, -27, 4, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal stabilizers at the tail, nearest the camera.
    ctx.fillStyle = pal.planeBody;
    ctx.strokeStyle = pal.planeTrim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 30);
    ctx.lineTo(-66, 44);
    ctx.lineTo(-60, 54);
    ctx.lineTo(-6, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 30);
    ctx.lineTo(66, 44);
    ctx.lineTo(60, 54);
    ctx.lineTo(6, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tail cone and navigation lights.
    ctx.fillStyle = pal.planeTrim;
    ctx.beginPath();
    ctx.ellipse(0, 42, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-166, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37f2c3';
    ctx.beginPath();
    ctx.arc(166, 32, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---- particles -----------------------------------------------------

  function drawParticles(ctx, particles) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD -----------------------------------------------------------

  function drawHudPanel(ctx, x, y, w, h, cfg) {
    ctx.fillStyle = cfg.palette.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 233, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHud(ctx, state, cfg, w, h) {
    var pal = cfg.palette;
    var altFt = Math.round(state.y * 3.28084);
    var speedKt = Math.round(state.speed * 1.94384);
    var headingDeg = Math.round(((state.heading * 180 / Math.PI) % 360 + 360) % 360);
    var ringsDone = state.ringsPassed;
    var ringsTotal = state.world.rings.length;

    // Top bar.
    drawHudPanel(ctx, 12, 10, w - 24, 56, cfg);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.hudText;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CANYON COURIER', 26, 26);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = pal.hudAccent;
    ctx.fillText(state.world.mission.name + '  ·  ' + state.world.mission.blurb, 26, 48);

    function stat(x, label, value, warn) {
      ctx.fillStyle = 'rgba(255, 233, 184, 0.6)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, 24);
      ctx.fillStyle = warn ? pal.hudWarn : pal.hudText;
      ctx.font = 'bold 20px monospace';
      ctx.fillText(value, x, 46);
    }
    stat(430, 'ALTITUDE ft', String(altFt), altFt < 50 && state.state === 'flying');
    stat(560, 'SPEED kt', String(speedKt), speedKt < 70 && state.state === 'flying');
    stat(690, 'HEADING', String(headingDeg).padStart(3, '0') + '°', false);
    stat(820, 'SCORE', String(state.score), false);
    stat(940, 'RINGS', ringsDone + '/' + ringsTotal, false);

    // Fuel gauge.
    ctx.fillStyle = 'rgba(255, 233, 184, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL', 1090, 24);
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(1040, 36, 100, 12);
    var fuelFrac = clamp(state.fuel / cfg.fuelCapacity, 0, 1);
    ctx.fillStyle = fuelFrac < 0.25 ? pal.hudWarn : pal.hudAccent;
    ctx.fillRect(1040, 36, 100 * fuelFrac, 12);
    ctx.fillStyle = pal.hudText;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(Math.round(state.fuel) + '%', 1090, 56);

    // Hull gauge.
    ctx.fillStyle = 'rgba(255, 233, 184, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.fillText('HULL', 1210, 24);
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(1170, 36, 80, 12);
    var hullFrac = clamp(state.hull / 100, 0, 1);
    ctx.fillStyle = hullFrac < 0.35 ? pal.hudWarn : '#ffb347';
    ctx.fillRect(1170, 36, 80 * hullFrac, 12);

    // Sprint timer.
    if (state.world.mission.timeLimit > 0 && state.state === 'flying') {
      var left = Math.max(0, state.world.mission.timeLimit - state.elapsed);
      ctx.fillStyle = left < 20 ? pal.hudWarn : pal.hudText;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TIME ' + Math.ceil(left) + 's', w / 2, 92);
    }

    // Bottom-left: artificial horizon.
    drawArtificialHorizon(ctx, 108, h - 108, 62, state.bank, state.pitchVisual || 0, cfg);

    // Bottom-centre: compass tape.
    drawCompassTape(ctx, w / 2 - 190, h - 66, 380, state.heading, cfg);

    // Bottom-right: throttle gauge.
    ctx.fillStyle = pal.hudPanel;
    ctx.beginPath();
    ctx.roundRect(w - 92, h - 168, 72, 148, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 233, 184, 0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', w - 56, h - 152);
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(w - 66, h - 136, 20, 104);
    ctx.fillStyle = pal.hudAccent;
    var th = clamp(state.throttle, 0, 1);
    ctx.fillRect(w - 66, h - 136 + 104 * (1 - th), 20, 104 * th);
    ctx.fillStyle = pal.hudText;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(Math.round(th * 100) + '%', w - 56, h - 26);

    // Ring flash message.
    if (state.flashText && state.flashTimer > 0) {
      ctx.globalAlpha = clamp(state.flashTimer, 0, 1);
      ctx.fillStyle = pal.ringGlow;
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.flashText, w / 2, 150);
      ctx.globalAlpha = 1;
    }

    // Speed lines at high speed.
    if (state.speed > 110 && state.state === 'flying') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 8; i++) {
        var ly = 120 + ((i * 97 + Math.floor(state.time * 900)) % 520);
        var lx = (i * 173) % w;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx, ly + 26);
        ctx.stroke();
      }
    }
  }

  function drawArtificialHorizon(ctx, x, y, r, bank, pitch, cfg) {
    var pal = cfg.palette;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.translate(0, pitch * r * 1.4);
    ctx.fillStyle = '#5a8fd0';
    ctx.fillRect(-r, -r, r * 2, r);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(-r, 0, r * 2, r);
    ctx.strokeStyle = '#ffe9b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = pal.hudText;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.fillStyle = pal.hudAccent;
    ctx.fillRect(x - 26, y - 2, 20, 4);
    ctx.fillRect(x + 6, y - 2, 20, 4);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.hudText;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', x, y + r + 14);
  }

  function drawCompassTape(ctx, x, y, w, heading, cfg) {
    var pal = cfg.palette;
    ctx.fillStyle = pal.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 44, 8);
    ctx.fill();
    var deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
    var points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, 44);
    ctx.clip();
    for (var d = -60; d <= 60; d += 15) {
      var a = (Math.round(deg) + d + 360) % 360;
      var px = x + w / 2 + d * (w / 130);
      ctx.fillStyle = pal.hudText;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      var label = (a % 45 === 0) ? points[Math.round(a / 45) % 8] : String(a).padStart(3, '0');
      ctx.fillText(label, px, y + 18);
      ctx.fillRect(px - 1, y + 26, 2, 8);
    }
    ctx.restore();
    ctx.fillStyle = pal.hudAccent;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w / 2 - 6, y - 8);
    ctx.lineTo(x + w / 2 + 6, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.hudText;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HEADING', x + w / 2, y + 58);
  }

  // ---- state overlays ------------------------------------------------

  function drawOverlay(ctx, state, cfg, w, h) {
    var pal = cfg.palette;
    if (state.state === 'menu') {
      ctx.fillStyle = 'rgba(10, 14, 28, 0.55)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.hudAccent;
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText('CANYON COURIER', w / 2, 190);
      ctx.fillStyle = pal.hudText;
      ctx.font = '20px sans-serif';
      ctx.fillText('A desert-canyon mail run. Thread the rings, mind the fuel, land her gentle.', w / 2, 232);
      // Mission cards.
      for (var i = 0; i < cfg.missions.length; i++) {
        var m = cfg.missions[i];
        var cx = w / 2 - 300 + i * 210;
        drawHudPanel(ctx, cx - 90, 300, 180, 110, cfg);
        ctx.fillStyle = pal.hudAccent;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('[' + (i + 1) + '] ' + m.name, cx, 330);
        ctx.fillStyle = pal.hudText;
        ctx.font = '13px sans-serif';
        wrapText(ctx, m.blurb, cx, 356, 164, 18);
      }
      ctx.fillStyle = pal.hudText;
      ctx.font = '16px sans-serif';
      ctx.fillText('W / S throttle  ·  Arrow keys pitch & roll  ·  Mouse steers  ·  R retry', w / 2, 470);
      ctx.fillStyle = pal.hudAccent;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Press 1, 2 or 3 to fly — or ENTER for Dawn Delivery', w / 2, 520);
      ctx.fillStyle = 'rgba(255, 233, 184, 0.7)';
      ctx.font = '13px sans-serif';
      ctx.fillText('Autopilot is flying the demo until you take the stick.', w / 2, 552);
    } else if (state.state === 'crashed') {
      ctx.fillStyle = 'rgba(60, 8, 10, 0.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a7a';
      ctx.font = 'bold 58px sans-serif';
      ctx.fillText('CRASHED', w / 2, 300);
      ctx.fillStyle = pal.hudText;
      ctx.font = '20px sans-serif';
      ctx.fillText(state.crashReason || 'The canyon wins this round.', w / 2, 342);
      ctx.font = '18px sans-serif';
      ctx.fillText('Score ' + state.score + '  ·  Rings ' + state.ringsPassed + '/' + state.world.rings.length, w / 2, 384);
      ctx.fillStyle = pal.hudAccent;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Press R to fly again', w / 2, 440);
    } else if (state.state === 'landed') {
      ctx.fillStyle = 'rgba(8, 50, 30, 0.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7dffb0';
      ctx.font = 'bold 58px sans-serif';
      ctx.fillText('LANDED — DELIVERY COMPLETE', w / 2, 300);
      ctx.fillStyle = pal.hudText;
      ctx.font = '20px sans-serif';
      ctx.fillText(state.world.mission.name + ' finished. The mail got through.', w / 2, 342);
      ctx.font = '18px sans-serif';
      ctx.fillText('Score ' + state.score + '  ·  Rings ' + state.ringsPassed + '/' + state.world.rings.length +
        '  ·  Fuel left ' + Math.round(state.fuel) + '%', w / 2, 384);
      ctx.fillStyle = pal.hudAccent;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Press R to fly the next sortie', w / 2, 440);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // ---- top level -----------------------------------------------------

  function renderScene(ctx, state, world, cfg) {
    var w = cfg.canvasWidth;
    var h = cfg.canvasHeight;
    drawSky(ctx, w, h, cfg, state.heading, state.time);
    renderTerrain(ctx, state, world, cfg, w, h);
    drawPlaneShadow(ctx, state, cfg, w, h);
    drawPlane(ctx, state, cfg, w, h);
    drawParticles(ctx, state.particles);
    drawHud(ctx, state, cfg, w, h);
    drawOverlay(ctx, state, cfg, w, h);
  }

  return {
    renderScene: renderScene,
    drawSky: drawSky,
    renderTerrain: renderTerrain,
    drawPlane: drawPlane,
    drawHud: drawHud,
  };
})();
