@echo off
rem Builds index.html and runs the build test suite (npm test).
cd /d "%~dp0"
call npm test
exit /b %errorlevel%
