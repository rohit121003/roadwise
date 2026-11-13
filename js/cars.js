/* Car data + original vector car drawing. Every car is unlocked from the start. */
(function () {
  'use strict';

  // body: proportions used by the vector renderer
  // vmax km/h, accel m/s^2, grip (steering response), fuelUse (relative consumption)
  const CARS = [
    { id: 'pebble',  name: 'Pebble',   vmax: 150, accel: 6.0, grip: 1.05, fuelUse: 0.8, color: '#e8604c', body: 'hatch' },
    { id: 'dot',     name: 'Dot',      vmax: 140, accel: 5.6, grip: 1.15, fuelUse: 0.7, color: '#4aa3df', body: 'hatch' },
    { id: 'meridian',name: 'Meridian', vmax: 175, accel: 6.8, grip: 1.0,  fuelUse: 0.95, color: '#8b94a1', body: 'sedan' },
    { id: 'cab9',    name: 'Cab-9',    vmax: 165, accel: 6.4, grip: 1.0,  fuelUse: 1.0, color: '#f2c230', body: 'sedan' },
    { id: 'voltix',  name: 'Voltix',   vmax: 180, accel: 8.4, grip: 1.05, fuelUse: 0.55, color: '#3ecf8e', body: 'sedan' },
    { id: 'zephyr',  name: 'Zephyr',   vmax: 195, accel: 7.8, grip: 1.1,  fuelUse: 1.05, color: '#7a5be0', body: 'coupe' },
    { id: 'ridgeback',name:'Ridgeback',vmax: 170, accel: 6.6, grip: 0.9,  fuelUse: 1.25, color: '#5d7a4a', body: 'suv' },
    { id: 'titan',   name: 'Titan',    vmax: 185, accel: 7.2, grip: 0.85, fuelUse: 1.5, color: '#2f3a4a', body: 'suv' },
    { id: 'hauler',  name: 'Hauler',   vmax: 140, accel: 4.6, grip: 0.8,  fuelUse: 1.4, color: '#e9e9ee', body: 'van' },
    { id: 'bison',   name: 'Bison',    vmax: 150, accel: 5.0, grip: 0.75, fuelUse: 1.6, color: '#c46a2b', body: 'truck' },
    { id: 'falcon',  name: 'Falcon S', vmax: 215, accel: 9.0, grip: 1.2,  fuelUse: 1.35, color: '#d92b3a', body: 'sport' },
    { id: 'apex',    name: 'Apex',     vmax: 240, accel: 10.2, grip: 1.25, fuelUse: 1.7, color: '#f58a1f', body: 'sport' }
  ];

  // proportions: hr = height/width, low = fraction of height that is lower body, cw = cabin width/width
  const BODY = {
    hatch: { hr: 0.78, low: 0.52, cw: 0.84, taper: 0.88, spoiler: false },
    sedan: { hr: 0.72, low: 0.55, cw: 0.80, taper: 0.84, spoiler: false },
    coupe: { hr: 0.66, low: 0.60, cw: 0.78, taper: 0.80, spoiler: false },
    suv:   { hr: 0.92, low: 0.50, cw: 0.90, taper: 0.93, spoiler: false },
    van:   { hr: 1.10, low: 0.40, cw: 0.97, taper: 0.98, spoiler: false },
    truck: { hr: 1.05, low: 0.42, cw: 0.98, taper: 1.0,  spoiler: false, box: true },
    sport: { hr: 0.58, low: 0.64, cw: 0.74, taper: 0.76, spoiler: true }
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Draw a car seen from behind.
   * cx = horizontal centre, by = ground (bottom) y, w = width in px.
   * opt: { brake:boolean, color:string (override), shadow:boolean }
   */
  function drawCar(ctx, cx, by, w, car, opt) {
    opt = opt || {};
    const P = BODY[car.body] || BODY.sedan;
    const color = opt.color || car.color;
    const h = w * P.hr;
    const wheelH = h * 0.26, wheelW = w * 0.16;
    const lowerH = h * P.low;
    const lowerY = by - wheelH * 0.35 - lowerH;
    const cabinH = h - lowerH - wheelH * 0.35;
    const cabinW = w * P.cw;
    const topW = cabinW * P.taper;

    if (opt.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx, by, w * 0.56, h * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // wheels
    ctx.fillStyle = '#16181c';
    rr(ctx, cx - w * 0.47, by - wheelH, wheelW, wheelH, wheelW * 0.25); ctx.fill();
    rr(ctx, cx + w * 0.47 - wheelW, by - wheelH, wheelW, wheelH, wheelW * 0.25); ctx.fill();

    // cabin
    const cabTop = lowerY - cabinH;
    ctx.fillStyle = shade(color, -28);
    ctx.beginPath();
    if (P.box) {
      rr(ctx, cx - cabinW / 2, cabTop, cabinW, cabinH + 2, w * 0.03);
    } else {
      ctx.moveTo(cx - cabinW / 2, lowerY + 2);
      ctx.lineTo(cx - topW / 2, cabTop);
      ctx.lineTo(cx + topW / 2, cabTop);
      ctx.lineTo(cx + cabinW / 2, lowerY + 2);
      ctx.closePath();
    }
    ctx.fill();
    // rear window
    ctx.fillStyle = '#1b2733';
    const gm = cabinW * 0.09;
    if (P.box) {
      rr(ctx, cx - cabinW / 2 + gm, cabTop + cabinH * 0.12, cabinW - gm * 2, cabinH * 0.5, w * 0.02); ctx.fill();
      // box ribs
      ctx.fillStyle = shade(color, -45);
      ctx.fillRect(cx - 1, cabTop + cabinH * 0.68, 2, cabinH * 0.3);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - cabinW / 2 + gm, lowerY - cabinH * 0.1);
      ctx.lineTo(cx - topW / 2 + gm * 0.7, cabTop + cabinH * 0.14);
      ctx.lineTo(cx + topW / 2 - gm * 0.7, cabTop + cabinH * 0.14);
      ctx.lineTo(cx + cabinW / 2 - gm, lowerY - cabinH * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(cx - topW / 2 + gm * 0.7, cabTop + cabinH * 0.14);
      ctx.lineTo(cx - topW * 0.1, cabTop + cabinH * 0.14);
      ctx.lineTo(cx - cabinW * 0.25, lowerY - cabinH * 0.1);
      ctx.lineTo(cx - cabinW / 2 + gm, lowerY - cabinH * 0.1);
      ctx.closePath();
      ctx.fill();
    }

    // spoiler
    if (P.spoiler) {
      ctx.fillStyle = shade(color, -50);
      ctx.fillRect(cx - w * 0.42, cabTop + cabinH * 0.28, w * 0.84, h * 0.045);
      ctx.fillRect(cx - w * 0.38, cabTop + cabinH * 0.28, w * 0.035, h * 0.16);
      ctx.fillRect(cx + w * 0.345, cabTop + cabinH * 0.28, w * 0.035, h * 0.16);
    }

    // lower body
    const g = ctx.createLinearGradient(0, lowerY, 0, lowerY + lowerH);
    g.addColorStop(0, shade(color, 22));
    g.addColorStop(1, shade(color, -22));
    ctx.fillStyle = g;
    rr(ctx, cx - w / 2, lowerY, w, lowerH, w * 0.07); ctx.fill();

    // tail lights
    const on = !!opt.brake;
    ctx.fillStyle = on ? '#ff3b30' : '#a3211c';
    const tlW = w * 0.2, tlH = lowerH * 0.2, tlY = lowerY + lowerH * 0.14;
    rr(ctx, cx - w / 2 + w * 0.04, tlY, tlW, tlH, 2); ctx.fill();
    rr(ctx, cx + w / 2 - w * 0.04 - tlW, tlY, tlW, tlH, 2); ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,59,48,0.35)';
      ctx.beginPath(); ctx.arc(cx - w / 2 + w * 0.14, tlY + tlH / 2, w * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + w / 2 - w * 0.14, tlY + tlH / 2, w * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    // plate + bumper
    ctx.fillStyle = '#e9e6d8';
    rr(ctx, cx - w * 0.1, lowerY + lowerH * 0.42, w * 0.2, lowerH * 0.2, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    rr(ctx, cx - w * 0.49, lowerY + lowerH * 0.74, w * 0.98, lowerH * 0.26, w * 0.03); ctx.fill();
    // exhaust
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(cx + w * 0.27, lowerY + lowerH * 0.86, w * 0.08, lowerH * 0.1);
  }

  window.CARS = CARS;
  window.drawCar = drawCar;
})();
