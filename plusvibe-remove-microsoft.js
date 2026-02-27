#!/usr/bin/env node
/**
 * Remove Microsoft-hosted leads from PlusVibe campaigns
 * Reads email-only lists from parked-leads/microsoft-outlook/
 * Uses lead/delete API endpoint
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'process.env.PLUSVIBE_API_KEY';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const BASE = 'https://api.plusvibe.ai/api/v1';

const DRY_RUN = process.argv.includes('--dry-run');

const PARKED_DIR = '/opt/smarty-projects/parked-leads/microsoft-outlook';

// Map CSV names to campaign IDs (East campaigns - where leads currently live)
const CAMPAIGN_MAP = {
  'tech-finance': '6987e237e2259240c66e6013',
  'manufacturing-construction': '6987e238e2259240c66e6014',
  'healthcare-insurance': '6987e238e2259240c66e6015',
  'services-agencies': '6987e23945fba752e310c5ed',
  'retail-hospitality': '6987e23a7d33011e42278325',
  'general-other': '6987e23be2259240c66e6017',
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

async function deleteLeads(campaignId, emails) {
  // Try batch delete first
  const BATCH = 100;
  let deleted = 0;
  let errors = 0;
  
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    
    if (DRY_RUN) {
      deleted += batch.length;
      continue;
    }
    
    const result = await makeRequest('POST', `${BASE}/lead/delete`, {
      api_key: API_KEY,
      workspace_id: WORKSPACE_ID,
      campaign_id: campaignId,
      delete_list: batch
    });
    
    if (result.status === 200 || (result.data && result.data.status === 'success') || (result.data && !result.data.error)) {
      deleted += batch.length;
    } else {
      errors++;
      if (errors <= 3) {
        console.log(`    Error at batch ${i}: ${JSON.stringify(result.data).slice(0, 200)}`);
      }
    }
    
    await sleep(300);
    
    if (i > 0 && (i / BATCH) % 20 === 0) {
      console.log(`    ...${deleted} deleted so far (batch ${i / BATCH}/${Math.ceil(emails.length / BATCH)})`);
    }
  }
  
  return { deleted, errors };
}

async function main() {
  console.log(`=== REMOVE MICROSOFT LEADS FROM PLUSVIBE ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);
  
  let grandTotal = 0;
  
  for (const [campaign, campaignId] of Object.entries(CAMPAIGN_MAP)) {
    const emailFile = path.join(PARKED_DIR, `${campaign}-emails-only.txt`);
    
    if (!fs.existsSync(emailFile)) {
      console.log(`⚠️ ${campaign}: no email list found, skipping`);
      continue;
    }
    
    const emails = fs.readFileSync(emailFile, 'utf-8')
      .split('\n')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));
    
    console.log(`${campaign}: ${emails.length} Microsoft leads to remove from campaign ${campaignId}`);
    
    const result = await deleteLeads(campaignId, emails);
    const status = result.errors === 0 ? '✅' : '⚠️';
    console.log(`  ${status} Deleted: ${result.deleted}, Errors: ${result.errors}\n`);
    
    grandTotal += result.deleted;
  }
  
  console.log(`=== COMPLETE ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`Total Microsoft leads removed: ${grandTotal}`);
  
  if (!DRY_RUN) {
    console.log('\nVerifying campaign lead counts...');
    for (const [campaign, campaignId] of Object.entries(CAMPAIGN_MAP)) {
      const stats = await makeRequest('GET',
        `${BASE}/analytics/campaign/stats?workspace_id=${WORKSPACE_ID}&campaign_id=${campaignId}&start_date=2026-02-10&end_date=2026-02-11`);
      if (stats.data && Array.isArray(stats.data) && stats.data[0]) {
        console.log(`  ${campaign}: ${stats.data[0].lead_count} leads remaining`);
      }
      await sleep(200);
    }
  }
}

main().catch(console.error);
