#!/usr/bin/env node
/**
 * Extract all NOT_CONTACTED leads from PlusVibe campaigns
 * and submit to Reoon for verification
 */

const fs = require('fs');
const path = require('path');

const PV_API_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_BASE = 'https://api.plusvibe.ai/api/v1';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const REOON_KEY = 'process.env.REOON_API_KEY';
const REOON_BASE = 'https://emailverifier.reoon.com/api/v1';
const RESULTS_DIR = '/opt/smarty-projects/email-verification';
const BATCH_SIZE = 2000;

const CAMPAIGNS = [
  { id: '6987e237e2259240c66e6013', name: 'Tech & Finance', leads: 8243 },
  { id: '6987e238e2259240c66e6014', name: 'Manufacturing', leads: 5276 },
  { id: '6987e238e2259240c66e6015', name: 'Healthcare', leads: 3554 },
  { id: '6987e23945fba752e310c5ed', name: 'Services', leads: 4655 },
  { id: '6987e23a7d33011e42278325', name: 'Retail', leads: 3668 },
  { id: '6987e23be2259240c66e6017', name: 'General', leads: 27413 },
];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(RESULTS_DIR, 'verification.log'), line + '\n');
}

// Load already verified emails
function loadVerified() {
  const f = path.join(RESULTS_DIR, 'all-verified.json');
  if (fs.existsSync(f)) return new Set(JSON.parse(fs.readFileSync(f, 'utf-8')));
  return new Set();
}

function saveVerified(emails) {
  const existing = loadVerified();
  for (const e of emails) existing.add(e);
  fs.writeFileSync(path.join(RESULTS_DIR, 'all-verified.json'), JSON.stringify(Array.from(existing)));
  return existing.size;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchLeadsPage(campaignId, page, limit) {
  const url = `${PV_BASE}/lead/workspace-leads?workspace_id=${WORKSPACE_ID}&campaign_id=${campaignId}&status=NOT_CONTACTED&limit=${limit}&page=${page}`;
  const res = await fetch(url, { headers: { 'x-api-key': PV_API_KEY } });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function extractAllLeads(campaignId, campaignName) {
  const emails = [];
  let page = 1;
  const limit = 100; // PlusVibe page size
  
  log(`Extracting leads from "${campaignName}" (${campaignId})...`);
  
  while (true) {
    const leads = await fetchLeadsPage(campaignId, page, limit);
    if (leads.length === 0) break;
    
    for (const lead of leads) {
      if (lead.email) emails.push(lead.email.toLowerCase().trim());
    }
    
    if (page % 10 === 0) log(`  Page ${page}: ${emails.length} emails so far...`);
    page++;
    await sleep(250); // Rate limit: 5 req/sec
  }
  
  log(`  Extracted ${emails.length} emails from "${campaignName}"`);
  return emails;
}

async function checkBalance() {
  const res = await fetch(`${REOON_BASE}/check-account-balance/?key=${REOON_KEY}`);
  const data = await res.json();
  return (data.remaining_daily_credits || 0) + (data.remaining_instant_credits || 0);
}

async function submitBulkVerification(emails, taskName) {
  const res = await fetch(`${REOON_BASE}/create-bulk-verification-task/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: taskName.substring(0, 25), emails, key: REOON_KEY }),
  });
  return await res.json();
}

async function pollTask(taskId) {
  const maxWait = 600000;
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${REOON_BASE}/get-result-bulk-verification-task/?key=${REOON_KEY}&task_id=${taskId}`);
    const data = await res.json();
    
    if (data.status === 'completed' && data.results) {
      const results = data.results;
      const emails = Object.keys(results);
      const stats = { safe: 0, invalid: 0, catch_all: 0, role_account: 0, disposable: 0, spamtrap: 0, disabled: 0, inbox_full: 0, unknown: 0, other: 0 };
      const unsafe = [];
      
      for (const email of emails) {
        const r = results[email];
        const st = r.status || 'unknown';
        if (stats.hasOwnProperty(st)) stats[st]++; else stats.other++;
        if (!r.is_safe_to_send) unsafe.push(email);
      }
      
      // Save results
      fs.writeFileSync(path.join(RESULTS_DIR, `results-${taskId}.json`), JSON.stringify(data, null, 2));
      fs.writeFileSync(path.join(RESULTS_DIR, `unsafe-${taskId}.csv`), 'email\n' + unsafe.join('\n'));
      
      log(`  Task ${taskId} COMPLETE: ${emails.length} total | Safe: ${stats.safe} | Invalid: ${stats.invalid} | Catch-all: ${stats.catch_all} | Spamtrap: ${stats.spamtrap} | Unknown: ${stats.unknown}`);
      return { stats, unsafe, total: emails.length };
    }
    
    log(`  Task ${taskId}: ${data.status} - ${data.progress_percentage || 0}%`);
    await sleep(15000);
  }
  
  log(`  Task ${taskId}: TIMED OUT`);
  return null;
}

async function main() {
  log('=== PlusVibe Lead Extraction & Verification ===');
  
  // Check Reoon balance
  let credits = await checkBalance();
  log(`Reoon credits available: ${credits}`);
  
  if (credits < 100) {
    log('Not enough credits. Stopping.');
    return;
  }
  
  const verified = loadVerified();
  log(`Already verified: ${verified.size} emails`);
  
  // Track all unsafe emails across all campaigns
  const allUnsafe = [];
  let totalExtracted = 0;
  let totalVerified = 0;
  let totalSafe = 0;
  let totalUnsafe = 0;
  
  for (const campaign of CAMPAIGNS) {
    log(`\n--- Campaign: ${campaign.name} ---`);
    
    // Extract leads
    const emails = await extractAllLeads(campaign.id, campaign.name);
    totalExtracted += emails.length;
    
    // Filter out already verified
    const toVerify = emails.filter(e => !verified.has(e));
    log(`  ${emails.length} total, ${toVerify.length} need verification`);
    
    if (toVerify.length === 0) {
      log('  All already verified. Skipping.');
      continue;
    }
    
    // Check credits
    credits = await checkBalance();
    if (credits < 10) {
      log('  Out of credits. Stopping.');
      break;
    }
    
    // Submit in batches
    for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
      const batch = toVerify.slice(i, i + BATCH_SIZE);
      
      credits = await checkBalance();
      if (credits < batch.length) {
        log(`  Only ${credits} credits left, need ${batch.length}. Trimming batch.`);
        batch.length = Math.min(batch.length, credits);
      }
      if (batch.length < 10) {
        log('  Batch too small or no credits. Stopping.');
        break;
      }
      
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const taskName = `${campaign.name.substring(0, 15)}-B${batchNum}`;
      log(`  Submitting batch ${batchNum}: ${batch.length} emails...`);
      
      const result = await submitBulkVerification(batch, taskName);
      
      if (result.status === 'success') {
        const verification = await pollTask(result.task_id);
        if (verification) {
          totalVerified += verification.total;
          totalSafe += verification.total - verification.unsafe.length;
          totalUnsafe += verification.unsafe.length;
          allUnsafe.push(...verification.unsafe);
          
          // Track verified
          const count = saveVerified(batch);
          log(`  Running total verified: ${count}`);
        }
      } else {
        log(`  ERROR: ${result.reason || JSON.stringify(result)}`);
        break;
      }
      
      await sleep(2000); // Brief pause between batches
    }
  }
  
  // Save master unsafe list
  const unsafeFile = path.join(RESULTS_DIR, 'all-unsafe-plusvibe.csv');
  fs.writeFileSync(unsafeFile, 'email\n' + allUnsafe.join('\n'));
  
  // Final summary
  log('\n=== FINAL SUMMARY ===');
  log(`Total leads extracted from PlusVibe: ${totalExtracted}`);
  log(`Total newly verified: ${totalVerified}`);
  log(`Total safe: ${totalSafe}`);
  log(`Total unsafe: ${totalUnsafe} (saved to ${unsafeFile})`);
  log(`Credits remaining: ${await checkBalance()}`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
