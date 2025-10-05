#!/usr/bin/env bash
# Pumpaj Video Downloader - Release Smoke Test
# Usage: BASE_URL="https://api.domain.com" TOKEN="jwt..." YT_URL="https://youtube.com/watch?v=..." ./release-smoke.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Config
BASE_URL="${BASE_URL:-http://localhost:5176}"
TOKEN="${TOKEN:-}"
YT_URL="${YT_URL:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}"

echo -e "${YELLOW}🔥 Pumpaj Release Smoke Test${NC}"
echo -e "Base URL: ${BASE_URL}"
echo -e "Token: ${TOKEN:0:20}..."
echo ""

# Test 1: Health check
echo -e "${YELLOW}[1/6] Health check...${NC}"
HEALTH=$(curl -s -w "\n%{http_code}" "${BASE_URL}/health" | tail -1)
if [ "$HEALTH" == "200" ]; then
  echo -e "${GREEN}✅ Health OK${NC}"
else
  echo -e "${RED}❌ Health FAILED (HTTP $HEALTH)${NC}"
  exit 1
fi

# Test 2: Version info
echo -e "${YELLOW}[2/6] Version info...${NC}"
VERSION=$(curl -s "${BASE_URL}/api/version" | jq -r '.version // "unknown"')
if [ "$VERSION" != "unknown" ]; then
  echo -e "${GREEN}✅ Version: $VERSION${NC}"
else
  echo -e "${RED}❌ Version FAILED${NC}"
  exit 1
fi

# Test 3: Metrics (with auth)
echo -e "${YELLOW}[3/6] Metrics (auth required)...${NC}"
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Skipped (no token)${NC}"
else
  METRICS_STATUS=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/jobs/metrics")
  if [ "$METRICS_STATUS" == "200" ]; then
    echo -e "${GREEN}✅ Metrics OK${NC}"
  else
    echo -e "${RED}❌ Metrics FAILED (HTTP $METRICS_STATUS)${NC}"
  fi
fi

# Test 4: Analyze URL
echo -e "${YELLOW}[4/6] Analyze URL...${NC}"
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Skipped (no token)${NC}"
else
  ANALYZE_STATUS=$(curl -s -w "%{http_code}" -o /tmp/analyze.json \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$YT_URL\"}" \
    "${BASE_URL}/api/analyze")
  
  if [ "$ANALYZE_STATUS" == "200" ]; then
    TITLE=$(jq -r '.title // "unknown"' /tmp/analyze.json)
    echo -e "${GREEN}✅ Analyze OK: $TITLE${NC}"
  else
    echo -e "${RED}❌ Analyze FAILED (HTTP $ANALYZE_STATUS)${NC}"
    cat /tmp/analyze.json
  fi
fi

# Test 5: History
echo -e "${YELLOW}[5/6] History...${NC}"
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Skipped (no token)${NC}"
else
  HISTORY_STATUS=$(curl -s -w "%{http_code}" -o /tmp/history.json \
    -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/history")
  
  if [ "$HISTORY_STATUS" == "200" ]; then
    COUNT=$(jq 'length' /tmp/history.json)
    echo -e "${GREEN}✅ History OK ($COUNT entries)${NC}"
  else
    echo -e "${RED}❌ History FAILED (HTTP $HISTORY_STATUS)${NC}"
  fi
fi

# Test 6: CORS preflight
echo -e "${YELLOW}[6/6] CORS preflight...${NC}"
CORS_ORIGIN=$(curl -s -I -X OPTIONS \
  -H "Origin: https://pumpajvideodl.com" \
  -H "Access-Control-Request-Method: POST" \
  "${BASE_URL}/api/analyze" | grep -i "access-control-allow-origin" | cut -d' ' -f2 | tr -d '\r\n')

if [ -n "$CORS_ORIGIN" ]; then
  echo -e "${GREEN}✅ CORS OK: $CORS_ORIGIN${NC}"
else
  echo -e "${RED}❌ CORS FAILED (no Access-Control-Allow-Origin header)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Smoke test complete!${NC}"
