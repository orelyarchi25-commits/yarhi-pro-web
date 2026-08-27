@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   Yarhi Pro - Gibui Netunim
echo ========================================
echo.
node scripts\backup-workspaces.mjs
echo.
echo ========================================
echo  Siim - hakovetz nimtsa be-tiqiyat backups
echo  Ha'atek oto le-disk / Google Drive
echo ========================================
echo.
pause
