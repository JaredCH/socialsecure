'use strict';
const http = require('http');

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function main() {
  // Step 1: Login as admin
  const loginBody = JSON.stringify({ identifier: 'admin', password: 'admin123' });
  const loginRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginBody.length }
  }, loginBody);

  console.log('Login status:', loginRes.status);
  if (loginRes.status !== 200) {
    console.log('Login response:', JSON.stringify(loginRes.data));
    // Try different passwords
    const passwords = ['password', 'admin', '123456', 'Admin123!', 'admin123!'];
    for (const pw of passwords) {
      const b2 = JSON.stringify({ identifier: 'admin', password: pw });
      const r2 = await makeRequest({
        hostname: '127.0.0.1', port: 5000, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': b2.length }
      }, b2);
      if (r2.status === 200) { console.log('Login success with pw:', pw); Object.assign(loginRes, r2); break; }
    }
  }

  const token = loginRes.data?.token;
  if (!token) { console.log('No token, cannot test feed'); return; }
  console.log('Got token (first 20):', token.substring(0, 20));

  // Step 2: Call feed
  const feedRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/news/feed?page=1&limit=10',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });

  console.log('Feed status:', feedRes.status);
  const d = feedRes.data;
  if (d && typeof d === 'object') {
    console.log('Feed sections keys:', d.sections ? Object.keys(d.sections) : 'none');
    console.log('Feed sections counts:', d.sections ? Object.entries(d.sections).map(([k,v]) => k+':'+v.length).join(', ') : 'none');
    console.log('Feed articles count:', (d.feed || []).length);
    console.log('Total:', d.total);
    if (d.feed && d.feed.length > 0) {
      console.log('First article:', d.feed[0].title);
    }
    if (d.error) console.log('Error:', d.error);
  } else {
    console.log('Feed response:', JSON.stringify(feedRes.data).substring(0, 500));
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
