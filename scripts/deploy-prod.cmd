@echo off
setlocal EnableExtensions

if "%PROD_TARGET_DIR%"=="" (
  set "TARGET_DIR=%USERPROFILE%\services\hiking-telegram-bot-prod"
) else (
  set "TARGET_DIR=%PROD_TARGET_DIR%"
)

if "%REPO_URL%"=="" (
  echo REPO_URL is required for deploy.
  exit /b 1
)

if "%GIT_BRANCH%"=="" (
  set "GIT_BRANCH=main"
)

if "%RUNNER_TEMP%"=="" (
  set "CACHE_ROOT=%TEMP%"
) else (
  set "CACHE_ROOT=%RUNNER_TEMP%"
)

set "CACHE_DIR=%CACHE_ROOT%\hiking-telegram-bot-prod-src"

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

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required on the server.
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo git is required on the server.
  exit /b 1
)

if exist "%CACHE_DIR%\.git" (
  pushd "%CACHE_DIR%"
  call git fetch origin
  if errorlevel 1 exit /b 1
  call git checkout "%GIT_BRANCH%"
  if errorlevel 1 exit /b 1
  call git reset --hard "origin/%GIT_BRANCH%"
  if errorlevel 1 exit /b 1
  popd
) else (
  if exist "%CACHE_DIR%" rmdir /S /Q "%CACHE_DIR%"
  call git clone --branch "%GIT_BRANCH%" --single-branch "%REPO_URL%" "%CACHE_DIR%"
  if errorlevel 1 exit /b 1
)

robocopy "%CACHE_DIR%" "%TARGET_DIR%" /MIR /XD ".git" ".github" "node_modules" /XF ".env"
if %ERRORLEVEL% GEQ 8 exit /b %ERRORLEVEL%

if not exist "%TARGET_DIR%\.env" (
  echo Missing %TARGET_DIR%\.env
  exit /b 1
)

pushd "%TARGET_DIR%"
call pm2 stop "%APP_NAME%" >nul 2>nul

if exist "node_modules" (
  rmdir /S /Q "node_modules"
)

call npm ci --omit=dev
if errorlevel 1 exit /b 1

if not exist "node_modules\telegraf\package.json" (
  echo Missing telegraf after npm ci.
  exit /b 1
)

if not exist "node_modules\sharp\package.json" (
  echo Missing sharp after npm ci.
  exit /b 1
)

if not exist "node_modules\tesseract.js\package.json" (
  echo Missing tesseract.js after npm ci.
  exit /b 1
)

set "APP_STAGE=prod"
call pm2 startOrReload ecosystem.config.cjs --only "%APP_NAME%" --update-env
if errorlevel 1 exit /b 1

call pm2 save
if errorlevel 1 exit /b 1

popd
echo Prod deploy completed.
