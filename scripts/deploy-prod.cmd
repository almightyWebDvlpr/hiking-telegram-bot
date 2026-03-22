@echo off
setlocal EnableExtensions

if "%PROD_TARGET_DIR%"=="" (
  set "TARGET_DIR=%USERPROFILE%\services\hiking-telegram-bot-prod"
) else (
  set "TARGET_DIR=%PROD_TARGET_DIR%"
)

if "%GITHUB_WORKSPACE%"=="" (
  set "SOURCE_DIR=%~dp0.."
) else (
  set "SOURCE_DIR=%GITHUB_WORKSPACE%"
)

set "APP_NAME=hiking-bot-prod"

echo Deploying prod to: %TARGET_DIR%

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

where robocopy >nul 2>nul
if errorlevel 1 (
  echo robocopy is required for deploy.
  exit /b 1
)

where pm2 >nul 2>nul
if errorlevel 1 (
  echo pm2 is required on the server.
  exit /b 1
)

robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /MIR /XD ".git" ".github" "node_modules" /XF ".env"
if %ERRORLEVEL% GEQ 8 exit /b %ERRORLEVEL%

if not exist "%TARGET_DIR%\.env" (
  echo Missing %TARGET_DIR%\.env
  exit /b 1
)

pushd "%TARGET_DIR%"
call npm ci --omit=dev
if errorlevel 1 exit /b 1

set "APP_STAGE=prod"
call pm2 startOrReload ecosystem.config.cjs --only "%APP_NAME%" --update-env
if errorlevel 1 exit /b 1

call pm2 save
if errorlevel 1 exit /b 1

popd
echo Prod deploy completed.
