#!/usr/bin/env bash
# Builds a debug APK. Needs: Node 20+, JDK 21, Android SDK (ANDROID_HOME set).
set -euo pipefail
cd "$(dirname "$0")/.."
npm install
rm -rf www && mkdir www && cp -r index.html style.css js www/
[ -d android ] || npx cap add android
MANIFEST=android/app/src/main/AndroidManifest.xml
grep -q screenOrientation "$MANIFEST" || sed -i 's/<activity /<activity android:screenOrientation="sensorLandscape" /' "$MANIFEST"
npx cap sync android
(cd android && ./gradlew assembleDebug)
mkdir -p dist && cp android/app/build/outputs/apk/debug/app-debug.apk dist/roadwise-debug.apk
echo "APK ready: dist/roadwise-debug.apk"
