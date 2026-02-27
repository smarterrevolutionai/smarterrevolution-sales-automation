#!/usr/bin/env node
/**
 * Extract NOT_CONTACTED leads from PlusVibe campaigns and verify via Reoon
 */

const https = require('https');
const fs = require('fs');

const PV_API_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_WORKSPACE = '692307182213832a0e2cf618';
const PV_BASE = 'https://api.plusvibe.ai/api/v1';
const REOON_KEY = 'process.env.REOON_API_KEY';
const REOON_BASE = 'https://emailverifier.reoon.com/api/v1';

const CAMPAIGNS = {
  'tech-finance': '6987e237e2259240c66e6013',
  'manufacturing': '6987e238e2259240c66e6014',
  'healthcare': '6987e238e2259240c66e6015',
  'services': '6987e23945fba752e310c5ed',
  'retail': '6987e23a7d33011e42278325',
  'general': '6987e23be2259240c66e6017',
};

function httpRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { 'x-api-key': PV_API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, data: { raw: d } }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function reoonVerify(email) {
  return new Promise((resolve, reject) => {
    const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${REOON_KEY}&mode=quick`;
    const urlObj = new URL(url);
    const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET' };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve({ status: 'error', error: d }); }
      });
    });
    req.on('error', err => resolve({ status: 'error', error: err.message }));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchNotContactedLeads(campaignId, campaignName) {
  const leads = [];
  let page = 1;
  while (true) {
    const url = `${PV_BASE}/lead/workspace-leads?api_key=${PV_API_KEY}&workspace_id=${PV_WORKSPACE}&campaign_id=${campaignId}&limit=1000&page=${page}`;
    const res = await httpRequest('GET', url);
    const data = Array.isArray(res.data) ? res.data : [];
    if (data.length === 0) break;
    
    for (const l of data) {
      if ((l.status || '').trim() === 'NOT_CONTACTED') {
        leads.push({ email: l.email, campaign: campaignName, campaignId });
      }
    }
    if (data.length < 1000) break;
    page++;
    await sleep(300);
  }
  return leads;
}

async function main() {
  console.log('=== Extract & Verify Remaining PlusVibe Leads ===');
  console.log('Time:', new Date().toISOString());
  
  // Step 1: Extract NOT_CONTACTED leads
  console.log('\n--- Step 1: Extracting NOT_CONTACTED leads ---');
  let allLeads = [];
  for (const [name, id] of Object.entries(CAMPAIGNS)) {
    const leads = await fetchNotContactedLeads(id, name);
    console.log(`  ${name}: ${leads.length} NOT_CONTACTED leads`);
    allLeads.push(...leads);
  }
  console.log(`Total NOT_CONTACTED: ${allLeads.length}`);
  
  // Deduplicate by email
  const uniqueEmails = [...new Set(allLeads.map(l => l.email.toLowerCase()))];
  console.log(`Unique emails to verify: ${uniqueEmails.length}`);
  
  // Save extraction
  fs.writeFileSync('/opt/smarty-projects/email-verification/remaining-leads-2026-02-12.csv',
    'email\n' + uniqueEmails.join('\n'));
  
  // Step 2: Verify via Reoon (batch of 5 concurrent)
  console.log('\n--- Step 2: Verifying via Reoon ---');
  const results = {};
  const BATCH = 5;
  let verified = 0;
  
  for (let i = 0; i < uniqueEmails.length; i += BATCH) {
    const batch = uniqueEmails.slice(i, i + BATCH);
    const promises = batch.map(email => reoonVerify(email).then(r => ({ email, result: r })));
    const batchResults = await Promise.all(promises);
    
    for (const { email, result } of batchResults) {
      results[email] = {
        status: result.status || 'unknown',
        is_valid: result.is_valid_format,
        is_disposable: result.is_disposable,
        is_role_account: result.is_role_account,
        mx_accepts_mail: result.mx_accepts_mail,
        result: result.status || 'unknown'
      };
    }
    
    verified += batch.length;
    if (verified % 100 === 0 || verified === uniqueEmails.length) {
      console.log(`  Verified: ${verified}/${uniqueEmails.length}`);
    }
    
    await sleep(200); // Rate limit
  }
  
  // Step 3: Categorize results
  console.log('\n--- Step 3: Categorizing results ---');
  const categories = {};
  const unsafe = [];
  
  for (const [email, r] of Object.entries(results)) {
    const cat = r.status || 'unknown';
    categories[cat] = (categories[cat] || 0) + 1;
    
    // Mark as unsafe: invalid, disposable, or explicitly bad
    if (['invalid', 'disposable'].includes(cat) || r.is_disposable === true) {
      unsafe.push(email);
    }
  }
  
  console.log('Results breakdown:');
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nUnsafe emails to remove: ${unsafe.length}`);
  
  // Save results
  fs.writeFileSync('/opt/smarty-projects/email-verification/reoon-results-2026-02-12.json',
    JSON.stringify({ timestamp: new Date().toISOString(), total: uniqueEmails.length, categories, results }, null, 2));
  
  // Save unsafe list
  fs.writeFileSync('/opt/smarty-projects/email-verification/unsafe-remaining-2026-02-12.csv',
    'email\n' + unsafe.join('\n'));
  
  // Step 4: Remove unsafe leads from PlusVibe
  if (unsafe.length > 0) {
    console.log('\n--- Step 4: Removing unsafe leads from PlusVibe ---');
    
    // Create park directory
    const parkDir = '/opt/smarty-projects/parked-leads/reoon-unsafe';
    if (!fs.existsSync(parkDir)) fs.mkdirSync(parkDir, { recursive: true });
    
    // Group unsafe by campaign
    const unsafeSet = new Set(unsafe);
    for (const [name, id] of Object.entries(CAMPAIGNS)) {
      const campaignUnsafe = allLeads.filter(l => l.campaignId === id && unsafeSet.has(l.email.toLowerCase()));
      if (campaignUnsafe.length === 0) continue;
      
      // Park data
      fs.writeFileSync(`${parkDir}/${name}-leads.json`, JSON.stringify(campaignUnsafe, null, 2));
      
      // Delete from PlusVibe in batches
      const emails = campaignUnsafe.map(l => l.email);
      const DBATCH = 100;
      let deleted = 0;
      for (let i = 0; i < emails.length; i += DBATCH) {
        const batch = emails.slice(i, i + DBATCH);
        const res = await httpRequest('POST', `${PV_BASE}/lead/delete`, {
          workspace_id: PV_WORKSPACE,
          campaign_id: id,
          delete_list: batch
        });
        if (res.status === 200) deleted += batch.length;
        await sleep(500);
      }
      console.log(`  ${name}: removed ${deleted}/${campaignUnsafe.length} unsafe leads`);
    }
    
    // Manifest
    fs.writeFileSync(`${parkDir}/MANIFEST.md`,
      `# Reoon Unsafe Lead Removal\nDate: ${new Date().toISOString()}\nTotal removed: ${unsafe.length}\nReason: Invalid/disposable emails causing bounces\n`);
  }
  
  console.log('\n=== DONE ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
