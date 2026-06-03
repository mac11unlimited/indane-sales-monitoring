Set shell = CreateObject("WScript.Shell")
project = "C:\Users\MUKESH KUMAR\OneDrive - Indian Oil Corporation Limited\Power BI\iocl_project\indane-sales-monitoring"
ps = "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"
cmd = """" & ps & """ -NoExit -ExecutionPolicy Bypass -File """ & project & "\start-local-portal.ps1" & """"
shell.CurrentDirectory = project
shell.Run cmd, 1, False
