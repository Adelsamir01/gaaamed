#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$NodePath = Join-Path $WorkspaceRoot 'runtime\node.exe'
$Supervisor = Join-Path $WorkspaceRoot 'autostart\supervisor.mjs'

function Register-DedosTask([string]$Name, [string]$Mode) {
  $Arguments = "`"$Supervisor`" $Mode"
  $Action = New-ScheduledTaskAction -Execute $NodePath -Argument $Arguments -WorkingDirectory $WorkspaceRoot
  $Trigger = New-ScheduledTaskTrigger -AtStartup
  $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -MultipleInstances IgnoreNew
  $Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Dedos production supervisor: $Name" -Force | Out-Null
  Start-ScheduledTask -TaskName $Name
}

Register-DedosTask 'Dedos-Server' 'server'
Register-DedosTask 'Dedos-Tunnel' 'tunnel'

# Remove the old login-only launchers if present. The startup tasks replace them.
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'gaaamed-server' -ErrorAction SilentlyContinue
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'gaaamed-tunnel' -ErrorAction SilentlyContinue

Get-ScheduledTask -TaskName 'Dedos-Server', 'Dedos-Tunnel' | Select-Object TaskName, State
