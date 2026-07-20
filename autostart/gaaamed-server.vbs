' Dedos server supervisor - hidden login fallback launcher
Dim sh, fso, root
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run """" & root & "\runtime\node.exe"" """ & root & "\autostart\supervisor.mjs"" server", 0, False
