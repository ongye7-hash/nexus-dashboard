@echo off
echo ========================================
echo   NEXUS CLI Setup
echo ========================================
echo.

REM NPM 글로벌 경로 확인
for /f "tokens=*" %%i in ('npm prefix -g') do set NPM_GLOBAL=%%i

echo Installing nexus-cli globally...
call npm link

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Usage:
echo   nexus list          - List all projects
echo   nexus open [name]   - Open in VSCode
echo   nexus run [name]    - Run dev server
echo   nexus servers       - List running servers
echo   nexus dashboard     - Open web dashboard
echo   nexus interactive   - Interactive mode
echo.
echo If 'nexus' command is not found, add this to your PATH:
echo   %NPM_GLOBAL%
echo.
pause
