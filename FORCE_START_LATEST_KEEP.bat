@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ===============================================
echo        KEEP - REPARATION TOTALE / LATEST MAIN
echo ===============================================
echo.

echo [1/7] Fermeture des anciens serveurs sur 8081 / 3001 / 3000...
for %%P in (8081 3001 3000) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo   - Kill PID %%A sur port %%P
    taskkill /F /PID %%A >nul 2>&1
  )
)

echo [2/7] Verification du depot Git...
if not exist ".git" (
  echo ERREUR: lance ce fichier depuis le dossier KEEP clone depuis GitHub.
  echo Depot attendu: https://github.com/adelkhatra-bit/KEEP
  pause
  exit /b 1
)

echo [3/7] Sauvegarde des modifications locales non commitees...
git status --porcelain > .keep_local_changes.tmp
set /p KEEPCHANGES=<.keep_local_changes.tmp
del .keep_local_changes.tmp >nul 2>&1
if not "!KEEPCHANGES!"=="" (
  git stash push -u -m "KEEP auto backup before FORCE_START_LATEST_KEEP" >nul
  echo   Modifications locales sauvegardees dans git stash.
)

echo [4/7] Forcage sur la derniere version main GitHub...
git fetch origin main
if errorlevel 1 goto :fail
git checkout main
if errorlevel 1 goto :fail
git reset --hard origin/main
if errorlevel 1 goto :fail
git clean -fd
if errorlevel 1 goto :fail

echo.
echo Version Git actuellement lancee:
git log -1 --oneline

echo [5/7] Installation exacte des dependances...
call npm ci --include=dev
if errorlevel 1 goto :fail

echo [6/7] Configuration du vrai Supabase KEEP pour la version locale...
set EXPO_PUBLIC_SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co
set EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru
set EXPO_PUBLIC_DEMO_MODE=true
set EXPO_PUBLIC_KEEP_PREVIEW=1

echo [7/7] Demarrage des deux interfaces ACTUELLES...
echo.
echo SUPER ADMIN ACTUEL : http://localhost:3001
echo Login demo : adel.khatra@live.fr

echo APPLICATION KEEP : http://localhost:8081

echo.
start "KEEP SUPER ADMIN - MAIN" cmd /k "cd /d %CD% && set PORT=3001 && npm --workspace packages/admin run dev"
timeout /t 4 /nobreak >nul
start "KEEP MOBILE WEB - MAIN" cmd /k "cd /d %CD% && set EXPO_PUBLIC_SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co && set EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru && set EXPO_PUBLIC_DEMO_MODE=true && set EXPO_PUBLIC_KEEP_PREVIEW=1 && npm --workspace packages/mobile run web -- --port 8081"

timeout /t 8 /nobreak >nul
start "" http://localhost:3001
start "" http://localhost:8081

echo.
echo ===============================================
echo BONNE VERSION LANCEE.
echo Si l'ancien ecran apparait encore: Ctrl+F5 dans le navigateur.
echo ===============================================
pause
exit /b 0

:fail
echo.
echo ECHEC pendant la remise a niveau Git/npm.
echo Copie la ligne d'erreur affichee au-dessus et envoie-la dans ChatGPT.
pause
exit /b 1
