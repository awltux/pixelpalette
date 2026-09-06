@echo off
rem Hosts the built deliverables in dist/ locally (run `npm run build` first).
rem Optional: pass a port number.
rem   host.cmd          -> http://localhost:8080
rem   host.cmd 9000     -> http://localhost:9000
cd /d "%~dp0"
if "%~1"=="" (
  call npm run host
) else (
  call npm run host -- %*
)
exit /b %errorlevel%
