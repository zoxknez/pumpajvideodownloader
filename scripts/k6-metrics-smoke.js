// k6 smoke test for Pumpaj API
// Usage: k6 run k6-metrics-smoke.js -e BASE_URL=https://api.domain.com -e TOKEN=jwt...

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5, // 5 virtual users
  duration: '30s', // Run for 30 seconds
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should complete within 500ms
    http_req_failed: ['rate<0.1'], // Less than 10% of requests should fail
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5176';
const TOKEN = __ENV.TOKEN || '';
const YT_URL = __ENV.YT_URL || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

export default function () {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Test 1: Health check (no auth)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response has OK': (r) => r.body.includes('ok') || r.body.includes('OK'),
  });

  sleep(0.5);

  // Test 2: Version info (no auth)
  const versionRes = http.get(`${BASE_URL}/api/version`);
  check(versionRes, {
    'version status is 200': (r) => r.status === 200,
    'version has name': (r) => r.json('name') !== undefined,
  });

  sleep(0.5);

  if (TOKEN) {
    // Test 3: Metrics (auth required)
    const metricsRes = http.get(`${BASE_URL}/api/jobs/metrics`, { headers });
    check(metricsRes, {
      'metrics status is 200': (r) => r.status === 200,
      'metrics has totalJobs': (r) => r.json('totalJobs') !== undefined,
    });

    sleep(0.5);

    // Test 4: History (auth required)
    const historyRes = http.get(`${BASE_URL}/api/history`, { headers });
    check(historyRes, {
      'history status is 200': (r) => r.status === 200,
      'history is array': (r) => Array.isArray(r.json()),
    });

    sleep(1);

    // Test 5: Analyze (auth required, heavier)
    const analyzeRes = http.post(
      `${BASE_URL}/api/analyze`,
      JSON.stringify({ url: YT_URL }),
      { headers }
    );
    check(analyzeRes, {
      'analyze status is 200': (r) => r.status === 200,
      'analyze has title': (r) => r.json('title') !== undefined,
      'analyze has formats': (r) => Array.isArray(r.json('formats')),
    });

    sleep(2);
  } else {
    console.warn('⚠️  No TOKEN provided, skipping authenticated endpoints');
    sleep(2);
  }
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'summary.json': JSON.stringify(data),
  };
}
