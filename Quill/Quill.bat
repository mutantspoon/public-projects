@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo Setting up Quill for the first time...
    set "PY="
    for /f "delims=" %%i in ('py -3.10 -c "import sys; print(sys.executable)" 2^>nul') do set "PY=%%i"
    if not defined PY (
        for /f "delims=" %%i in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PY=%%i"
    )
    if not defined PY set "PY=python"
    "%PY%" -m venv venv
    venv\Scripts\pip install -r requirements.txt
    echo.
)

start "" venv\Scripts\pythonw.exe main.py
