/* Game core: physics, modes, traffic and the pseudo-3D scanline renderer. */
(function () {
  'use strict';

  const ROAD_HALF = 6.2;               // metres from road centre to edge
  const LANES = [-4.5, -1.5, 1.5, 4.5];
  const CAM_H = 3.2;                   // camera height (m)
  const CAM_BACK = 9;                  // camera is this far behind the car (m)
  const CURVE_K = 0.0011;              // curvature strength
  const MODES = {
    highway: { goal: 2500, traffic: 14, fuelMul: 0.6, title: 'Highway' },
    fuel:    { goal: 2000, traffic: 6,  fuelMul: 6.5, title: 'Fuel Saver' },
    brake:   { goal: 0,    traffic: 0,  fuelMul: 0.3, title: 'Stop Line', rounds: 3 }
  };
  const TRAFFIC_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#7f8c8d', '#f1c40f', '#ecf0f1', '#34495e'];
  const TRAFFIC_BODIES = ['hatch', 'sedan', 'suv', 'van', 'truck', 'coupe'];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  function curveAt(z) { return 0.55 * Math.sin(z / 520) + 0.35 * Math.sin(z / 210 + 1.7); }
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  class Game {
    constructor(canvas, hooks) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks || {};
      this.state = 'idle';            // idle | running | paused | done
      this.input = { steer: 0, throttle: 0, brake: 0 };
      this.hillShift = 0;
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = this.cv.clientWidth || window.innerWidth;
      const h = this.cv.clientHeight || window.innerHeight;
      this.cv.width = Math.max(2, Math.floor(w * dpr));
      this.cv.height = Math.max(2, Math.floor(h * dpr));
      this.W = this.cv.width; this.H = this.cv.height;
    }

    /* ---------- session control ---------- */
    start(modeId, car) {
      const m = MODES[modeId];
      this.modeId = modeId; this.mode = m; this.car = car;
      this.vmax = car.vmax / 3.6;
      this.v = 0; this.pz = 0; this.px = LANES[1];
      this.fuel = 1; this.lives = 3; this.dist = 0; this.time = 0;
      this.crashes = 0; this.nearMiss = 0; this.cool = 0; this.shake = 0;
      this.traffic = []; this.score = 0; this.toastText = '';
      this.round = 0; this.roundScores = []; this.armed = false; this.lineZ = 0;
      this.result = null;
      for (let i = 0; i < m.traffic; i++) this.spawnTraffic(true, i);
      if (modeId === 'brake') this.nextRound(true);
      this.state = 'running';
      this.toast(modeId === 'brake' ? 'Reach speed, then stop just before the line' :
        modeId === 'fuel' ? 'Drive smoothly: reach the finish with fuel left' : 'Reach the finish. 3 lives!');
    }

    pause(on) {
      if (this.state === 'running' && on) this.state = 'paused';
      else if (this.state === 'paused' && !on) this.state = 'running';
    }

    toast(text, ms) {
      this.toastText = text; this.toastUntil = performance.now() + (ms || 2200);
      if (this.hooks.onToast) this.hooks.onToast(text, ms || 2200);
    }

    /* ---------- traffic ---------- */
    spawnTraffic(initial, idx) {
      const t = { lane: 0, x: 0, z: 0, v: 0, color: '', car: null, prevRel: 1 };
      this.placeTraffic(t, initial, idx);
      this.traffic.push(t);
    }
    placeTraffic(t, initial, idx) {
      for (let tries = 0; tries < 12; tries++) {
        const lane = Math.floor(Math.random() * 4);
        const z = this.pz + (initial ? 70 + (idx || 0) * 38 + rand(0, 18) : 320 + rand(0, 260));
        const clash = this.traffic.some(o => o !== t && o.lane === lane && Math.abs(o.z - z) < 30);
        if (!clash || tries === 11) { t.lane = lane; t.x = LANES[lane]; t.z = z; break; }
      }
      t.v = rand(9, 21);
      t.color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
      t.car = { body: TRAFFIC_BODIES[Math.floor(Math.random() * TRAFFIC_BODIES.length)], color: t.color };
      t.prevRel = t.z - this.pz;
    }

    /* ---------- stop-line mode ---------- */
    nextRound(first) {
      if (!first) this.round++;
      this.armed = false;
      this.lineZ = this.pz + 360 + this.round * 60;
    }

    /* ---------- update ---------- */
    update(dt) {
      if (this.state !== 'running') return;
      dt = clamp(dt, 0, 0.05);
      const inp = this.input, car = this.car, m = this.mode;
      this.time += dt;
      this.cool = Math.max(0, this.cool - dt);
      this.shake = Math.max(0, this.shake - dt * 2.2);

      // longitudinal dynamics
      const thr = this.fuel > 0 ? clamp(inp.throttle, 0, 1) : 0;
      const ratio = this.v / this.vmax;
      let a = car.accel * thr * (1 - ratio * ratio * 0.92);
      if (this.v > 0) a -= 0.9 + 0.0011 * this.v * this.v;
      a -= clamp(inp.brake, 0, 1) * 27;
      this.v = clamp(this.v + a * dt, 0, this.vmax);

      // fuel
      const use = (0.0004 + thr * (0.0009 + this.v * 0.00006)) * car.fuelUse * m.fuelMul;
      this.fuel = Math.max(0, this.fuel - use * dt);

      // lateral dynamics
      const lat = (4 + this.v * 0.35) * car.grip * Math.min(1, this.v / 4);
      this.px += clamp(inp.steer, -1, 1) * lat * dt;
      this.px -= curveAt(this.pz) * this.v * this.v * 0.0026 * dt / car.grip;
      const off = Math.abs(this.px) - ROAD_HALF;
      if (off > 0.2) { this.v *= 1 - 1.6 * dt; this.shake = Math.max(this.shake, 0.25); }
      if (Math.abs(this.px) > ROAD_HALF + 1.8) this.crash('Guardrail!', null);

      this.pz += this.v * dt;
      this.dist += this.v * dt;
      this.hillShift += curveAt(this.pz) * this.v * dt * 0.012;

      // traffic
      for (const o of this.traffic) {
        o.z += o.v * dt;
        const rel = o.z - this.pz;
        if (Math.abs(rel) < 4.4 && Math.abs(o.x - this.px) < 1.95) this.crash('Crash!', o);
        else if (o.prevRel > 0 && rel <= 0 && Math.abs(o.x - this.px) < 3.4 && Math.abs(o.x - this.px) >= 1.95) {
          this.nearMiss++; this.toast('Close call +2', 900);
        }
        o.prevRel = rel;
        if (rel < -45) this.placeTraffic(o, false);
      }

      // modes
      if (this.modeId === 'brake') this.updateBrake();
      else if (this.dist >= m.goal) this.finish(true);
      if (this.state === 'running' && this.lives <= 0) this.finish(false, 'Out of lives');
      if (this.state === 'running' && this.fuel <= 0 && this.v < 0.4 && this.modeId !== 'brake') this.finish(false, 'Out of fuel');

      if (this.hooks.onHud) this.hooks.onHud(this.hud());
    }

    updateBrake() {
      const front = this.pz + 2.3;
      const gap = this.lineZ - front;
      if (this.v * 3.6 > 45) this.armed = true;
      if (front > this.lineZ + 0.2) {
        this.roundScores.push(0); Sfx.bad();
        this.toast('Overshot the line!', 1800);
        this.advanceRound();
      } else if (this.armed && this.v < 0.3) {
        let s = 0, label = '';
        if (gap <= 1.5) { s = 100; label = 'Perfect stop!'; }
        else if (gap <= 4) { s = 70; label = 'Great stop'; }
        else if (gap <= 12) { s = 40; label = 'OK stop'; }
        if (s > 0) {
          this.roundScores.push(s); Sfx.good();
          this.toast(label + ' +' + s, 1800);
          this.advanceRound();
        } else if (!this.stoppedWarn) {
          this.stoppedWarn = true; this.toast('Too early. Keep going to the line.', 1800);
        }
      } else if (this.v > 1) this.stoppedWarn = false;
    }
    advanceRound() {
      if (this.roundScores.length >= this.mode.rounds) {
        const total = this.roundScores.reduce((a, b) => a + b, 0);
        this.finish(total >= 100);
      } else this.nextRound(false);
    }

    crash(text, o) {
      if (this.cool > 0) return;
      this.lives--; this.crashes++;
      this.cool = 1.3; this.shake = 1;
      this.v = Math.min(this.v, o ? o.v * 0.5 : 3);
      if (o) o.z += 55; else this.px = clamp(this.px, -ROAD_HALF + 1.5, ROAD_HALF - 1.5);
      this.px = o ? this.px : this.px;
      Sfx.crash();
      this.toast(text + (this.lives > 0 ? ' Lives: ' + this.lives : ''), 1500);
    }

    finish(success, reason) {
      if (this.state === 'done') return;
      this.state = 'done';
      let coins = 0, stats = [];
      const km = (this.dist / 1000).toFixed(2);
      if (this.modeId === 'highway') {
        coins = Math.floor(this.dist / 40) + this.nearMiss * 2 + (success ? 50 : 0);
        stats = [['Distance', km + ' km'], ['Close calls', this.nearMiss], ['Crashes', this.crashes], ['Time', this.time.toFixed(1) + ' s']];
      } else if (this.modeId === 'fuel') {
        const eco = Math.round(this.fuel * 100);
        coins = Math.floor(this.dist / 60) + (success ? 30 + eco : 0);
        stats = [['Distance', km + ' km'], ['Fuel left', eco + '%'], ['Crashes', this.crashes], ['Time', this.time.toFixed(1) + ' s']];
      } else {
        const total = this.roundScores.reduce((a, b) => a + b, 0);
        coins = Math.round(total / 2);
        stats = [['Rounds', this.roundScores.join(' / ')], ['Total', total + ' / 300'], ['Time', this.time.toFixed(1) + ' s']];
      }
      this.result = {
        success, reason: reason || '', mode: this.modeId, title: this.mode.title, coins, stats,
        dist: this.dist, score: this.modeId === 'brake' ? this.roundScores.reduce((a, b) => a + b, 0)
          : this.modeId === 'fuel' ? Math.round(this.fuel * 100) : Math.round(this.dist)
      };
      Sfx.stopEngine();
      if (this.hooks.onEnd) this.hooks.onEnd(this.result);
    }

    hud() {
      const kmh = Math.round(this.v * 3.6);
      const gear = this.v < 0.3 ? 'N' : String(Math.min(6, 1 + Math.floor(this.v / this.vmax * 6)));
      return {
        kmh, gear, fuel: this.fuel, lives: this.lives, dist: this.dist,
        goal: this.mode.goal, modeId: this.modeId, round: this.round + 1, rounds: this.mode.rounds || 0,
        gap: this.modeId === 'brake' ? Math.max(0, this.lineZ - (this.pz + 2.3)) : 0,
        rpm: (this.v / this.vmax * 6 % 1) * 0.6 + this.v / this.vmax * 0.4
      };
    }

    /* ---------- render ---------- */
    render() {
      const ctx = this.ctx, W = this.W, H = this.H;
      if (!this.car) { ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, W, H); return; }
      const hor = Math.floor(H * 0.42);
      const F = H;                       // focal length in px
      const K = F * CAM_H;               // dy = K / depth
      const pal = this.modeId === 'fuel' ? { sky0: '#2b3a67', sky1: '#f2a65a', sun: '#ffd9a0', hill: ['#3b3a63', '#4b4a7a'] }
        : this.modeId === 'brake' ? { sky0: '#4a6fa5', sky1: '#d7e3f2', sun: '#fff6cf', hill: ['#6b8fb0', '#7fa3a0'] }
          : { sky0: '#3b82c4', sky1: '#cfe8f7', sun: '#fff6cf', hill: ['#5d8aa8', '#6fa07a'] };

      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 10);

      // sky
      const sg = ctx.createLinearGradient(0, 0, 0, hor);
      sg.addColorStop(0, pal.sky0); sg.addColorStop(1, pal.sky1);
      ctx.fillStyle = sg; ctx.fillRect(-20, -20, W + 40, hor + 20);
      ctx.fillStyle = pal.sun; ctx.beginPath(); ctx.arc(W * 0.78, hor * 0.5, H * 0.05, 0, 7); ctx.fill();
      // hills (parallax with curves)
      for (let L = 0; L < 2; L++) {
        ctx.fillStyle = pal.hill[L]; ctx.beginPath(); ctx.moveTo(-20, hor + 1);
        for (let x = -20; x <= W + 20; x += 16) {
          const u = (x / W) * 6 + this.hillShift * (L + 1) * 0.6;
          const y = hor - H * (0.035 + 0.02 * L) * (1 + Math.sin(u * (1.3 + L * 0.9)) * 0.7 + Math.sin(u * 3.1) * 0.25);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 20, hor + 1); ctx.closePath(); ctx.fill();
      }

      // road scanlines
      const offX = new Float32Array(H + 2), ppmArr = new Float32Array(H + 2);
      let ang = 0, offM = 0, prevZ = K / (H - hor);
      const base = this.pz;
      for (let y = H - 1; y > hor; y--) {
        const dy = y - hor;
        const depth = K / dy;                       // metres ahead of camera
        const dz = Math.abs(depth - prevZ); prevZ = depth;
        ang += curveAt(base + depth - CAM_BACK) * CURVE_K * dz;
        offM += ang * dz;
        const ppm = dy / CAM_H;
        ppmArr[y] = ppm; offX[y] = offM * ppm;
        const wz = base + depth - CAM_BACK;
        const band = Math.floor(wz / 9) & 1;
        const cx = W / 2 + offX[y];
        const hw = ROAD_HALF * ppm;
        ctx.fillStyle = band ? '#3d8a4a' : '#378045';
        ctx.fillRect(0, y, W, 1);
        ctx.fillStyle = (Math.floor(wz / 4) & 1) ? '#d9d9d9' : '#c0392b';
        ctx.fillRect(cx - hw - ppm * 0.9, y, hw * 2 + ppm * 1.8, 1);
        ctx.fillStyle = band ? '#40444c' : '#3b3f47';
        ctx.fillRect(cx - hw, y, hw * 2, 1);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(cx - hw + ppm * 0.25, y, Math.max(1, ppm * 0.22), 1);
        ctx.fillRect(cx + hw - ppm * 0.47, y, Math.max(1, ppm * 0.22), 1);
        if ((Math.floor(wz / 7) & 1) === 0) {
          for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 3 * ppm - ppm * 0.08, y, Math.max(1, ppm * 0.16), 1);
        }
      }

      const yAt = d => Math.min(H - 1, Math.max(hor + 1, Math.round(hor + K / d)));
      const draw = [];

      // roadside scenery
      const step = 38, first = Math.ceil((base - CAM_BACK) / step) * step;
      for (let zz = first; zz < base + 420; zz += step) {
        const d = zz - base + CAM_BACK;
        if (d < 16) continue;
        const seed = Math.floor(zz / step);
        draw.push({ d, fn: () => {
          const y = yAt(d), ppm = ppmArr[y], cx = W / 2 + offX[y] - this.px * ppm;
          for (const side of [-1, 1]) {
            const r = hash(seed * 3 + side);
            const xm = side * (ROAD_HALF + 5 + r * 6);
            const sx = cx + xm * ppm;
            if (r > 0.82) this.drawPole(ctx, sx, y, ppm);
            else this.drawTree(ctx, sx, y, ppm, r);
          }
        } });
      }

      // finish gate (highway / fuel)
      if (this.mode.goal > 0) {
        const d = this.mode.goal - this.dist + CAM_BACK;
        if (d > 2.5 && d < 600) draw.push({ d, fn: () => this.drawGate(ctx, d, ppmArr, offX, yAt) });
      }
      // stop line
      if (this.modeId === 'brake') {
        const d1 = this.lineZ - this.pz + CAM_BACK, d0 = d1 - 12;
        if (d1 > 2.5 && d1 < 700) draw.push({ d: d1 + 0.5, fn: () => this.drawStopZone(ctx, d0, d1, ppmArr, offX, yAt) });
      }

      // traffic
      for (const o of this.traffic) {
        const d = o.z - this.pz + CAM_BACK;
        if (d < 2.5 || d > 520) continue;
        draw.push({ d, fn: () => {
          const y = yAt(d), ppm = ppmArr[y];
          const sx = W / 2 + offX[y] + (o.x - this.px) * ppm;
          const w = 1.85 * ppm;
          if (w < 2) return;
          window.drawCar(ctx, sx, y, w, o.car, { brake: false, shadow: w > 10 });
        } });
      }
      draw.sort((a, b) => b.d - a.d);
      for (const it of draw) it.fn();

      // player car
      const pw = 1.9 * (yAt(CAM_BACK) - hor) / CAM_H;
      const py = yAt(CAM_BACK) + pw * 0.05;
      ctx.save();
      ctx.translate(W / 2, py);
      ctx.rotate(this.input.steer * 0.045);
      const bounce = Math.sin(this.time * 38) * (this.v / this.vmax) * 1.2;
      if (this.cool > 0.9) ctx.globalAlpha = 0.7;
      window.drawCar(ctx, 0, bounce, pw, this.car, { brake: this.input.brake > 0.1 });
      ctx.restore();

      // speed vignette
      const sp = this.v / this.vmax;
      if (sp > 0.55) {
        const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + ((sp - 0.55) * 0.5).toFixed(3) + ')');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    drawTree(ctx, sx, y, ppm, r) {
      const h = ppm * (5 + r * 3), w = ppm * (2.2 + r);
      if (h < 3) return;
      ctx.fillStyle = '#5b3f2a'; ctx.fillRect(sx - ppm * 0.18, y - h * 0.4, ppm * 0.36, h * 0.4);
      ctx.fillStyle = r > 0.4 ? '#2a6b34' : '#347d3c';
      ctx.beginPath(); ctx.moveTo(sx - w, y - h * 0.3); ctx.lineTo(sx, y - h); ctx.lineTo(sx + w, y - h * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#245c2d';
      ctx.beginPath(); ctx.moveTo(sx - w * 0.8, y - h * 0.5); ctx.lineTo(sx, y - h * 1.1); ctx.lineTo(sx + w * 0.8, y - h * 0.5); ctx.closePath(); ctx.fill();
    }
    drawPole(ctx, sx, y, ppm) {
      const h = ppm * 7;
      if (h < 3) return;
      ctx.fillStyle = '#8a8f98'; ctx.fillRect(sx - ppm * 0.08, y - h, ppm * 0.16, h);
      ctx.fillStyle = '#ffe9a8'; ctx.fillRect(sx - ppm * 0.5, y - h, ppm * 1, ppm * 0.18);
    }
    drawGate(ctx, d, ppmArr, offX, yAt) {
      const y = yAt(d), ppm = ppmArr[y], cx = this.W / 2 + offX[y] - this.px * ppm;
      const hw = (ROAD_HALF + 1) * ppm, h = ppm * 6.5;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(cx - hw, y - h, ppm * 0.6, h); ctx.fillRect(cx + hw - ppm * 0.6, y - h, ppm * 0.6, h);
      const bh = ppm * 1.6;
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? '#111' : '#fff';
        ctx.fillRect(cx - hw + (hw * 2 / 16) * i, y - h, hw * 2 / 16 + 1, bh);
      }
      if (ppm > 6) {
        ctx.fillStyle = '#ffcc33'; ctx.font = 'bold ' + Math.round(ppm * 1.2) + 'px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('FINISH', cx, y - h - ppm * 0.4);
      }
    }
    drawStopZone(ctx, d0, d1, ppmArr, offX, yAt) {
      const ya = yAt(d1), yb = yAt(d0);
      const ppmA = ppmArr[ya], ppmB = ppmArr[yb];
      const ca = this.W / 2 + offX[ya] - this.px * ppmA, cb = this.W / 2 + offX[yb] - this.px * ppmB;
      const hwA = ROAD_HALF * ppmA, hwB = ROAD_HALF * ppmB;
      ctx.fillStyle = 'rgba(80,220,140,0.30)';
      ctx.beginPath(); ctx.moveTo(cb - hwB, yb); ctx.lineTo(cb + hwB, yb); ctx.lineTo(ca + hwA, ya); ctx.lineTo(ca - hwA, ya); ctx.closePath(); ctx.fill();
      const t = Math.max(2, ppmA * 0.9);
      ctx.fillStyle = '#fff'; ctx.fillRect(ca - hwA, ya - t, hwA * 2, t);
      ctx.fillStyle = '#e03a3a';
      for (let i = 0; i < 10; i += 2) ctx.fillRect(ca - hwA + (hwA * 2 / 10) * i, ya - t, hwA * 2 / 10, t);
      if (ppmA > 5) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(ppmA * 1.5) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('STOP', ca, ya - t - ppmA * 3.2);
        ctx.fillStyle = '#d9d9d9'; ctx.fillRect(ca - ppmA * 0.1, ya - t - ppmA * 3, ppmA * 0.2, ppmA * 3);
      }
    }

    /* ---------- main loop ---------- */
    loop(ts) {
      const dt = this.last ? (ts - this.last) / 1000 : 0.016;
      this.last = ts;
      this.update(dt);
      this.render();
      if (Sfx && this.state === 'running') Sfx.engine(this.hud().rpm, this.input.throttle);
    }
  }

  window.Game = Game;
  window.GAME_MODES = MODES;
})();
