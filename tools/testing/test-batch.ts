/**
 * Smoke test za batch endpoint
 * Usage: tsx tools/testing/test-batch.ts
 */

const BATCH_TEST_BASE_URL = 'http://localhost:5176';

async function testBatch() {
  console.log('🧪 Testing batch endpoint...\n');

  // 1. Register user
  console.log('1️⃣  Registering test user...');
  const registerRes = await fetch(`${BATCH_TEST_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'batch-test@example.com', password: 'test123456', username: 'batch-tester' }),
  });
  
  if (!registerRes.ok) {
    const err = await registerRes.json();
    if (err.error !== 'USER_EXISTS') {
      console.error('❌ Registration failed:', err);
      return;
    }
    console.log('✅ User already exists, continuing...\n');
  } else {
    console.log('✅ User registered\n');
  }

  // 2. Login
  console.log('2️⃣  Logging in...');
  const loginRes = await fetch(`${BATCH_TEST_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'batch-test@example.com', password: 'test123456' }),
  });

  if (!loginRes.ok) {
    console.error('❌ Login failed:', await loginRes.json());
    return;
  }

  const { accessToken } = await loginRes.json();
  console.log('✅ Logged in, token:', accessToken.substring(0, 20) + '...\n');

  // 3. Batch download
  console.log('3️⃣  Creating batch job...');
  const batchRes = await fetch(`${BATCH_TEST_BASE_URL}/api/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      urls: [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
        'https://www.youtube.com/watch?v=9bZkp7q19f0', // PSY - GANGNAM STYLE
      ],
      mode: 'audio',
      audioFormat: 'm4a',
      titleTemplate: 'Test Audio {index}',
    }),
  });

  if (!batchRes.ok) {
    console.error('❌ Batch creation failed:', await batchRes.json());
    return;
  }

  const batch = await batchRes.json();
  console.log('✅ Batch created:', batch.id);
  console.log(`   Jobs: ${batch.items.length} URLs → ${batch.items.map((i: any) => i.jobId).join(', ')}\n`);

  // 4. Poll batch status
  console.log('4️⃣  Polling batch status...');
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

    const statusRes = await fetch(`${BATCH_TEST_BASE_URL}/api/batch/${batch.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!statusRes.ok) {
      console.error('❌ Failed to fetch batch status');
      return;
    }

    const status = await statusRes.json();
    const completed = status.items.filter((i: any) => i.status === 'completed').length;
    const failed = status.items.filter((i: any) => i.status === 'failed').length;
    const queued = status.items.filter((i: any) => i.status === 'queued').length;
    const downloading = status.items.filter((i: any) => i.status === 'downloading').length;

    console.log(`   [${attempts + 1}/${maxAttempts}] Completed: ${completed}, Failed: ${failed}, Queued: ${queued}, Downloading: ${downloading}`);

    if (completed + failed === status.items.length) {
      console.log('\n✅ Batch finished!');
      console.log(`   Final: ${completed} completed, ${failed} failed\n`);
      
      // Show details
      status.items.forEach((item: any, idx: number) => {
        console.log(`   ${idx + 1}. ${item.status.toUpperCase()} - ${item.title || 'untitled'}`);
        if (item.size) console.log(`      Size: ${item.size}`);
      });
      
      return;
    }

    attempts++;
  }

  console.log('\n⚠️  Timeout reached - batch still processing');
}

testBatch().catch(console.error);
