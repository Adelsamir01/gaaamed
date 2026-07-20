#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

foreach ($TaskName in 'Dedos-Server', 'Dedos-Tunnel') {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
