$ErrorActionPreference = 'Stop'

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$ServerLauncher = Join-Path $WorkspaceRoot 'autostart\gaaamed-server.vbs'
$TunnelLauncher = Join-Path $WorkspaceRoot 'autostart\gaaamed-tunnel.vbs'

New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name 'gaaamed-server' -Value "wscript.exe `"$ServerLauncher`""
Set-ItemProperty -Path $RunKey -Name 'gaaamed-tunnel' -Value "wscript.exe `"$TunnelLauncher`""

Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$ServerLauncher`"" -WindowStyle Hidden
Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$TunnelLauncher`"" -WindowStyle Hidden

Get-ItemProperty -Path $RunKey -Name 'gaaamed-server', 'gaaamed-tunnel' | Select-Object gaaamed-server, gaaamed-tunnel
