@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0register.ps1"
pause
