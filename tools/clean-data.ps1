Param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

Write-Host "Cleaning dist/ and logs/"
Remove-Item -Recurse -Force .\dist | Out-Null
Remove-Item -Recurse -Force .\server\logs | Out-Null

Write-Host "Cleaning canonical server data (server/data)"
Remove-Item -Recurse -Force .\server\data | Out-Null

Write-Host "Cleaning legacy data (server/server/data)"
Remove-Item -Recurse -Force .\server\server\data | Out-Null

Write-Host "Done."
