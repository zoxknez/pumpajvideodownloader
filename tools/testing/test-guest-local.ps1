$result = Invoke-WebRequest -Method POST -Uri 'http://localhost:5176/auth/guest' -UseBasicParsing
Write-Host "Status: $($result.StatusCode)"
Write-Host "Body: $($result.Content)"
