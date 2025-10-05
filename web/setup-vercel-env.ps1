#!/usr/bin/env pwsh
# Setup Vercel Environment Variables

Write-Host "🔧 Setting up Vercel Environment Variables..." -ForegroundColor Cyan

# Backend API URL
Write-Host "`n1️⃣  Setting NEXT_PUBLIC_API_BASE..." -ForegroundColor Yellow
echo "https://pumpaj-backend-production.up.railway.app" | vercel env add NEXT_PUBLIC_API_BASE production

# Supabase URL
Write-Host "`n2️⃣  Setting NEXT_PUBLIC_SUPABASE_URL..." -ForegroundColor Yellow
echo "https://smzxjnuqfvpzfzmyxpbp.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production

# Supabase Anon Key
Write-Host "`n3️⃣  Setting NEXT_PUBLIC_SUPABASE_ANON_KEY..." -ForegroundColor Yellow
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtenhqbnVxZnZwemZ6bXl4cGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxMTk3NjAsImV4cCI6MjA0MzY5NTc2MH0.wvnLlI-l-C11kVS8j1OW0ZZ-Zl_G7_C-WZCpYVGx19g" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production

Write-Host "`n✅ Done! Now redeploy with: vercel --prod" -ForegroundColor Green
