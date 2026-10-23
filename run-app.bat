@echo off
setlocal
cd /d "%~dp0"
title DossiPV

if not exist node_modules (
  echo Installing dependencies...
  call npm ci || goto :error
)

if not exist .env (
  echo Creating .env...
  call npm run setup:env || goto :error
)

echo Starting database (Docker)...
call npm run db:up
if errorlevel 1 echo [warning] Could not start the Docker database. Continuing - make sure Postgres is running on port 5432.

echo Applying migrations...
call npm run db:migrate || goto :error

rem The dossier worker turns queued dossiers into PDFs; without it they stay PENDING forever.
rem It needs LibreOffice (soffice) on the PATH; a portable copy is looked up in %USERPROFILE%LibreOfficeX.
if exist "%USERPROFILE%LibreOfficeXprogramsoffice.exe" set "PATH=%USERPROFILE%LibreOfficeXprogram;%PATH%"
where soffice >nul 2>nul || echo [warning] LibreOffice (soffice) not found: dossiers will fail at the PDF step.
echo Starting the dossier worker...
start "DossiPV worker" cmd /k "cd /d "%~dp0appsweb" && set FILE_STORAGE_ROOT=%~dp0appsweb.file-storage&& node --env-file=.env --import tsx ....packagesdossier-workersrcstart.ts"

echo Starting DossiPV on http://localhost:3000 ...
start "" /b cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call npm run dev --workspace=@dossipv/web
goto :eof

:error
echo.
echo Startup failed. See the messages above.
pause
exit /b 1
