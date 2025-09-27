param(
  [string]$WebUrl = "https://pumpajvideodown.vercel.app",
  [string]$ApiBase = "https://pumpaj-web-production.up.railway.app"
)

function Invoke-SmokeRequest {
  param(
    [string]$Label,
    [string]$Url,
    [string]$Method = "GET"
  )

  Write-Host "Smoke: $Label"
  Write-Host "  -> $Url"

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Url -ErrorAction Stop
    $status = $response.StatusCode
    if (-not $status) {
      $status = if ($response.BaseResponse) { $response.BaseResponse.StatusCode } else { "(unknown)" }
    }
    Write-Host "  Status: $status"
    if ($response.Content) {
      $preview = ($response.Content | Out-String).Trim()
      if ($preview.Length -gt 200) {
        $preview = $preview.Substring(0, 200) + "..."
      }
      if ($preview) {
        Write-Host "  Content: $preview"
      }
    }
    return $true
  }
  catch {
    Write-Warning "  Error: $($_.Exception.Message)"
    if ($_.Exception.Response -and $_.Exception.Response.Content) {
      Write-Warning (($_.Exception.Response.Content | Out-String).Trim())
    }
    return $false
  }
}

$results = @()
$results += Invoke-SmokeRequest -Label "Web" -Url $WebUrl
$apiHealth = if ($ApiBase.EndsWith('/')) { "$ApiBase" + "health" } else { "$ApiBase/health" }
$results += Invoke-SmokeRequest -Label "API /health" -Url $apiHealth

if ($results -contains $false) {
  Write-Error "One or more smoke checks failed."
  exit 1
}

Write-Host "All production smoke checks passed."
