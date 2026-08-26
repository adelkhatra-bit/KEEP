@echo off
chcp 65001 >nul
title KEEP - MODE PRO SOURCE UNIQUE
cd /D C:\Users\97156\keep
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\97156\keep\START_KEEP_PRO.ps1"
if errorlevel 1 (
  echo.
  echo ERREUR: le lanceur KEEP PRO s'est arrete.
  echo Regarde le message ci-dessus.
  pause
)
