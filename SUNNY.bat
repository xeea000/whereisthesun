@echo off
setlocal
cd /d "%~dp0"
set URL=http://127.0.0.1:8765/
set PY=C:\Python314\python.exe

curl.exe -s -o NUL -m 2 %URL% >nul 2>&1
if errorlevel 1 (
  echo Restarting SUNNY...
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8765.*LISTENING"') do taskkill /F /PID %%P >nul 2>&1
  if exist "%PY%" (
    start "SUNNY server" /min "%PY%" -m http.server 8765 --bind 127.0.0.1 --directory "%CD%"
  ) else (
    start "SUNNY server" /min python -m http.server 8765 --bind 127.0.0.1 --directory "%CD%"
  )
  ping -n 3 127.0.0.1 >nul
)
explorer %URL%
endlocal
