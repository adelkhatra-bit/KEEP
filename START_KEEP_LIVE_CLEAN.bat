@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title KEEP - RECONCILIATION SOURCE UNIQUE
color 0A

set "REPO=C:\Users\97156\keep"
set "BRANCH=reconcile/claude-main-20260825"
set "SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co"
set "SUPABASE_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru"

echo ==============================================
echo   KEEP - SOURCE UNIQUE / CLAUDE DESIGN
echo   Projet local : %REPO%
echo   Branche      : %BRANCH%
echo ==============================================
echo.

if not exist "%REPO%\.git" (
  echo ERREUR: %REPO% n'est pas un depot Git KEEP valide.
  pause
  exit /b 1
)

echo [1/10] Fermeture des anciens serveurs Node/Expo/Next...
taskkill /F /IM node.exe >nul 2>&1

echo [2/10] Verification des outils...
where git >nul 2>&1 || (echo ERREUR: Git n'est pas installe. & pause & exit /b 1)
where node >nul 2>&1 || (echo ERREUR: Node.js n'est pas installe. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERREUR: npm n'est pas installe. & pause & exit /b 1)

cd /D "%REPO%"

echo [3/10] Sauvegarde des changements locaux non publies...
set "DIRTY="
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  git stash push -u -m "KEEP_AUTO_BACKUP_BEFORE_RECONCILE"
  if errorlevel 1 (echo ERREUR sauvegarde locale. & pause & exit /b 1)
)

echo [4/10] Synchronisation de la branche de reconciliation...
git fetch origin
if errorlevel 1 (echo ERREUR git fetch. & pause & exit /b 1)
git switch "%BRANCH%"
if errorlevel 1 (
  git switch -c "%BRANCH%" --track "origin/%BRANCH%"
)
if errorlevel 1 (echo ERREUR changement de branche. & pause & exit /b 1)
git pull --ff-only origin "%BRANCH%"
if errorlevel 1 (echo ERREUR mise a jour branche. Aucun reset force. & pause & exit /b 1)

echo.
echo ===== VERSION KEEP LANCEE =====
git branch --show-current
git log -1 --oneline
echo ================================

echo [5/10] Controle source unique...
node scripts\verify-source-of-truth.cjs
if errorlevel 1 (echo ERREUR controle source unique. & pause & exit /b 1)

echo [6/10] Installation des dependances...
call npm ci
if errorlevel 1 (echo ERREUR npm ci. & pause & exit /b 1)

echo [7/10] Lancement API backend sur localhost:3010...
start "KEEP BACKEND - RECONCILE" cmd /k "cd /D \"%REPO%\" && set SUPABASE_URL=%SUPABASE_URL%&& set SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set PORT=3010&& npm run dev --workspace=packages/backend"

echo [8/10] Lancement Super Admin sur localhost:3001...
start "KEEP SUPER ADMIN - RECONCILE" cmd /k "cd /D \"%REPO%\" && set NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set NEXT_PUBLIC_API_URL=http://localhost:3010&& npm run dev --workspace=packages/admin -- -p 3001"

echo [9/10] Lancement application KEEP Claude Design sur localhost:8081...
start "KEEP APP - CLAUDE DESIGN RECONCILE" cmd /k "cd /D \"%REPO%\" && set EXPO_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set EXPO_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set EXPO_PUBLIC_DEMO_MODE=false&& set EXPO_PUBLIC_API_URL=http://localhost:3010&& npm run start:web --workspace=packages/mobile -- --port 8081 --clear"

echo [10/10] Ouverture des interfaces...
timeout /t 18 /nobreak >nul
start "" http://localhost:3001/login
start "" http://localhost:8081

echo.
echo ==============================================
echo BRANCHE ACTIVE : %BRANCH%
echo SUPER ADMIN    : http://localhost:3001/login
echo APP KEEP       : http://localhost:8081
echo API            : http://localhost:3010
echo AUTH ADMIN     : code e-mail Supabase, pas de mot de passe demo
echo ==============================================
echo.
pause
