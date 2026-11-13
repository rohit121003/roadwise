# One-shot Windows setup + APK build for Roadwise Driving.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\setup-and-build.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host '== 1/5 Node.js ==' -ForegroundColor Cyan
if (-not (Have 'node')) { winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements; Refresh-Path }
if (-not (Have 'node')) { throw 'Node.js was installed but is not on PATH yet. Close this window, open a new one and run the script again.' }
node --version

Write-Host '== 2/5 JDK 21 ==' -ForegroundColor Cyan
$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) {
  winget install -e --id EclipseAdoptium.Temurin.21.JDK --accept-source-agreements --accept-package-agreements
  $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' | Select-Object -First 1
}
$env:JAVA_HOME = $jdk.FullName
[Environment]::SetEnvironmentVariable('JAVA_HOME', $env:JAVA_HOME, 'User')
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version

Write-Host '== 3/5 Android command-line tools ==' -ForegroundColor Cyan
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$sdkmanager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  New-Item -ItemType Directory -Force $sdk | Out-Null
  $zip = Join-Path $env:TEMP 'cmdline-tools.zip'
  Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile $zip
  $tmp = Join-Path $env:TEMP 'cmdline-tools-x'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip $tmp
  New-Item -ItemType Directory -Force (Join-Path $sdk 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $tmp 'cmdline-tools') (Join-Path $sdk 'cmdline-tools\latest')
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')

Write-Host '== 4/5 Android SDK packages + licences ==' -ForegroundColor Cyan
(1..60 | ForEach-Object { 'y' }) | & $sdkmanager --licenses | Out-Null
& $sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'

Write-Host '== 5/5 Build APK ==' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'build-apk.bat')
if ($LASTEXITCODE -ne 0) { throw 'APK build failed. Copy the error above and send it to Claude.' }
Write-Host ''
Write-Host 'Done. Your APK: dist\roadwise-debug.apk' -ForegroundColor Green
