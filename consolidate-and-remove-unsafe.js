#!/usr/bin/env node
/**
 * Step 5-6: Consolidate unsafe emails and remove from PlusVibe
 * - Combine existing unsafe list with new results
 * - Only remove truly unsafe emails (invalid, spamtrap, disposable, disabled, inbox_full)
 * - Keep catch-all and unknown (risky but not unsafe)
 * - Remove from PlusVibe and add to blocklist
 */

const fs = require('fs');
const path = require('path');

const PV_API_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_BASE = 'https://api.plusvibe.ai/api/v1';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const RESULTS_DIR = '/opt/smarty-projects/email-verification';
const PARKED_DIR = '/opt/smarty-projects/parked-leads/reoon-unsafe-feb12';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(RESULTS_DIR, 'removal.log'), line + '\n');
}

async function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

// Load existing unsafe emails
function loadExistingUnsafe() {
  const unsafeFile = path.join(RESULTS_DIR, 'all-unsafe-plusvibe.csv');
  if (!fs.existsSync(unsafeFile)) return new Set();
  
  const content = fs.readFileSync(unsafeFile, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header
  return new Set(lines.map(line => line.split(',')[0].toLowerCase().trim()));
}

// Load new unsafe emails from latest verification
function loadNewUnsafeFromResults() {
  const newUnsafeFile = path.join(RESULTS_DIR, 'unsafe-4752786.csv');
  const newUnsafe = new Set();
  
  if (!fs.existsSync(newUnsafeFile)) return newUnsafe;
  
  const content = fs.readFileSync(newUnsafeFile, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header
  
  for (const line of lines) {
    const [email, status] = line.split(',');
    // Only add truly unsafe statuses, not catch_all or unknown
    if (['invalid', 'spamtrap', 'disposable', 'disabled', 'inbox_full'].includes(status)) {
      newUnsafe.add(email.toLowerCase().trim());
    }
  }
  
  return newUnsafe;
}

// Load email-to-campaigns mapping
function loadEmailMapping() {
  const mappingFile = path.join(RESULTS_DIR, 'email-to-campaigns-feb12.json');
  if (!fs.existsSync(mappingFile)) {
    throw new Error('Email-to-campaigns mapping not found');
  }
  return JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
}

// Remove leads from a campaign
async function removeLeadsFromCampaign(campaignId, emails) {
  if (emails.length === 0) return { success: 0, errors: 0 };
  
  log(`  Removing ${emails.length} leads from campaign ${campaignId}...`);
  
  const res = await fetch(`${PV_BASE}/lead/delete`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': PV_API_KEY 
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      workspace_id: WORKSPACE_ID,
      delete_list: emails
    })
  });
  
  if (!res.ok) {
    log(`  ERROR: ${res.status} ${res.statusText}`);
    return { success: 0, errors: emails.length };
  }
  
  const result = await res.json();
  log(`  Campaign ${campaignId}: ${result.deleted || emails.length} leads removed`);
  
  // Rate limiting
  await sleep(500);
  
  return { success: result.deleted || emails.length, errors: 0 };
}

// Add emails to PlusVibe blocklist
async function addToBlocklist(emails) {
  if (emails.length === 0) return;
  
  log(`Adding ${emails.length} emails to PlusVibe blocklist...`);
  
  const res = await fetch(`${PV_BASE}/blocklist/add/entries`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': PV_API_KEY 
    },
    body: JSON.stringify({
      workspace_id: WORKSPACE_ID,
      entries: emails.map(email => ({ email: email }))
    })
  });
  
  if (!res.ok) {
    log(`ERROR adding to blocklist: ${res.status} ${res.statusText}`);
    return;
  }
  
  const result = await res.json();
  log(`Added ${result.added || emails.length} emails to blocklist`);
}

async function main() {
  log('=== Consolidating and Removing Unsafe Leads ===');
  
  // Load existing and new unsafe emails
  const existingUnsafe = loadExistingUnsafe();
  const newUnsafe = loadNewUnsafeFromResults();
  const emailMapping = loadEmailMapping();
  
  log(`Existing unsafe emails: ${existingUnsafe.size}`);
  log(`New unsafe emails: ${newUnsafe.size}`);
  
  // Combine all unsafe emails
  const allUnsafe = new Set([...existingUnsafe, ...newUnsafe]);
  log(`Total unique unsafe emails: ${allUnsafe.size}`);
  
  // Filter to only emails that exist in our current campaigns
  const unsafeInCampaigns = [];
  const campaignBreakdown = {};
  
  for (const email of allUnsafe) {
    if (emailMapping[email]) {
      unsafeInCampaigns.push(email);
      
      for (const mapping of emailMapping[email]) {
        const cid = mapping.campaign_id;
        if (!campaignBreakdown[cid]) {
          campaignBreakdown[cid] = { 
            name: mapping.campaign_name, 
            emails: [] 
          };
        }
        campaignBreakdown[cid].emails.push(email);
      }
    }
  }
  
  log(`Unsafe emails in current campaigns: ${unsafeInCampaigns.length}`);
  
  // Create parked data directory and save lead data before deletion
  fs.mkdirSync(PARKED_DIR, { recursive: true });
  
  const allLeadsData = JSON.parse(fs.readFileSync(
    path.join(RESULTS_DIR, 'all-leads-with-campaigns-feb12.json'), 'utf-8'
  ));
  
  const parkedLeads = allLeadsData.filter(lead => allUnsafe.has(lead.email));
  fs.writeFileSync(
    path.join(PARKED_DIR, 'parked-unsafe-leads.json'),
    JSON.stringify(parkedLeads, null, 2)
  );
  log(`Parked ${parkedLeads.length} unsafe lead records to: ${PARKED_DIR}`);
  
  // Remove leads from each campaign
  let totalRemoved = 0;
  let totalErrors = 0;
  
  log('\n--- Removing Unsafe Leads Per Campaign ---');
  for (const [campaignId, data] of Object.entries(campaignBreakdown)) {
    const uniqueEmails = [...new Set(data.emails)]; // Deduplicate
    const result = await removeLeadsFromCampaign(campaignId, uniqueEmails);
    
    log(`${data.name} (${campaignId}): ${result.success} removed, ${result.errors} errors`);
    
    totalRemoved += result.success;
    totalErrors += result.errors;
  }
  
  // Add unsafe emails to blocklist
  log('\n--- Adding to Blocklist ---');
  await addToBlocklist(Array.from(allUnsafe));
  
  // Update consolidated unsafe list
  const consolidatedUnsafeFile = path.join(RESULTS_DIR, 'all-unsafe-consolidated-feb12.csv');
  const csvContent = 'email\n' + Array.from(allUnsafe).sort().join('\n');
  fs.writeFileSync(consolidatedUnsafeFile, csvContent);
  log(`Updated consolidated unsafe list: ${consolidatedUnsafeFile}`);
  
  // Final summary
  log('\n=== REMOVAL SUMMARY ===');
  log(`Total unsafe emails identified: ${allUnsafe.size}`);
  log(`Unsafe emails in current campaigns: ${unsafeInCampaigns.length}`);
  log(`Total leads removed from PlusVibe: ${totalRemoved}`);
  log(`Removal errors: ${totalErrors}`);
  log(`Leads parked before deletion: ${parkedLeads.length}`);
  
  log('\n--- Per-Campaign Removal Summary ---');
  for (const [campaignId, data] of Object.entries(campaignBreakdown)) {
    const uniqueEmails = [...new Set(data.emails)];
    log(`${data.name}: ${uniqueEmails.length} leads removed`);
  }
  
  // Calculate remaining credits
  const balanceRes = await fetch('https://emailverifier.reoon.com/api/v1/check-account-balance/?key=process.env.REOON_API_KEY');
  const balanceData = await balanceRes.json();
  const remainingCredits = (balanceData.remaining_daily_credits || 0) + (balanceData.remaining_instant_credits || 0);
  log(`\nRemaining Reoon credits: ${remainingCredits}`);
}

main().catch(e => { 
  log(`FATAL: ${e.message}`); 
  console.error(e);
  process.exit(1); 
});