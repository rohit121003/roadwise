# Implementation plan: "Roadwise Driving" (original game, own code and art)

## Stack decision
Vanilla JavaScript + HTML5 Canvas 2D + WebAudio. No build step, no dependencies, no network.
- Runs by opening `index.html`, works offline, installs to a phone home screen, and can be wrapped into
  an APK with Capacitor if wanted.
- A pseudo-3D (scanline road projection) renderer gives a chase-camera 3D feel with tiny code.
- All art is vector code and all sound is synthesized, so nothing is copied from the reference app.

## Scope
1. Menu -> mode select -> garage -> drive -> result.
2. Modes: Highway (traffic, 3 lives), Fuel Saver (eco driving), Stop Line (braking test, 3 rounds).
3. Controls: touch steering wheel + pedals; keyboard (arrows/WASD, Space brake, H horn, P pause).
4. 12 original cars with stats; **all unlocked from the start** (no lock state exists in code).
5. **No ads**: no ad code, no SDKs, no network requests at all (verified by test).
6. Coins/best scores saved in localStorage.

## Files
index.html, style.css, js/cars.js (car data + vector drawing), js/audio.js (synth sound),
js/game.js (physics, modes, renderer), js/ui.js (screens, input, storage), tests/run.js.

## Verification
Headless Chromium test: every screen, 12 cars selectable, each mode runs and ends, crash and
fuel/finish logic, no network requests, no ad strings in the source, screenshots reviewed.
