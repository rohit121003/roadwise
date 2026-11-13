# Roadwise Driving

A small original driving game: all 12 cars unlocked from the start and no ads, no tracking, no network calls.
Plain HTML5 Canvas + JavaScript + WebAudio. No build step, no dependencies. All art is drawn in code and all
sound is synthesized, so nothing is copied from any other game.

## Run it
Option A (quickest): open `index.html` in Chrome, Edge, Firefox or Safari. It works from a plain file.
Option B (local server, needed for installing as an app on a phone):

    python3 -m http.server 8000      # then open http://localhost:8000

Landscape orientation works best on phones.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Steer | Left/Right or A/D | Drag the steering wheel (it springs back) |
| Accelerate | Up or W | GAS pedal |
| Brake | Down, S or Space | BRAKE pedal |
| Horn | H | HORN button |
| Pause | P or Esc | II button |

## Missions
- **Highway**: reach 2.5 km through traffic. 3 lives. Close calls give bonus coins.
- **Fuel Saver**: reach 2 km before the tank is empty. Gentle throttle and coasting save fuel; thirsty cars need care.
- **Stop Line**: three rounds. Pass 45 km/h, then stop in the green zone before the line (perfect within 1.5 m). Crossing it scores 0.

Coins and best scores are saved in the browser (localStorage).

## The two requested features
- **All cars unlocked**: the car list in `js/cars.js` has no price, owned or locked field and the garage has no lock logic. Pick any of the 12.
- **No ads**: there is no ad SDK, no `fetch`/XHR and no external URL anywhere. The test suite checks this.

## Project layout
    index.html        screens and HUD markup
    style.css         theme and responsive layout
    js/cars.js        12 cars (stats) + vector car renderer
    js/audio.js       synthesized engine, crash, horn, UI sounds
    js/game.js        physics, modes, traffic, pseudo-3D road renderer
    js/ui.js          menus, garage, input, storage, main loop
    tests/run.js      end-to-end tests (Playwright)
    docs/             ANALYSIS.md (what the reference APK is) and PLAN.md

## Run the tests
    npm install playwright && npx playwright install chromium
    node tests/run.js
Expected: `30 passed, 0 failed`.

## Make an Android APK
The app is wrapped with Capacitor (WebView). Not built or tested inside this repo's authoring environment
(no Android SDK there), so the first build is yours to confirm. Pick one route:

**A. GitHub, nothing to install (easiest)**
1. Create a new GitHub repository and upload every file in this folder (keep `.github/workflows/`).
2. Open the Actions tab, choose "Build Android APK", click "Run workflow".
3. When it finishes, download `roadwise-debug-apk` from the run page, unzip it and install `roadwise-debug.apk`
   on your phone (allow "install unknown apps").

**B. On your Windows PC, automatic**
Run `powershell -ExecutionPolicy Bypass -File scripts\setup-and-build.ps1` from the project folder. It installs Node,
JDK 21 and the Android SDK pieces if missing, then builds the APK.

**B2. On your Windows PC, manual**
Install Node 20+, JDK 21 and Android Studio (it installs the Android SDK), set `ANDROID_HOME`
(usually `%LOCALAPPDATA%\Android\Sdk`), then run `scripts\build-apk.bat`.
Result: `dist\roadwise-debug.apk`.

**C. Mac / Linux**
Same prerequisites, then `bash scripts/build-apk.sh`.

The APK is a debug build (installable directly). For Play Store you would create a signed release build in
Android Studio. Change the package id and name in `capacitor.config.json` before publishing.

## Tweaking
- Car stats: edit `CARS` in `js/cars.js`.
- Mission goals and fuel use: `MODES` at the top of `js/game.js`.
- Road curviness: `curveAt()` and `CURVE_K` in `js/game.js`.
