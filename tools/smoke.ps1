param(
  [string]$ApiBase = "http://localhost:5176"
)

Write-Host "Smoke: Health"
$health = Invoke-WebRequest -UseBasicParsing "$ApiBase/health" -ErrorAction SilentlyContinue
$health.Content | Write-Output

Write-Host "Smoke: Metrics"
$metrics = Invoke-WebRequest -UseBasicParsing "$ApiBase/api/jobs/metrics" -ErrorAction SilentlyContinue
$metrics.Content | Write-Output

Write-Host "Smoke: Settings"
$settings = Invoke-WebRequest -UseBasicParsing "$ApiBase/api/jobs/settings" -ErrorAction SilentlyContinue
$settings.Content | Write-Output

Write-Host "Smoke: Cleanup"
$cleanup = Invoke-WebRequest -UseBasicParsing -Method Post "$ApiBase/api/jobs/cleanup-temp" -ErrorAction SilentlyContinue
$cleanup.Content | Write-Output

Write-Host "Done"
