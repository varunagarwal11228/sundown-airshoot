@echo off
rem Moved the game folder? Double-click this once and the "Sundown Airshoot"
rem icon on the Desktop will point at the folder's new location.
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$h = $env:HERE.TrimEnd('\');" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Sundown Airshoot.lnk');" ^
  "$s.TargetPath = $h + '\Play Sundown Airshoot.bat'; $s.WorkingDirectory = $h;" ^
  "$s.IconLocation = $h + '\assets\icon.ico,0'; $s.WindowStyle = 7;" ^
  "$s.Description = 'Sundown Airshoot - 3D arcade shooter'; $s.Save()"
echo Desktop shortcut updated.
ping -n 3 127.0.0.1 >nul
