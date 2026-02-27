#!/usr/bin/env node

const https = require('https');

const apiKey = 'process.env.FIRECRAWL_API_KEY';
const url = 'https://example.com';

const requestBody = JSON.stringify({
  url: url
});

const options = {
  hostname: 'api.firecrawl.dev',
  port: 443,
  path: '/v2/scrape',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody)
  }
};

console.log('Testing Firecrawl API...');
console.log('URL:', url);

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(requestBody);
req.end();