const https = require('https');

// Test with minimal request body
const requestBody = JSON.stringify({
  url: 'https://example.com'
});

const options = {
  hostname: 'api.firecrawl.dev',
  port: 443,
  path: '/v2/scrape',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer process.env.FIRECRAWL_API_KEY',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody)
  }
};

console.log('Testing minimal request...');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('✅ Success:', parsed.success);
      console.log('📄 Title:', parsed.data?.metadata?.title);
      console.log('📝 Content length:', parsed.data?.markdown?.length);
    } catch (e) {
      console.log('❌ Parse error:', data);
    }
  });
});

req.on('error', (error) => console.error('❌ Request error:', error));
req.write(requestBody);
req.end();