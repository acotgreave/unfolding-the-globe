@echo off
rem ============================================================
rem  Unfolding the Globe - start the site locally.
rem
rem  Double-click this file, or run it from a terminal.
rem  Optional: pass a port number, e.g.  run.bat 3000
rem
rem  There is nothing to install - the site has no dependencies.
rem  (You can also just open index.html in a browser.)
rem ============================================================

setlocal

rem Work from this file's folder, wherever it was launched from.
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo.
  echo   Install it from https://nodejs.org/ ^(the LTS build is fine^),
  echo   then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "tools\serve.mjs" (
  echo.
  echo   Could not find tools\serve.mjs
  echo   Keep run.bat in the project folder, next to index.html.
  echo.
  pause
  exit /b 1
)

echo.
echo   Unfolding the Globe
echo   ---------------------------------------------
echo   Serving on  http://localhost:%PORT%
echo.
echo   Your browser should open in a moment.
echo   Close this window, or press Ctrl+C, to stop.
echo.

rem Give the server a beat to bind the port before opening the browser.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "http://localhost:%PORT%""

node tools\serve.mjs %PORT%

rem Only reached if the server exits or fails to start.
echo.
echo   Server stopped.
pause
