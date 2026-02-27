#!/usr/bin/env node
/**
 * Add unsafe emails to PlusVibe blocklist
 * Only blocklists truly dangerous ones: invalid, spamtrap, disposable, disabled
 * Does NOT blocklist catch-all or unknown (those are risky but not harmful to send)
 */

const fs = require('fs');

const PV_API_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_BASE = 'https://api.plusvibe.ai/api/v1';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const RESULTS_DIR = '/opt/smarty-projects/email-verification';

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
  fs.appendFileSync(`${RESULTS_DIR}/verification.log`, `[${ts}] ${msg}\n`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function addToBlocklist(emails) {
  // PlusVibe API rate limit: 5 req/sec, batch in groups of 500
  const BATCH = 500;
  let totalAdded = 0;
  let totalDupes = 0;
  
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    
    const res = await fetch(`${PV_BASE}/blocklist/add/entries`, {
      method: 'POST',
      headers: {
        'x-api-key': PV_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: WORKSPACE_ID,
        entries: batch,
      }),
    });
    
    const data = await res.json();
    
    if (data.status === 'success') {
      totalAdded += data.entries_added || 0;
      totalDupes += data.already_in_blocklist || 0;
      log(`Batch ${Math.floor(i/BATCH)+1}: Added ${data.entries_added}, Already blocked: ${data.already_in_blocklist}`);
    } else {
      log(`ERROR batch ${Math.floor(i/BATCH)+1}: ${JSON.stringify(data)}`);
    }
    
    await sleep(300); // Rate limit
  }
  
  return { totalAdded, totalDupes };
}

async function main() {
  log('=== Adding Unsafe Emails to PlusVibe Blocklist ===');
  
  // Collect all unsafe emails with their statuses from result files
  const resultFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith('results-') && f.endsWith('.json'));
  
  const toBlock = new Set();   // Definitely block: invalid, spamtrap, disposable, disabled
  const catchAll = new Set();  // Catch-all: don't block, but track
  const unknown = new Set();   // Unknown: don't block
  
  for (const file of resultFiles) {
    const data = JSON.parse(fs.readFileSync(`${RESULTS_DIR}/${file}`, 'utf-8'));
    const results = data.results || {};
    
    for (const [email, info] of Object.entries(results)) {
      const status = info.status || 'unknown';
      
      if (['invalid', 'spamtrap', 'disposable', 'disabled', 'inbox_full'].includes(status)) {
        toBlock.add(email);
      } else if (status === 'catch_all') {
        catchAll.add(email);
      } else if (status === 'unknown') {
        unknown.add(email);
      }
      // 'safe' and 'role_account' are fine to send
    }
  }
  
  log(`Emails to BLOCKLIST (invalid/spamtrap/disposable/disabled/inbox_full): ${toBlock.size}`);
  log(`Catch-all emails (not blocking, but tracking): ${catchAll.size}`);
  log(`Unknown emails (not blocking): ${unknown.size}`);
  
  // Save catch-all list for reference
  fs.writeFileSync(`${RESULTS_DIR}/catch-all-emails.csv`, 'email\n' + Array.from(catchAll).join('\n'));
  fs.writeFileSync(`${RESULTS_DIR}/unknown-emails.csv`, 'email\n' + Array.from(unknown).join('\n'));
  fs.writeFileSync(`${RESULTS_DIR}/blocklisted-emails.csv`, 'email\n' + Array.from(toBlock).join('\n'));
  
  if (toBlock.size === 0) {
    log('No emails to block. Done.');
    return;
  }
  
  // Add to PlusVibe blocklist
  const blockArray = Array.from(toBlock);
  log(`Submitting ${blockArray.length} emails to PlusVibe blocklist...`);
  
  const result = await addToBlocklist(blockArray);
  
  log(`\n=== BLOCKLIST COMPLETE ===`);
  log(`Total added to blocklist: ${result.totalAdded}`);
  log(`Already in blocklist: ${result.totalDupes}`);
  log(`Catch-all tracked (not blocked): ${catchAll.size}`);
  log(`Unknown tracked (not blocked): ${unknown.size}`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
