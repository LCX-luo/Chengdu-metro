@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if not errorlevel 1 (
    python "%~dp0scripts\launch_local.py"
    goto finish
)
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0scripts\launch_local.py"
    goto finish
)
echo Python 3 is required. Install Python and enable Add Python to PATH.
:finish
if errorlevel 1 pause
endlocal
