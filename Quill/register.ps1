# Register Quill as the default handler for .md files on Windows.
# Sets per-user registry keys (HKCU) — no admin required.
# Run via: register.bat  (or right-click → Run with PowerShell)

$quillDir = Split-Path -Parent $PSCommandPath
$vbs      = Join-Path $quillDir "quill-open.vbs"
$cmd      = 'wscript.exe "' + $vbs + '" "%1"'

# .md extension → ProgID
New-Item         -Path "HKCU:\Software\Classes\.md"                                   -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\.md" -Name "(Default)" -Value "QuillMarkdown" -Force

# ProgID display name
New-Item         -Path "HKCU:\Software\Classes\QuillMarkdown"                         -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\QuillMarkdown" -Name "(Default)" -Value "Quill Markdown Editor" -Force

# Open command
New-Item         -Path "HKCU:\Software\Classes\QuillMarkdown\shell\open\command"      -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\QuillMarkdown\shell\open\command" -Name "(Default)" -Value $cmd -Force

Write-Host ""
Write-Host "Done!  .md files will now open with Quill when double-clicked."
Write-Host "Command: $cmd"
Write-Host ""
