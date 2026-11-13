/* UI: screens, input (wheel, pedals, keyboard), storage and the main loop. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- storage (localStorage may be unavailable) ---------- */
  const Store = {
    data: { coins: 0, car: 'pebble', sound: true, best: {} },
    load() {
      try {
        const raw = localStorage.getItem('roadwise.v1');
        if (raw) Object.assign(this.data, JSON.parse(raw));
      } catch (e) { /* ignore */ }
    },
    save() { try { localStorage.setItem('roadwise.v1', JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  };
  Store.load();

  const CARS = window.CARS;
  // Every car is available: there is deliberately no lock/price/owned state anywhere.
  const getCar = id => CARS.find(c => c.id === id) || CARS[0];

  const MODE_INFO = {
    highway: { name: 'Highway', desc: 'Weave through traffic for 2.5 km. You have 3 lives. Close calls earn bonus coins.' },
    fuel: { name: 'Fuel Saver', desc: 'Reach 2 km before the tank runs dry. Gentle throttle and coasting save fuel.' },
    brake: { name: 'Stop Line', desc: 'Three rounds: speed up, then stop as close to the line as you can without crossing it.' }
  };

  /* ---------- game ---------- */
  const canvas = $('view');
  let lastMode = 'highway';
  let toastTimer = 0;
  const game = new window.Game(canvas, {
    onHud: updateHud,
    onToast(text, ms) {
      const t = $('toast'); t.textContent = text; t.classList.add('on');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
    },
    onEnd: showResult
  });

  function show(id) {
    for (const s of ['menu', 'modes', 'garage', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id);
  }
  function setHud(on) { $('hud').classList.toggle('hidden', !on); }

  function updateHud(h) {
    $('hudSpeed').textContent = h.kmh;
    $('hudGear').textContent = h.gear;
    $('hudFuel').style.height = Math.round(h.fuel * 100) + '%';
    $('hudFuel').style.background = h.fuel < 0.2 ? '#ef5350' : '#3ecf8e';
    const l = $('hudLives');
    if (l.childElementCount !== 3) { l.innerHTML = '<i class="life"></i><i class="life"></i><i class="life"></i>'; }
    for (let i = 0; i < 3; i++) l.children[i].classList.toggle('off', i >= h.lives);
    $('hudMode').textContent = MODE_INFO[h.modeId].name.toUpperCase();
    if (h.modeId === 'brake') {
      $('hudProg').style.width = ((h.round - 1) / h.rounds * 100) + '%';
      $('hudSub').textContent = 'Round ' + Math.min(h.round, h.rounds) + '/' + h.rounds + ' • line in ' + Math.round(h.gap) + ' m';
    } else {
      $('hudProg').style.width = clamp(h.dist / h.goal, 0, 1) * 100 + '%';
      $('hudSub').textContent = Math.round(h.dist) + ' / ' + h.goal + ' m';
    }
  }

  function startMode(modeId) {
    lastMode = modeId;
    window.Sfx.init(); window.Sfx.startEngine();
    show(null); setHud(true);
    resetInputs();
    game.start(modeId, getCar(Store.data.car));
  }

  function showResult(r) {
    window.Sfx.stopEngine();
    setHud(false);
    Store.data.coins += r.coins;
    const prev = Store.data.best[r.mode] || 0;
    const isBest = r.success && r.score > prev;
    if (isBest) Store.data.best[r.mode] = r.score;
    Store.save();
    $('rTitle').textContent = r.title;
    const v = $('rVerdict');
    v.textContent = r.success ? 'Mission complete!' : (r.reason || 'Mission failed');
    v.className = 'verdict ' + (r.success ? 'win' : 'lose');
    $('rStats').innerHTML = r.stats.map(s => '<div>' + s[0] + '<b>' + s[1] + '</b></div>').join('');
    $('rCoins').textContent = r.coins;
    $('rBest').textContent = isBest ? '• new best!' : '';
    show('result');
    if (r.success) window.Sfx.good(); else window.Sfx.bad();
    refreshCoins();
  }

  function refreshCoins() { $('mCoins').textContent = Store.data.coins; }

  /* ---------- screens ---------- */
  function buildModes() {
    const box = $('modeCards'); box.innerHTML = '';
    for (const id of Object.keys(MODE_INFO)) {
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.mode = id;
      const best = Store.data.best[id];
      b.innerHTML = '<h3>' + MODE_INFO[id].name + '</h3><p>' + MODE_INFO[id].desc + '</p>' +
        '<div class="best">' + (best ? 'Best: ' + best : 'Not completed yet') + '</div>';
      b.onclick = () => { window.Sfx.init(); window.Sfx.click(); startMode(id); };
      box.appendChild(b);
    }
  }

  function bar(label, v) { return '<div class="stat"><span>' + label + '</span><i><em style="width:' + Math.round(clamp(v, 0, 1) * 100) + '%"></em></i></div>'; }
  function buildGarage() {
    const grid = $('garageGrid'); grid.innerHTML = '';
    for (const c of CARS) {
      const b = document.createElement('button');
      b.className = 'car' + (c.id === Store.data.car ? ' sel' : '');
      b.dataset.car = c.id;
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 160;
      b.appendChild(cv);
      b.insertAdjacentHTML('beforeend', '<b>' + c.name + '</b>' +
        bar('Speed', c.vmax / 240) + bar('Accel', c.accel / 10.2) + bar('Grip', c.grip / 1.25) + bar('Eco', 1.8 - c.fuelUse) +
        '<div class="state">' + (c.id === Store.data.car ? 'SELECTED' : 'UNLOCKED') + '</div>');
      const g = cv.getContext('2d');
      window.drawCar(g, 120, 140, 160, c, {});
      b.onclick = () => { Store.data.car = c.id; Store.save(); window.Sfx.init(); window.Sfx.click(); buildGarage(); };
      grid.appendChild(b);
    }
  }

  $('mPlay').onclick = () => { window.Sfx.init(); window.Sfx.click(); buildModes(); show('modes'); };
  $('mGarage').onclick = () => { window.Sfx.init(); window.Sfx.click(); buildGarage(); show('garage'); };
  $('mSound').onclick = () => {
    Store.data.sound = !Store.data.sound; Store.save();
    window.Sfx.init(); window.Sfx.setEnabled(Store.data.sound); window.Sfx.click(); syncSoundLabel();
  };
  function syncSoundLabel() { $('mSound').textContent = 'Sound: ' + (Store.data.sound ? 'On' : 'Off'); }
  $('modesBack').onclick = () => show('menu');
  $('modesGarage').onclick = () => { buildGarage(); show('garage'); };
  $('garageBack').onclick = () => { refreshCoins(); show('menu'); };
  $('rRetry').onclick = () => startMode(lastMode);
  $('rMenu').onclick = () => { show('menu'); refreshCoins(); };
  $('btnPause').onclick = () => doPause(true);
  $('pResume').onclick = () => doPause(false);
  $('pRestart').onclick = () => { game.state = 'done'; startMode(lastMode); };
  $('pQuit').onclick = () => { game.state = 'idle'; window.Sfx.stopEngine(); setHud(false); show('menu'); };
  function doPause(on) {
    if (on && game.state !== 'running') return;
    game.pause(on);
    $('pause').classList.toggle('hidden', !on);
    if (on) window.Sfx.stopEngine(); else window.Sfx.startEngine();
  }

  /* ---------- input ---------- */
  const keys = {};
  const touch = { steer: 0, gas: false, brake: false, wheelActive: false };
  function resetInputs() {
    for (const k in keys) keys[k] = false;
    touch.steer = 0; touch.gas = false; touch.brake = false; touch.wheelActive = false;
    $('pedGas').classList.remove('down'); $('pedBrake').classList.remove('down');
    wheelAngle = 0; $('wheel').style.transform = '';
  }
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (k === 'p' || k === 'escape') { doPause(game.state === 'running'); return; }
    if (k === 'h' && game.state === 'running') window.Sfx.horn();
    keys[k] = true;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { if (game.state === 'running') doPause(true); });

  // steering wheel (pointer drag around its centre)
  let wheelAngle = 0, wheelPointer = null, wheelStart = 0, wheelBase = 0;
  const wheelEl = $('wheel');
  const angleOf = e => { const r = wheelEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  wheelEl.addEventListener('pointerdown', e => {
    wheelPointer = e.pointerId; wheelEl.setPointerCapture(e.pointerId);
    wheelStart = angleOf(e); wheelBase = wheelAngle; touch.wheelActive = true;
  });
  wheelEl.addEventListener('pointermove', e => {
    if (e.pointerId !== wheelPointer) return;
    let d = angleOf(e) - wheelStart;
    if (d > 180) d -= 360; if (d < -180) d += 360;
    wheelAngle = clamp(wheelBase + d, -120, 120);
    wheelEl.style.transform = 'rotate(' + wheelAngle + 'deg)';
    touch.steer = wheelAngle / 90;
  });
  const wheelEnd = e => { if (e.pointerId === wheelPointer) { wheelPointer = null; touch.wheelActive = false; } };
  wheelEl.addEventListener('pointerup', wheelEnd);
  wheelEl.addEventListener('pointercancel', wheelEnd);

  function pedal(el, key) {
    const set = v => { touch[key] = v; el.classList.toggle('down', v); };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); set(true); e.preventDefault(); });
    el.addEventListener('pointerup', () => set(false));
    el.addEventListener('pointercancel', () => set(false));
    el.addEventListener('lostpointercapture', () => set(false));
  }
  pedal($('pedGas'), 'gas'); pedal($('pedBrake'), 'brake');
  $('btnHorn').addEventListener('pointerdown', () => window.Sfx.horn());

  let kSteer = 0;
  function pollInput(dt) {
    // keyboard steering eases in and out
    const want = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
    kSteer += (want - kSteer) * Math.min(1, dt * 8);
    // wheel springs back to centre when released
    if (!touch.wheelActive && wheelAngle !== 0) {
      wheelAngle *= Math.max(0, 1 - dt * 7); if (Math.abs(wheelAngle) < 0.5) wheelAngle = 0;
      wheelEl.style.transform = 'rotate(' + wheelAngle + 'deg)'; touch.steer = wheelAngle / 90;
    }
    const steer = clamp(Math.abs(kSteer) > 0.02 ? kSteer : touch.steer, -1, 1);
    game.input.steer = steer;
    game.input.throttle = (keys['arrowup'] || keys['w'] || touch.gas) ? 1 : 0;
    game.input.brake = (keys['arrowdown'] || keys['s'] || keys[' '] || touch.brake) ? 1 : 0;
  }

  /* ---------- main loop ---------- */
  let last = 0;
  function frame(ts) {
    const dt = last ? (ts - last) / 1000 : 0.016; last = ts;
    if (game.state === 'running') { pollInput(dt); game.update(dt); if (game.state === 'running') window.Sfx.engine(game.hud().rpm, game.input.throttle); }
    game.render();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', () => game.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));

  /* ---------- boot ---------- */
  window.Sfx.enabled = Store.data.sound;
  syncSoundLabel(); refreshCoins(); show('menu');
  // attract screen behind the menu: show a car on the road
  game.car = getCar(Store.data.car); game.modeId = 'highway'; game.mode = window.GAME_MODES.highway;
  game.vmax = game.car.vmax / 3.6; game.v = 0; game.pz = 0; game.px = 0; game.time = 0; game.traffic = []; game.input = { steer: 0, throttle: 0, brake: 0 };
  game.dist = 0; game.cool = 0; game.shake = 0;
  requestAnimationFrame(frame);

  // exposed for the automated tests
  window.__app = { game, Store, CARS, startMode, pollInput };
})();
