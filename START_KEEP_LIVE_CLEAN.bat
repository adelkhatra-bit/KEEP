@echo off
setlocal EnableExtensions
chcp 65001 >nul

title KEEP LIVE CLEAN
color 0A

echo ==============================================
echo   KEEP - DEMARRAGE PROPRE DE LA BONNE VERSION
echo ==============================================
echo.

echo [1/8] Fermeture des anciens serveurs Node/Expo/Next...
taskkill /F /IM node.exe >nul 2>&1

echo [2/8] Verification des outils...
where git >nul 2>&1 || (echo ERREUR: Git n'est pas installe. & pause & exit /b 1)
where node >nul 2>&1 || (echo ERREUR: Node.js n'est pas installe. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERREUR: npm n'est pas installe. & pause & exit /b 1)

set "LIVE_ROOT=%USERPROFILE%\Desktop\KEEP-LIVE"
set "REPO=%LIVE_ROOT%\KEEP"

echo [3/8] Suppression UNIQUEMENT de l'ancienne copie KEEP-LIVE...
if exist "%LIVE_ROOT%" rmdir /S /Q "%LIVE_ROOT%"
mkdir "%LIVE_ROOT%"

echo [4/8] Clone du depot officiel adelkhatra-bit/KEEP - branche main...
git clone --branch main --single-branch https://github.com/adelkhatra-bit/KEEP.git "%REPO%"
if errorlevel 1 (echo ERREUR pendant git clone. & pause & exit /b 1)
cd /D "%REPO%"

echo.
echo ===== VERSION QUI VA ETRE LANCEE =====
git remote -v
git branch --show-current
git log -1 --oneline
echo ======================================
echo.

echo [5/8] Installation exacte des dependances...
call npm ci
if errorlevel 1 (echo ERREUR pendant npm ci. & pause & exit /b 1)

set "SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co"
set "SUPABASE_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru"

echo [6/8] Lancement du NOUVEAU Super Admin sur localhost:3001...
start "KEEP SUPER ADMIN - BON MAIN" cmd /k "cd /D \"%REPO%\" && set NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& npm run dev --workspace=packages/admin -- -p 3001"

echo [7/8] Lancement de la NOUVELLE application web sur localhost:8081...
start "KEEP APP - BON MAIN" cmd /k "cd /D \"%REPO%\" && set EXPO_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set EXPO_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& npm run start:web --workspace=packages/mobile -- --port 8081 --clear"

echo [8/8] Attente du demarrage puis ouverture du navigateur...
timeout /t 15 /nobreak >nul
start "" http://localhost:3001
start "" http://localhost:8081

echo.
echo ==============================================
echo BONNE COPIE LOCALE : %REPO%
echo SUPER ADMIN : http://localhost:3001
echo APP KEEP    : http://localhost:8081
echo LOGIN DEMO  : adel.khatra@live.fr / 1234
echo ==============================================
echo.
echo IMPORTANT: si l'ecran Admin affiche encore
 echo "Compte cree depuis le dashboard Supabase",
echo alors ce navigateur n'affiche PAS localhost:3001
echo lance par cette fenetre.
echo.
pause
