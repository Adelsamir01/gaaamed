@echo off
rem Uses boot-time tasks when elevated; otherwise installs supervised login startup for this user.
net session >nul 2>&1
if %errorlevel%==0 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-startup-tasks.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-user-autostart.ps1"
)
pause
