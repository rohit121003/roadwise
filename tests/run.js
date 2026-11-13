/* End-to-end tests. Usage: node tests/run.js   (needs `playwright` installed + Chromium) */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  const errs = [], reqs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', q => reqs.push(q.url()));
  await page.goto(base + '/index.html'); await page.waitForTimeout(400);

  console.log('Screens');
  ok(await page.isVisible('#menu'), 'menu visible on load');
  await page.click('#mPlay'); ok(await page.isVisible('#modes'), 'mode select opens');
  ok((await page.$$('#modeCards .card')).length === 3, '3 mission cards');
  await page.click('#modesBack'); ok(await page.isVisible('#menu'), 'back to menu');

  console.log('Garage: all cars unlocked');
  await page.click('#mGarage');
  const cars = await page.$$('#garageGrid .car');
  ok(cars.length === 12, '12 cars listed');
  const texts = await page.$$eval('#garageGrid .car', els => els.map(e => e.textContent));
  ok(texts.every(t => !/lock|price|buy|gold|coin|\$/i.test(t.replace(/unlocked/ig, ''))), 'no car shows a lock/price/buy text');
  ok(await page.$$eval('#garageGrid .car', els => els.every(e => !e.disabled)), 'no car button is disabled');
  for (let i = 0; i < 12; i++) {
    await page.click('#garageGrid .car:nth-child(' + (i + 1) + ')');
    const sel = await page.evaluate(() => window.__app.Store.data.car);
    const expect = await page.evaluate(i => window.__app.CARS[i].id, i);
    if (sel !== expect) { ok(false, 'select car ' + i); break; }
    if (i === 11) ok(true, 'every one of the 12 cars can be selected');
  }
  await page.click('#garageBack');

  console.log('Every car drives');
  for (let i = 0; i < 12; i++) {
    const r = await page.evaluate(i => {
      const A = window.__app; A.Store.data.car = A.CARS[i].id; A.startMode('highway');
      const g = A.game; g.traffic = []; g.input = { steer: 0, throttle: 1, brake: 0 };
      for (let k = 0; k < 600; k++) g.update(0.016);
      return { kmh: Math.round(g.v * 3.6), max: A.CARS[i].vmax, ok: g.v > 5 };
    }, i);
    if (!r.ok || r.kmh > r.max + 1) { ok(false, 'car ' + i + ' drives: ' + JSON.stringify(r)); break; }
    if (i === 11) ok(true, 'all 12 cars accelerate and respect their top speed');
  }

  console.log('Highway mode');
  let r = await page.evaluate(() => {
    const A = window.__app; A.Store.data.car = 'meridian'; A.startMode('highway'); const g = A.game;
    g.traffic = []; g.input = { steer: 0, throttle: 1, brake: 0 };
    let steps = 0;
    while (g.state === 'running' && steps++ < 20000) {
      g.input.steer = Math.max(-1, Math.min(1, -g.px * 0.25));   // simple autopilot keeps lane centre
      g.update(0.016);
    }
    return { state: g.state, res: g.result };
  });
  ok(r.state === 'done' && r.res && r.res.success, 'highway can be completed (' + (r.res && r.res.reason) + ')');
  ok(r.res && r.res.coins > 0, 'coins are awarded: ' + (r.res && r.res.coins));
  ok(await page.isVisible('#result'), 'result screen shown');

  console.log('Crash and lives');
  r = await page.evaluate(() => {
    const A = window.__app; A.startMode('highway'); const g = A.game;
    g.traffic = [{ lane: 1, x: g.px, z: g.pz + 8, v: 0, car: { body: 'sedan', color: '#fff' }, color: '#fff', prevRel: 8 }];
    g.v = 30; g.input = { steer: 0, throttle: 0, brake: 0 };
    for (let k = 0; k < 20; k++) g.update(0.016);
    const lives1 = g.lives;
    for (let k = 0; k < 200; k++) g.update(0.016);
    return { lives1, state: g.state };
  });
  ok(r.lives1 === 2, 'collision costs exactly one life (lives=' + r.lives1 + ')');
  r = await page.evaluate(() => {
    const A = window.__app; A.startMode('highway'); const g = A.game; g.traffic = [];
    g.v = 40; g.px = 20; g.input = { steer: 0, throttle: 0, brake: 0 }; g.update(0.016);
    return { lives: g.lives };
  });
  ok(r.lives === 2, 'hitting the guardrail costs a life');
  r = await page.evaluate(() => {
    const A = window.__app; A.startMode('highway'); const g = A.game; g.traffic = [];
    for (let i = 0; i < 3; i++) { g.cool = 0; g.px = 20; g.update(0.016); }
    return { state: g.state, success: g.result && g.result.success, reason: g.result && g.result.reason };
  });
  ok(r.state === 'done' && r.success === false && /lives/i.test(r.reason), 'three crashes end the mission');

  console.log('Fuel mode');
  r = await page.evaluate(() => {
    const A = window.__app; A.Store.data.car = 'voltix'; A.startMode('fuel'); const g = A.game; g.traffic = [];
    g.input = { steer: 0, throttle: 1, brake: 0 };
    let s = 0; while (g.state === 'running' && s++ < 40000) { g.input.steer = -g.px * 0.25; g.input.throttle = g.v < 22 ? 1 : 0.15; g.update(0.016); }
    return { res: g.result, fuel: g.fuel };
  });
  ok(r.res && r.res.success, 'fuel mission completable with gentle driving (fuel left ' + Math.round(r.fuel * 100) + '%)');
  r = await page.evaluate(() => {
    const A = window.__app; A.Store.data.car = 'apex'; A.startMode('fuel'); const g = A.game; g.traffic = [];
    g.input = { steer: 0, throttle: 1, brake: 0 };
    let s = 0; while (g.state === 'running' && s++ < 40000) { g.input.steer = -g.px * 0.25; g.update(0.016); }
    return { res: g.result };
  });
  ok(r.res && !r.res.success && /fuel/i.test(r.res.reason), 'flooring a thirsty car runs out of fuel (' + (r.res && r.res.reason) + ')');

  console.log('Stop-line mode');
  r = await page.evaluate(() => {
    const A = window.__app; A.Store.data.car = 'meridian'; A.startMode('brake'); const g = A.game;
    g.input = { steer: 0, throttle: 0, brake: 0 };
    const scores = []; let s = 0;
    while (g.state === 'running' && s++ < 90000) {
      g.input.steer = -g.px * 0.25;
      const gap = g.lineZ - (g.pz + 2.3), v = g.v;
      const need = v * v / (2 * 22);                    // braking distance at ~22 m/s^2
      if (g.round !== (g._r || 0)) g._r = g.round;
      g.input.throttle = (v < 20 && gap > need + 15) ? 1 : 0;
      g.input.brake = (gap <= need + 2 && v > 0.1) ? 1 : 0;
      g.update(0.01);
    }
    return { res: g.result, scores: g.roundScores };
  });
  ok(r.res && r.scores.length === 3, '3 rounds are scored: ' + JSON.stringify(r.scores));
  ok(r.res && r.res.success, 'braking well completes the mission (score ' + (r.res && r.res.score) + '/300)');
  r = await page.evaluate(() => {
    const A = window.__app; A.startMode('brake'); const g = A.game;
    g.input = { steer: 0, throttle: 1, brake: 0 };
    let s = 0; while (g.state === 'running' && s++ < 60000) { g.input.steer = -g.px * 0.25; g.update(0.016); }
    return { scores: g.roundScores, success: g.result && g.result.success };
  });
  ok(r.scores.length === 3 && r.scores.every(x => x === 0) && r.success === false, 'never braking overshoots every round and fails');

  console.log('Input + persistence');
  await page.evaluate(() => window.__app.startMode('highway'));
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ v: window.__app.game.v, steer: window.__app.game.input.steer }));
  ok(r.v > 3, 'keyboard throttle works (v=' + r.v.toFixed(1) + ')');
  ok(r.steer > 0.3, 'keyboard steering works (steer=' + r.steer.toFixed(2) + ')');
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
  const box = await page.locator('#pedGas').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.waitForTimeout(600);
  ok(await page.evaluate(() => window.__app.game.input.throttle === 1), 'on-screen gas pedal works');
  await page.mouse.up();
  const wb = await page.locator('#wheel').boundingBox();
  await page.mouse.move(wb.x + wb.width - 6, wb.y + wb.height / 2); await page.mouse.down();
  await page.mouse.move(wb.x + wb.width / 2 + 10, wb.y + wb.height - 6, { steps: 6 }); await page.waitForTimeout(100);
  ok(await page.evaluate(() => Math.abs(window.__app.game.input.steer) > 0.2), 'on-screen steering wheel works');
  await page.mouse.up();
  await page.keyboard.press('p'); ok(await page.isVisible('#pause'), 'P pauses');
  await page.click('#pResume'); ok(!(await page.isVisible('#pause')), 'resume works');
  await page.screenshot({ path: path.join(root, 'shots', 'final-drive.png') });
  await page.click('#btnPause'); await page.click('#pQuit');
  const coins = await page.evaluate(() => window.__app.Store.data.coins);
  await page.reload(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__app.Store.data.coins) === coins && coins > 0, 'coins persist after reload (' + coins + ')');

  console.log('No ads / no network');
  const external = reqs.filter(u => !u.startsWith(base));
  ok(external.length === 0, 'zero external network requests (' + external.length + ')');
  const src = ['index.html', 'style.css', 'js/cars.js', 'js/audio.js', 'js/game.js', 'js/ui.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  ok(!/admob|adsbygoogle|doubleclick|googlesyndication|interstitial|rewarded|applovin|unityads|<iframe|XMLHttpRequest|fetch\(/i.test(src), 'no ad SDK / network code in the source');
  ok(errs.length === 0, 'no console or page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
