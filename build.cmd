@echo off
rem Builds the single-file index.html from the sources in src/.
cd /d "%~dp0"
call npm run build
exit /b %errorlevel%
