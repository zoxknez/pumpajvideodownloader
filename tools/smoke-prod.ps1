param(
  [string]$WebUrl = "https://pumpajvideodown.vercel.app",
  [string]$ApiBase = "https://pumpaj-web-production.up.railway.app"
)

function Invoke-SmokeRequest {
  param(
    [string]$Label,
    [string]$Url,
    [string]$Method = "GET",
    [string]$ExpectContains,
    [ScriptBlock]$Validate
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
    if ($ExpectContains) {
      if (-not ($response.Content -like "*${ExpectContains}*")) {
        throw "Expected content to contain '${ExpectContains}'"
      }
    }
    if ($Validate) {
      & $Validate $response
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
$apiRoot = $ApiBase.TrimEnd('/')
$results += Invoke-SmokeRequest -Label "API /" -Url $apiRoot -ExpectContains "Pumpaj API"
$apiHealth = "$apiRoot/health"
$results += Invoke-SmokeRequest -Label "API /health" -Url $apiHealth -Validate {
  param($response)
  $json = $response.Content | ConvertFrom-Json
  if (-not $json.ok) {
    throw "API health did not return ok:true"
  }
}
$apiVersion = "$apiRoot/api/version"
$results += Invoke-SmokeRequest -Label "API /api/version" -Url $apiVersion -Validate {
  param($response)
  $json = $response.Content | ConvertFrom-Json
  if (-not $json.name) {
    throw "API version response missing 'name'"
  }
  if (-not $json.node) {
    throw "API version response missing 'node'"
  }
}

if ($results -contains $false) {
  Write-Error "One or more smoke checks failed."
  exit 1
}

Write-Host "All production smoke checks passed."
