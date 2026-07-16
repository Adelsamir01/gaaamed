@echo off
rem Registers gaaamed server + tunnel to start hidden at user logon (HKCU Run key - no admin needed)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "gaaamed-server" /t REG_SZ /d "wscript.exe \"C:\Users\Adel\Documents\Kimi\Workspaces\gaaamed\autostart\gaaamed-server.vbs\"" /f
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "gaaamed-tunnel" /t REG_SZ /d "wscript.exe \"C:\Users\Adel\Documents\Kimi\Workspaces\gaaamed\autostart\gaaamed-tunnel.vbs\"" /f
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "gaaamed-server"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "gaaamed-tunnel"
