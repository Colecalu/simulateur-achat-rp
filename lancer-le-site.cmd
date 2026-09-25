@echo off
rem ===========================================================================
rem  Lance le simulateur en local, a la bonne adresse.
rem
rem  Double-cliquez sur ce fichier. Il ouvre le site dans votre navigateur a
rem  l'adresse http://localhost:4173 et laisse tourner un petit serveur.
rem
rem  POURQUOI un serveur plutot qu'un double-clic sur index.html :
rem  ouvert en double-clic, la page s'affiche a une adresse "file://..." ou le
rem  navigateur refuse une partie de ce dont le site a besoin. C'est la meme
rem  raison qui interdit les modules ES dans ce projet (voir CLAUDE.md).
rem
rem  Pour arreter : fermez cette fenetre noire, ou appuyez sur Ctrl+C.
rem ===========================================================================

cd /d "%~dp0"

echo.
echo   Simulateur achat / location - lancement local
echo   ---------------------------------------------
echo.

rem --- Verification 1 : le dossier du site est-il la ? ----------------------
if not exist "frontend\index.html" (
  echo   PROBLEME : le dossier "frontend" est introuvable.
  echo   Ce fichier doit rester a la racine du projet.
  echo.
  pause
  exit /b 1
)

rem --- Verification 2 : la sauvegarde locale est-elle presente ? ------------
rem  Si ce fichier manque, c'est que la branche affichee dans GitHub Desktop
rem  ne contient pas encore l'etape 1. Le site fonctionnera, mais il ne
rem  retiendra pas votre saisie.
if not exist "frontend\js\sauvegarde.js" (
  echo   ATTENTION : la sauvegarde locale n'est pas presente sur cette branche.
  echo.
  echo   Votre saisie ne sera PAS retenue quand vous fermerez l'onglet.
  echo.
  echo   Pour la recuperer, dans GitHub Desktop :
  echo     1. en haut, cliquez sur "Current branch"
  echo     2. choisissez "etape-1-sauvegarde-locale"
  echo     3. relancez ce fichier
  echo.
  echo   Appuyez sur une touche pour lancer quand meme le site.
  pause >nul
)

rem --- Verification 3 : Node est-il installe ? ------------------------------
where npx >nul 2>nul
if errorlevel 1 (
  echo   PROBLEME : Node.js n'est pas installe.
  echo   Telechargez-le sur https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

echo   Adresse du site : http://localhost:4173
echo   (c'est TOUJOURS cette adresse, notez-la)
echo.
echo   Pour arreter : fermez cette fenetre.
echo.

rem Le navigateur s'ouvre apres une seconde, le temps que le serveur demarre.
start "" /b cmd /c "timeout /t 1 >nul & start "" http://localhost:4173"

rem -c-1 desactive le cache : vos modifications sont visibles au rechargement.
npx --yes http-server frontend -p 4173 -c-1
