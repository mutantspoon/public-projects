# Quill - Clean up stale "Open with" registry entries
# Removes old Python/VBS-based Quill registrations from HKCU.
# Safe to run without admin rights. The Tauri-installed version is unaffected.

$extensions = @('.md', '.markdown', '.txt')
$removed = 0

foreach ($ext in $extensions) {
    # ── OpenWithList (MRU list shown in right-click → Open with) ──────────────
    $mruPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList"
    if (Test-Path $mruPath) {
        $key = Get-Item $mruPath
        $mruList = $key.GetValue("MRUList")
        if ($mruList) {
            $keep = [System.Collections.Generic.List[char]]::new()
            foreach ($letter in $mruList.ToCharArray()) {
                $val = $key.GetValue([string]$letter)
                # Remove any entry whose path no longer exists on disk
                $stale = $false
                if ($val -and -not (Test-Path $val)) { $stale = $true }
                if ($stale) {
                    Write-Host "Removing stale $ext entry: $val"
                    Remove-ItemProperty -Path $mruPath -Name ([string]$letter) -ErrorAction SilentlyContinue
                    $removed++
                } else {
                    $keep.Add($letter)
                }
            }
            $newMru = -join $keep
            if ($newMru -ne $mruList) {
                Set-ItemProperty -Path $mruPath -Name "MRUList" -Value $newMru
            }
        }
    }

    # ── OpenWithProgids (ProgID-based associations) ────────────────────────────
    $progPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids"
    if (Test-Path $progPath) {
        $key = Get-Item $progPath
        foreach ($name in @($key.GetValueNames())) {
            if ($name -imatch 'quill') {
                Write-Host "Removing stale ProgID from $ext\OpenWithProgids: $name"
                Remove-ItemProperty -Path $progPath -Name $name -ErrorAction SilentlyContinue
                $removed++
            }
        }
    }
}

# ── Old ProgID entries under HKCU\Software\Classes ────────────────────────────
$classesPath = "HKCU:\Software\Classes"
foreach ($child in @(Get-ChildItem $classesPath -ErrorAction SilentlyContinue)) {
    if ($child.PSChildName -imatch 'quill') {
        Write-Host "Removing HKCU Classes ProgID: $($child.PSChildName)"
        Remove-Item -Path $child.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        $removed++
    }
}

# ── Old Applications\Quill.exe user-scope registration ────────────────────────
$appPath = "HKCU:\Software\Classes\Applications\Quill.exe"
if (Test-Path $appPath) {
    Write-Host "Removing HKCU Applications\Quill.exe"
    Remove-Item -Path $appPath -Recurse -Force -ErrorAction SilentlyContinue
    $removed++
}

if ($removed -eq 0) {
    Write-Host "Nothing to clean - no stale entries found."
} else {
    Write-Host ""
    Write-Host "Removed $removed stale entries."
    Write-Host "Restart Explorer for changes to appear immediately:"
    Write-Host '  Stop-Process -Name explorer -Force'
}
