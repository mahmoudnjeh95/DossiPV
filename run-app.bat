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

echo Starting DossiPV on http://localhost:3000 ...
start "" /b cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call npm run dev --workspace=@dossipv/web
goto :eof

:error
echo.
echo Startup failed. See the messages above.
pause
exit /b 1
