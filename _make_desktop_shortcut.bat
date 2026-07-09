@echo off
setlocal

:: Define the target file and the shortcut name
set "TargetFile=%~dp0_start.bat"
set "ShortcutName=UI for yt-dlp.lnk"

:: Check if the target file exists
if not exist "%TargetFile%" (
    echo [ERROR] _start.bat was not found in this folder.
    echo Please make sure this script is in the same directory as _start.bat.
    pause
    exit /b 1
)

echo Creating desktop shortcut for _start.bat...

:: Use PowerShell to dynamically find the true Desktop path and safely handle variables
powershell -NoProfile -Command ^
"$wsh = New-Object -ComObject WScript.Shell; ^
$desktop = [System.Environment]::GetFolderPath('Desktop'); ^
$shortcutPath = Join-Path $desktop $env:ShortcutName; ^
$shortcut = $wsh.CreateShortcut($shortcutPath); ^
$shortcut.TargetPath = $env:TargetFile; ^
$shortcut.WorkingDirectory = Split-Path -Path $env:TargetFile -Parent; ^
$shortcut.Save()"

if %errorlevel% equ 0 (
    echo [SUCCESS] Shortcut created on your Desktop!
) else (
    echo [ERROR] Failed to create the shortcut.
)

pause
exit /b