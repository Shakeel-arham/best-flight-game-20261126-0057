// Canyon Courier — WebAudio sounds.
// One clear job: every sound the game makes, synthesized with oscillators
// only. No audio files, no network. The context is created lazily on the
// first user gesture, so headless screenshot runs stay silent and safe.

var CC_AUDIO = (function () {
  var ctx = null;
  var engineOsc = null;
  var engineGain = null;
  var enabled = true;

  function ensureContext() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  // Engine hum: a low sawtooth whose pitch follows the throttle, plus a
  // soft filtered noise bed is overkill — one oscillator does the job.
  function startEngine() {
    var ac = ensureContext();
    if (!ac || engineOsc) return;
    try {
      engineOsc = ac.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ac.createGain();
      engineGain.gain.value = 0.0;
      var filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ac.destination);
      engineOsc.start();
    } catch (e) {
      engineOsc = null;
    }
  }

  function setEngine(throttle, speed) {
    if (!engineOsc || !engineGain || !ctx) return;
    var target = enabled ? 0.05 + throttle * 0.06 + speed * 0.0002 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speed * 0.15, ctx.currentTime, 0.1);
  }

  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch (e) { /* already stopped */ }
    engineOsc = null;
    engineGain = null;
  }

  // Short two-note chime when a ring is threaded.
  function ringChime(combo) {
    var ac = ensureContext();
    if (!ac || !enabled) return;
    try {
      var base = 660 + Math.min(combo, 8) * 40;
      [0, 0.09].forEach(function (delay, i) {
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = base * (i === 0 ? 1 : 1.5);
        gain.gain.setValueAtTime(0.0001, ac.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.5);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime + delay + 0.55);
      });
    } catch (e) { /* audio is best-effort */ }
  }

  // Crash thud: a burst of low noise made from a detuned square wave.
  function crashThud() {
    var ac = ensureContext();
    if (!ac || !enabled) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(28, ac.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.55);
    } catch (e) { /* audio is best-effort */ }
  }

  // Gentle touchdown tick for a good landing.
  function landingTick() {
    var ac = ensureContext();
    if (!ac || !enabled) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 392;
      gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.4);
    } catch (e) { /* audio is best-effort */ }
  }

  return {
    startEngine: startEngine,
    setEngine: setEngine,
    stopEngine: stopEngine,
    ringChime: ringChime,
    crashThud: crashThud,
    landingTick: landingTick,
  };
})();
