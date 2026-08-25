@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title KEEP - SOURCE UNIQUE
color 0A

set "REPO=C:\Users\97156\keep"
set "SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co"
set "SUPABASE_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru"

echo ==============================================
echo   KEEP - SOURCE UNIQUE / CLAUDE DESIGN
echo   Projet officiel local : %REPO%
echo ==============================================
echo.

if not exist "%REPO%\.git" (
  echo ERREUR: %REPO% n'est pas un depot Git KEEP valide.
  echo Rien n'a ete supprime.
  pause
  exit /b 1
)

echo [1/9] Fermeture des anciens serveurs Node/Expo/Next...
taskkill /F /IM node.exe >nul 2>&1

echo [2/9] Verification des outils...
where git >nul 2>&1 || (echo ERREUR: Git n'est pas installe. & pause & exit /b 1)
where node >nul 2>&1 || (echo ERREUR: Node.js n'est pas installe. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERREUR: npm n'est pas installe. & pause & exit /b 1)

cd /D "%REPO%"

echo [3/9] Sauvegarde automatique des changements locaux non publies...
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "D=%%d%%c%%b"
  for /f "tokens=1-3 delims=:,. " %%a in ("%time%") do set "T=%%a%%b%%c"
  git stash push -u -m "KEEP_AUTO_BACKUP_!D!_!T!"
  if errorlevel 1 (
    echo ERREUR: impossible de sauvegarder les changements locaux.
    echo Rien ne sera ecrase.
    pause
    exit /b 1
  )
  echo Sauvegarde locale creee dans git stash.
) else (
  echo Aucun changement local non publie.
)

echo [4/9] Synchronisation avec la source officielle GitHub main...
git fetch origin
if errorlevel 1 (echo ERREUR pendant git fetch. & pause & exit /b 1)
git checkout main
if errorlevel 1 (echo ERREUR pendant git checkout main. & pause & exit /b 1)
git pull --ff-only origin main
if errorlevel 1 (
  echo ERREUR: la branche locale ne peut pas etre mise a jour proprement.
  echo Aucun reset force n'a ete effectue.
  pause
  exit /b 1
)

echo.
echo ===== VERSION KEEP QUI VA ETRE LANCEE =====
git remote -v
git branch --show-current
git log -1 --oneline
echo ============================================
echo.

echo [5/9] Controle anti-confusion / source unique...
node scripts\verify-source-of-truth.cjs
if errorlevel 1 (
  echo ERREUR: controle source unique en echec. Lancement bloque.
  pause
  exit /b 1
)

echo [6/9] Installation exacte des dependances...
call npm ci
if errorlevel 1 (echo ERREUR pendant npm ci. & pause & exit /b 1)

echo [7/9] Lancement du Super Admin sur localhost:3001...
start "KEEP SUPER ADMIN - SOURCE UNIQUE" cmd /k "cd /D \"%REPO%\" && set NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& npm run dev --workspace=packages/admin -- -p 3001"

echo [8/9] Lancement de l'application KEEP Claude Design sur localhost:8081...
start "KEEP APP - CLAUDE DESIGN" cmd /k "cd /D \"%REPO%\" && set EXPO_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set EXPO_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& npm run start:web --workspace=packages/mobile -- --port 8081 --clear"

echo [9/9] Ouverture des deux interfaces...
timeout /t 15 /nobreak >nul
start "" http://localhost:3001/login
start "" http://localhost:8081

echo.
echo ==============================================
echo SOURCE UNIQUE : %REPO%
echo SUPER ADMIN   : http://localhost:3001/login
echo APP KEEP      : http://localhost:8081
echo LOGIN DEMO    : adel.khatra@live.fr / 1234
echo ==============================================
echo.
echo Les anciens clones KEEP-LIVE ne sont plus utilises.
echo Les changements locaux eventuels ont ete sauvegardes
echo automatiquement dans git stash avant la mise a jour.
echo.
pause
