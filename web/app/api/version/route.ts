// Test endpoint to verify deployed version
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    version: 'v1.0.1',
    timestamp: new Date().toISOString(),
    deployment: 'BhTbmFtPVNQcaVYGktZ5zqAJEz4S',
    authFix: 'supabaseChecked-guard-enabled',
    features: {
      supabaseAuth: true,
      sessionPersistence: true,
      backendAuthSkip: true
    },
    message: '✅ Latest version deployed with 401 fix'
  });
}
