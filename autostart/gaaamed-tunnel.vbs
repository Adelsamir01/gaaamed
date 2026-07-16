' gaaamed Cloudflare Tunnel - hidden autostart launcher
' Token lives in sdk-installer\tunnel-token.txt (gitignored) - never hard-code it here.
Dim sh, fso, root, token
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
token = Trim(fso.OpenTextFile(root & "\sdk-installer\tunnel-token.txt", 1).ReadAll())
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run """" & root & "\sdk-installer\cloudflared.exe"" tunnel --no-autoupdate --protocol http2 run --token " & token, 0, False
