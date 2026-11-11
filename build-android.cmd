@echo off
REM 切换到 UTF-8 代码页，避免中文在 GBK 控制台显示为乱码
chcp 65001 >nul
REM 一键打包 Android 正式版（release，含签名）
REM 流程：cap sync 同步配置 -> gradle 编译未签名 APK -> apksigner 手动签名
REM 注意：本脚本绕开 `cap build android` 自带的签名环节（在 build-tools 37 下会报
REM       "Missing AndroidManifest.xml"），改用已验证可用的 apksigner 直接签名。

setlocal
set "BUILD_TOOLS=H:\android\Sdk\build-tools\37.0.0"
REM AGP 的 jlink 转换在 JDK 26 上会失败，优先沿用系统 JAVA_HOME（Android Studio JBR / JDK 21）
if not defined JAVA_HOME set "JAVA_HOME=H:\Android studio\jbr"
set "PATH=%BUILD_TOOLS%;%JAVA_HOME%\bin;%PATH%"

set "ROOT=%~dp0"
set "KS=%ROOT%release.keystore"
set "KS_ALIAS=gequbao"
set "KS_PASS=Gequbao-Remake-app"
set "APK_UNSIGNED=%ROOT%android\app\build\outputs\apk\release\app-release-unsigned.apk"
set "APK_SIGNED=%ROOT%android\app\build\outputs\apk\release\app-release.apk"

echo [build] 使用 JDK: %JAVA_HOME%
echo [build] 使用 build-tools: %BUILD_TOOLS%
echo [build] 签名密钥: %KS%

echo [build] 切换为发布态配置（源码 capacitor.config.json 不含 dev server）...
node "%ROOT%scripts\cap-server.mjs" release
if errorlevel 1 (
    echo [build] 配置切换失败，终止。
    exit /b 1
)

echo [build] 同步 Capacitor 配置到原生工程...
call npx cap sync android
if errorlevel 1 (
    echo [build] cap sync 失败，终止。
    exit /b 1
)

echo [build] 兜底清理 assets 配置中的 dev server 地址（避免 APK 去连 localhost 而白屏）...
node -e "const fs=require('fs');const p='android/app/src/main/assets/capacitor.config.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));delete j.server;fs.writeFileSync(p,JSON.stringify(j,null,2));"

echo [build] 编译 release APK (gradlew assembleRelease)...
cd /d "%ROOT%android"
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo [build] gradle 编译失败，终止。
    exit /b 1
)

if not exist "%APK_UNSIGNED%" (
    echo [build] 未找到未签名 APK: %APK_UNSIGNED%
    exit /b 1
)

echo [build] 用 apksigner 签名...
apksigner sign --ks "%KS%" --ks-key-alias %KS_ALIAS% --ks-pass pass:%KS_PASS% --key-pass pass:%KS_PASS% --out "%APK_SIGNED%" "%APK_UNSIGNED%"
if errorlevel 1 (
    echo [build] 签名失败，终止。
    exit /b 1
)

echo [build] 校验签名...
apksigner verify "%APK_SIGNED%"

echo.
echo [build] 完成！正式版 APK:
echo   %APK_SIGNED%
endlocal
