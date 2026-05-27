$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "====================================="
Write-Host " Sistema de Gestao de Oficina"
Write-Host "====================================="
Write-Host ""

Set-Location $PSScriptRoot

if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "3001" }

function Test-Command($cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "node")) {
    Write-Host "Node.js nao encontrado."
    Write-Host "Tentando instalar Node.js LTS via winget..."
    Write-Host ""

    if (Test-Command "winget") {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

        Write-Host ""
        Write-Host "Node.js foi instalado."
        Write-Host "Feche esta janela e execute INICIAR_OFICINA.bat novamente."
        Write-Host "Isso e necessario para o Windows atualizar o PATH."
        Write-Host ""
        pause
        exit
    } else {
        Write-Host "ERRO: winget nao encontrado."
        Write-Host "Instale manualmente o Node.js LTS pelo site oficial:"
        Write-Host "https://nodejs.org/"
        Write-Host ""
        pause
        exit 1
    }
}

Write-Host "Node encontrado:"
node -v
Write-Host ""

if (-not (Test-Command "npm")) {
    Write-Host "ERRO: npm nao encontrado."
    Write-Host "Reinstale o Node.js LTS."
    pause
    exit 1
}

Write-Host "npm encontrado:"
npm -v
Write-Host ""

Write-Host "Instalando/verificando dependencias..."
Write-Host "Isso pode demorar na primeira execucao."
Write-Host ""
npm install

Write-Host ""
Write-Host "Abrindo sistema no navegador..."
Start-Process "http://localhost:$env:PORT"

Write-Host ""
Write-Host "Servidor iniciado."
Write-Host "NAO feche esta janela enquanto estiver usando o sistema."
Write-Host ""

node server.js