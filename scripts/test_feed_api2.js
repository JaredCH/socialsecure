'use strict';
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/socialmedia';

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
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const admin = await User.findOne({ username: 'admin' }).lean();
  if (!admin) { console.log('No admin user'); process.exit(1); }

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const token = jwt.sign(
    { userId: admin._id.toString(), username: admin.username },
    jwtSecret,
    { expiresIn: '1h' }
  );
  console.log('Generated token for admin');

  await mongoose.disconnect();

  // Test feed API
  const feedRes = await makeRequest({
    hostname: '127.0.0.1', port: 5000,
    path: '/api/news/feed?page=1&limit=20',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });

  console.log('Feed status:', feedRes.status);
  const d = feedRes.data;
  if (d && typeof d === 'object') {
    if (d.error) {
      console.log('Error:', d.error);
    } else {
      const sections = d.sections || {};
      console.log('Sections:', Object.entries(sections).map(([k,v]) => `${k}:${Array.isArray(v)?v.length:0}`).join(', '));
      console.log('Feed count:', (d.feed||[]).length);
      console.log('Total:', d.total);
      console.log('Category:', d.category);
      console.log('Location:', JSON.stringify(d.location));
      if ((d.feed||[]).length > 0) {
        console.log('First article:', d.feed[0].title.substring(0,60), '|cat:', d.feed[0].category);
      }
    }
  } else {
    console.log('Response:', String(d).substring(0, 500));
  }

  // Also test specific category
  const catRes = await makeRequest({
    hostname: '127.0.0.1', port: 5000,
    path: '/api/news/feed?page=1&limit=10&category=gaming',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('\n--- Category=gaming ---');
  const c = catRes.data;
  if (c && typeof c === 'object') {
    console.log('Feed count:', (c.feed||[]).length, 'Total:', c.total);
    if (c.error) console.log('Error:', c.error);
  }
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
