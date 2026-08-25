@echo off
setlocal
title KEEP - Mise a jour et lancement
cd /d "%~dp0"

echo ==========================================
echo KEEP - recuperation de la derniere version
echo ==========================================

where git >nul 2>nul || (
  echo ERREUR: Git n'est pas installe ou pas dans le PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo ERREUR: Node/npm n'est pas installe ou pas dans le PATH.
  pause
  exit /b 1
)

echo [1/4] Synchronisation GitHub...
git fetch origin || goto :error
git checkout main || goto :error
git pull --ff-only origin main || goto :error

echo [2/4] Installation/verifications des dependances...
call npm ci || goto :error

echo [3/4] Verification TypeScript...
call npm --workspace packages/mobile run type-check || goto :error

echo [4/4] Lancement KEEP web...
echo Une nouvelle fenetre va lancer Expo Web.
start "KEEP WEB" cmd /k "cd /d \"%~dp0\" && npm --workspace packages/mobile run start:web"

echo.
echo KEEP est a jour. Si un ancien onglet est ouvert, recharge-le avec Ctrl+F5.
pause
exit /b 0

:error
echo.
echo ERREUR pendant la mise a jour. Rien n'a ete force ni supprime.
pause
exit /b 1
