@echo off
title Sistema de Gestao de Oficina

cd /d "%~dp0"

echo =====================================
echo Sistema de Gestao de Oficina
echo =====================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0INSTALAR_E_INICIAR.ps1"

pause