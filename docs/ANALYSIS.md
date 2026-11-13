# Analysis of the reference APK (Dr. Driving 1)

Method: static inspection only (unzip, dex string/class listing, asset stats). The APK was never run.
REA could not open the file directly because the APK lives in the cloud workspace while REA runs on the
user's PC (path not visible there). The REA/Ghidra setup itself was verified working on the PC; to use it on
this APK, copy the APK to a local folder and point `inspect_android_package` / `search_android_classes` at it.

## Package facts
- Package `com.ansangha.drdriving`, single activity `DrDrivingActivity`.
- Native Java/Kotlin Android app. **No `.so` native libraries** (no Unity / Unreal / Cocos).
- Own code is tiny and obfuscated: ~35 classes in `drdriving` (+ `tool/`), ~18 in `framework`
  (`framework/impl`) -> a hand-written mini game framework (OpenGL ES style: `g_spr*` sprite fields,
  `setScreen`, per-screen classes), not a commercial engine.
- ~85% of the dex is third-party SDKs: Google Mobile Ads (AdMob), Play Billing, Play Games v2,
  Firebase (Firestore, Auth, Analytics), WorkManager, gRPC/protobuf, Kotlin coroutines.
- Permissions: INTERNET, ACCESS_NETWORK_STATE, AD_ID, ad-services, foreground service, wake lock.

## Assets (11 MB)
- 28 playable car meshes `carNN.obj` + `carNN.png` textures (512x512 or 512x256) + `lightNN.obj` (brake/head
  light meshes) + 28 interior textures. Meshes are very low poly (about 55-80 vertices, 80-130 faces).
- 2 AI traffic car models, road, road edge fence, barricades, traffic cones/blocks, parking boxes,
  checkpoint, tires + tire-track decals, sky dome, police / VIP / driver models.
- UI is texture atlases (`ui.png`, `menu.png`, `world.png`, `logo.png`, `background.png`, all 1024x1024).
- Sounds: engine loop, horn, brake, drift, blinker, crash x2, click/toggle, clap, start jingle.

## Features / game modes (from constant names and strings)
- Missions: Highway, Fuel Efficiency, Broken Brake, Drift, Parking, plus free driving; "Mission Clear 10+"
  achievements per type (Play Games achievements + leaderboards).
- Economy: two currencies, **Coin** (earned) and **Gold** (bought). Gold packs 2/5/10, Coin packs 200/600/1500.
  Cars are locked behind coins/gold. This is what the "unlock all cars" requirement removes.
- Ads: banner, interstitial, rewarded video (AdMob) + an offline-ads dialog.
- Gameplay values tracked: max speed, travel distance per sub-mission, gear, KM/H, navigation sprite.

## Interface and workflow
Logo/menu -> mode select -> garage (car pick) -> mission -> result (coins) -> shop / achievements.
In-drive: on-screen steering wheel (or tilt), brake and accelerator pedals, gear and speedometer,
navigation arrow, optional interior (cockpit) camera. 3D third-person chase camera.
"Drawing tools": there is no user-drawing feature; the nearest equivalents are the sprite-atlas UI,
tire-track decals and the road/line rendering.

## Technology stack of the original
Java/Kotlin, Android SDK, OpenGL ES with a custom framework, Wavefront OBJ meshes, OGG/MP3 audio,
AdMob + Play Billing + Firebase + Play Games.
