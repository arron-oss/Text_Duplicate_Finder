$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$electronDist = Join-Path $root 'node_modules\electron\dist'
if (-not (Test-Path (Join-Path $electronDist 'electron.exe'))) {
  throw 'Electron runtime is missing. Run node node_modules\electron\install.js first.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$releaseRoot = Join-Path $root 'release'
$output = Join-Path $releaseRoot ("win-unpacked-$stamp")
$appDir = Join-Path $output 'resources\app'
New-Item -ItemType Directory -Path $output -Force | Out-Null

Copy-Item -Path (Join-Path $electronDist '*') -Destination $output -Recurse -Force
Rename-Item -LiteralPath (Join-Path $output 'electron.exe') -NewName 'TextDuplicateFinder.exe'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination $appDir
Copy-Item -LiteralPath (Join-Path $root 'package-lock.json') -Destination $appDir
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $appDir
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $appDir
Copy-Item -LiteralPath (Join-Path $root 'src') -Destination $appDir -Recurse

npm ci --omit=dev --ignore-scripts --offline --prefix $appDir

$zipPath = Join-Path $releaseRoot ("TextDuplicateFinder-$stamp.zip")
Compress-Archive -LiteralPath $output -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "APP_DIR=$output"
Write-Output "ZIP=$zipPath"
