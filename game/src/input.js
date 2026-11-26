// Canyon Courier — keyboard and mouse input state.
// One clear job: turn raw browser events into one small state object the
// game loop reads. Nothing here knows about physics or rendering.

var CC_INPUT = (function () {
  var keys = {};          // key code -> true while held
  var mouse = { x: 0.5, y: 0.5, active: false, down: false };
  var anyInputSeen = false;
  var pressed = {};       // edge-triggered keys, consumed by the game loop

  function markInput() { anyInputSeen = true; }

  function onKeyDown(e) {
    if (e.repeat) return;
    keys[e.code] = true;
    pressed[e.code] = true;
    markInput();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) { keys[e.code] = false; }

  function onMouseMove(e) {
    var rect = e.target.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width;
    mouse.y = (e.clientY - rect.top) / rect.height;
    mouse.active = true;
    markInput();
  }

  function onMouseDown() { mouse.down = true; markInput(); }
  function onMouseUp() { mouse.down = false; }

  // W/S work the throttle, arrows work pitch and roll, A/D also roll.
  function throttleUp() { return keys['KeyW']; }
  function throttleDown() { return keys['KeyS']; }
  function turnLeft() { return keys['KeyA'] || keys['ArrowLeft']; }
  function turnRight() { return keys['KeyD'] || keys['ArrowRight']; }
  function climbKey() { return keys['ArrowUp']; }
  function diveKey() { return keys['ArrowDown']; }

  // Mouse steering: horizontal position steers, vertical position pitches.
  // Returns -1..1 for each axis, 0 when the mouse has never moved.
  function mouseSteer() {
    if (!mouse.active) return { roll: 0, pitch: 0 };
    return { roll: (mouse.x - 0.5) * 2, pitch: (mouse.y - 0.5) * 2 };
  }

  function wasPressed(code) {
    if (pressed[code]) { pressed[code] = false; return true; }
    return false;
  }

  function consumeAnyInput() {
    var seen = anyInputSeen;
    anyInputSeen = false;
    return seen;
  }

  function attach(canvas) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
  }

  return {
    attach: attach,
    throttleUp: throttleUp,
    throttleDown: throttleDown,
    turnLeft: turnLeft,
    turnRight: turnRight,
    climbKey: climbKey,
    diveKey: diveKey,
    mouseSteer: mouseSteer,
    mouseDown: function () { return mouse.down; },
    wasPressed: wasPressed,
    consumeAnyInput: consumeAnyInput,
    keys: keys,
  };
})();
