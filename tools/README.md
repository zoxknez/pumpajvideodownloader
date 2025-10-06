# Tools Directory

This directory contains utility scripts organized by purpose.

## Directory Structure

### `railway/`
Scripts for Railway deployment and monitoring:
- `deploy-railway.ps1` - Deploy application to Railway
- `check-railway-status.ps1` - Check deployment status
- `check-railway-env.ps1` - Verify environment variables
- `monitor-railway.ps1` - Monitor Railway service health
- `railway-add-env-vars.ps1` - Add environment variables
- `test-railway-deploy.ps1` - Test deployment process

### `testing/`
Test scripts for local development:
- `quick-guest-test.ps1` - Quick guest authentication test
- `test-guest-local.ps1` - Full local guest flow test

### `supabase/`
Supabase configuration utilities:
- `get-supabase-key.ps1` - Retrieve Supabase API keys
- `generate-jwt-secret.ps1` - Generate JWT secret for authentication

## Usage

Run scripts from the project root directory:

```powershell
# Example: Deploy to Railway
.\tools\railway\deploy-railway.ps1

# Example: Test guest authentication
.\tools\testing\quick-guest-test.ps1
```

## Notes

- All scripts require PowerShell 5.1+
- Railway scripts require Railway CLI installed
- Supabase scripts require valid Supabase project credentials
