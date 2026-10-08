@echo off
rem Opens the game in its own app window (no tabs, no address bar).
rem Works fully offline. Press F in game for fullscreen.
setlocal EnableDelayedExpansion
set "GAME=%~dp0dist\SundownAirshoot.html"
if not exist "%GAME%" (
  echo The game build is missing. Build it with:  python tools\build.py
  pause
  exit /b 1
)
set "URL=file:///%GAME:\=/%"
set "URL=!URL: =%%20!"

for %%B in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%B (
    start "" %%B --app="%URL%" --start-maximized
    exit /b 0
  )
)

rem No Edge/Chrome found: fall back to the default browser.
start "" "%GAME%"
