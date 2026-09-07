@echo off
rem Hosts the built deliverables in dist/ locally (run `npm run build` first).
rem Defaults to port 8081 to avoid clashing with other local dev servers on 8080.
rem Optional: pass a port number to override.
rem   host.cmd          -> http://localhost:8081
rem   host.cmd 9000     -> http://localhost:9000
cd /d "%~dp0"
if "%~1"=="" (
  call npm run host -- 8081
) else (
  call npm run host -- %*
)
exit /b %errorlevel%
