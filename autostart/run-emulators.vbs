' launches both gaaamed test emulators, detached
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Users\Adel\AppData\Local\Android\Sdk\emulator\emulator.exe"" -avd gaaamed -dns-server 8.8.8.8,1.1.1.1", 1, False
WScript.Sleep 4000
sh.Run """C:\Users\Adel\AppData\Local\Android\Sdk\emulator\emulator.exe"" -avd gaaamed2 -dns-server 8.8.8.8,1.1.1.1", 1, False
