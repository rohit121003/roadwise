@echo off
REM Builds a debug APK on Windows. Needs: Node 20+, JDK 21, Android SDK (ANDROID_HOME set).
cd /d "%~dp0.."
call npm install || exit /b 1
if exist www rmdir /s /q www
mkdir www
copy index.html www\ >nul
copy style.css www\ >nul
xcopy js www\js\ /e /i /q >nul
if not exist android call npx cap add android || exit /b 1
powershell -NoProfile -Command "$p='android\app\src\main\AndroidManifest.xml'; $t=Get-Content $p -Raw; if($t -notmatch 'screenOrientation'){ $t=$t -replace '<activity ','<activity android:screenOrientation=\"sensorLandscape\" '; Set-Content $p $t }"
call npx cap sync android || exit /b 1
pushd android
call gradlew.bat assembleDebug || exit /b 1
popd
if not exist dist mkdir dist
copy android\app\build\outputs\apk\debug\app-debug.apk dist\roadwise-debug.apk >nul
echo APK ready: dist\roadwise-debug.apk
