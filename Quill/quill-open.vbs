' Quill silent launcher for Windows file association.
' Called by the registry handler: wscript.exe "quill-open.vbs" "%1"
' Uses wscript (not cscript) so no console window appears.

Option Explicit

Dim quillDir, pythonW, mainPy, filePath, cmd
Dim sh

' Resolve the Quill project directory from this script's location
quillDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
pythonW  = quillDir & "\venv\Scripts\pythonw.exe"
mainPy   = quillDir & "\main.py"

' First argument is the file to open (may be absent for plain launch)
filePath = ""
If WScript.Arguments.Count > 0 Then
    filePath = WScript.Arguments.Item(0)
End If

' Build the command, quoting all paths to handle spaces
If filePath <> "" Then
    cmd = """" & pythonW & """ """ & mainPy & """ """ & filePath & """"
Else
    cmd = """" & pythonW & """ """ & mainPy & """"
End If

' Run without a window (second arg = 0)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = quillDir
sh.Run cmd, 0, False
Set sh = Nothing
