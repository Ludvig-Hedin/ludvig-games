@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js saknas. Installera aktuell LTS-version fran https://nodejs.org/
  echo Dubbelklicka sedan pa START-WINDOWS.bat igen.
  pause
  exit /b 1
)
node serve.mjs --open
if errorlevel 1 pause
