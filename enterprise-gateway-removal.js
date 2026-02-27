#!/usr/bin/env node
/**
 * Remove enterprise gateway leads from PlusVibe campaigns
 * Uses enterprise-gateway-domains.json to identify domains to remove
 * Parks lead data before deletion
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'process.env.PLUSVIBE_API_KEY';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const BASE = 'https://api.plusvibe.ai/api/v1';

const DRY_RUN = process.argv.includes('--dry-run');
const PARKED_DIR = '/opt/smarty-projects/parked-leads/enterprise-gateway';

// All campaign IDs (East + West)
const CAMPAIGNS = {
  'tech-finance-east': '6987e237e2259240c66e6013',
  'manufacturing-east': '6987e238e2259240c66e6014',
  'healthcare-east': '6987e238e2259240c66e6015',
  'services-east': '6987e23945fba752e310c5ed',
  'retail-east': '6987e23a7d33011e42278325',
  'general-east': '6987e23be2259240c66e6017',
};

function makeRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: { raw: data } }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllLeads(campaignId) {
  const allLeads = [];
  let page = 1;
  const limit = 1000;
  
  while (true) {
    const url = `${BASE}/lead/workspace-leads?api_key=${API_KEY}&workspace_id=${WORKSPACE_ID}&campaign_id=${campaignId}&limit=${limit}&page=${page}`;
    const res = await makeRequest('GET', url);
    
    // API returns array directly, not {data: [...]}
    const leads = Array.isArray(res.data) ? res.data : (res.data.data || []);
    if (res.status !== 200 || leads.length === 0) break;
    
    allLeads.push(...leads);
    console.log(`    Page ${page}: ${leads.length} leads (total: ${allLeads.length})`);
    
    if (leads.length < limit) break;
    page++;
    await sleep(500);
  }
  
  return allLeads;
}

async function deleteLeads(campaignId, emails) {
  const BATCH = 100;
  let deleted = 0;
  let errors = 0;
  
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const url = `${BASE}/lead/delete`;
    
    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would delete batch ${Math.floor(i/BATCH)+1} (${batch.length} leads)`);
      deleted += batch.length;
      continue;
    }
    
    const res = await makeRequest('POST', url, {
      workspace_id: WORKSPACE_ID,
      campaign_id: campaignId,
      delete_list: batch
    });
    
    if (res.status === 200) {
      deleted += batch.length;
      console.log(`    Deleted batch ${Math.floor(i/BATCH)+1}: ${batch.length} leads (total: ${deleted})`);
    } else {
      errors++;
      console.log(`    ERROR batch ${Math.floor(i/BATCH)+1}: ${res.status} — ${JSON.stringify(res.data).substring(0, 200)}`);
    }
    
    await sleep(1000); // Rate limit
  }
  
  return { deleted, errors };
}

async function main() {
  console.log(`\n=== Enterprise Gateway Lead Removal ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  // Load enterprise gateway domains
  const gwFile = '/opt/smarty-projects/parked-leads/enterprise-gateway-domains.json';
  if (!fs.existsSync(gwFile)) {
    console.error('ERROR: enterprise-gateway-domains.json not found!');
    process.exit(1);
  }
  
  const gwData = JSON.parse(fs.readFileSync(gwFile, 'utf8'));
  const gwDomainMap = gwData.gateway_domain_map || {};
  const gwDomains = new Set(Object.keys(gwDomainMap).map(d => d.toLowerCase()));
  console.log(`Loaded ${gwDomains.size} enterprise gateway domains\n`);
  
  // Create parked directory
  if (!fs.existsSync(PARKED_DIR)) fs.mkdirSync(PARKED_DIR, { recursive: true });
  
  const summary = { total_scanned: 0, total_matched: 0, total_deleted: 0, total_errors: 0, by_campaign: {}, by_gateway: {} };
  
  for (const [name, campaignId] of Object.entries(CAMPAIGNS)) {
    console.log(`\n--- Campaign: ${name} (${campaignId}) ---`);
    
    // Fetch all leads
    console.log(`  Fetching leads...`);
    const leads = await fetchAllLeads(campaignId);
    console.log(`  Total leads in campaign: ${leads.length}`);
    summary.total_scanned += leads.length;
    
    // Match enterprise gateway leads
    const matched = [];
    for (const lead of leads) {
      const email = (lead.email || '').toLowerCase();
      const domain = email.split('@')[1];
      if (domain && gwDomains.has(domain)) {
        matched.push({ ...lead, gateway_type: gwDomainMap[domain] || 'UNKNOWN' });
      }
    }
    
    console.log(`  Matched enterprise gateway leads: ${matched.length}`);
    summary.total_matched += matched.length;
    summary.by_campaign[name] = { scanned: leads.length, matched: matched.length, deleted: 0 };
    
    if (matched.length === 0) {
      console.log(`  No enterprise gateway leads found, skipping.`);
      continue;
    }
    
    // Count by gateway type
    for (const lead of matched) {
      const gw = lead.gateway_type;
      summary.by_gateway[gw] = (summary.by_gateway[gw] || 0) + 1;
    }
    
    // Park lead data
    const parkFile = path.join(PARKED_DIR, `${name}-leads.json`);
    fs.writeFileSync(parkFile, JSON.stringify(matched, null, 2));
    console.log(`  Parked ${matched.length} leads to ${parkFile}`);
    
    // Delete from PlusVibe
    const emails = matched.map(l => l.email);
    console.log(`  Deleting ${emails.length} leads from campaign...`);
    const result = await deleteLeads(campaignId, emails);
    summary.total_deleted += result.deleted;
    summary.total_errors += result.errors;
    summary.by_campaign[name].deleted = result.deleted;
    
    await sleep(2000); // Pause between campaigns
  }
  
  // Write summary
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total leads scanned: ${summary.total_scanned}`);
  console.log(`Total enterprise gateway leads found: ${summary.total_matched}`);
  console.log(`Total leads deleted: ${summary.total_deleted}`);
  console.log(`Total errors: ${summary.total_errors}`);
  console.log(`\nBy Campaign:`);
  for (const [name, data] of Object.entries(summary.by_campaign)) {
    console.log(`  ${name}: ${data.scanned} scanned, ${data.matched} matched, ${data.deleted} deleted`);
  }
  console.log(`\nBy Gateway Type:`);
  for (const [gw, count] of Object.entries(summary.by_gateway).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${gw}: ${count} leads`);
  }
  
  // Save summary
  const summaryFile = path.join(PARKED_DIR, 'removal-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  
  // Save manifest
  const manifest = `# Enterprise Gateway Lead Removal\n\nDate: ${new Date().toISOString()}\nMode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n\n## Why\nEnterprise email security gateways (Proofpoint, Mimecast, Barracuda, etc.) aggressively reject cold email,\ncausing bounce rates above 5% threshold.\n\n## What Was Removed\n- ${summary.total_matched} leads across ${Object.keys(summary.by_campaign).length} campaigns\n- All lead data parked in this directory (JSON with full lead records)\n- Recoverable if needed\n\n## By Gateway Type\n${Object.entries(summary.by_gateway).sort((a,b) => b[1] - a[1]).map(([gw, count]) => `- ${gw}: ${count} leads`).join('\n')}\n`;
  fs.writeFileSync(path.join(PARKED_DIR, 'MANIFEST.md'), manifest);
  
  console.log(`\nDone! Summary saved to ${summaryFile}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
