#!/usr/bin/env node
/**
 * PlusVibe Lead Migration - Move Western leads from East to West campaigns
 * 
 * Strategy: Since PlusVibe API only returns ~1000 leads per call,
 * we use a different approach:
 * 1. Read source CSVs to identify Western state emails
 * 2. Use lead/add endpoint to add those emails to West campaigns
 * 3. Use lead/delete to remove them from East campaigns
 * 
 * Note: We only move NOT_CONTACTED leads. Already contacted/bounced stay in East.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'process.env.PLUSVIBE_API_KEY';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const BASE = 'https://api.plusvibe.ai/api/v1';

const DRY_RUN = process.argv.includes('--dry-run');

// State to timezone mapping
const WEST_STATES = new Set([
  // Pacific
  'CA','WA','OR','NV','AK','HI',
  // Mountain
  'AZ','CO','ID','MT','NM','UT','WY'
]);

const CAMPAIGN_PAIRS = [
  {
    name: 'Tech & Finance',
    eastId: '6987e237e2259240c66e6013',
    westId: '698b92d56a4ee295b26b7530',
    csv: 'tech-finance.csv'
  },
  {
    name: 'Manufacturing',
    eastId: '6987e238e2259240c66e6014',
    westId: '698b92dc2f024992a17bec3a',
    csv: 'manufacturing-construction.csv'
  },
  {
    name: 'Healthcare',
    eastId: '6987e238e2259240c66e6015',
    westId: '698b92dcf229fa501f77522f',
    csv: 'healthcare-insurance.csv'
  },
  {
    name: 'Services',
    eastId: '6987e23945fba752e310c5ed',
    westId: '698b92dd1bbf7e16c9685cb4',
    csv: 'services-agencies.csv'
  },
  {
    name: 'Retail',
    eastId: '6987e23a7d33011e42278325',
    westId: '698b92de6a4ee295b26b753f',
    csv: 'retail-hospitality.csv'
  },
  {
    name: 'General',
    eastId: '6987e23be2259240c66e6017',
    westId: '698b92df113e12e2090f528f',
    csv: 'general-other.csv'
  }
];

const CSV_DIR = '/opt/smarty-projects/cold-email-leads/campaigns';
const DOMAIN_MAP_FILE = '/opt/smarty-projects/parked-leads/domain-esp-map.txt';

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return [];
  
  // Parse header
  const header = parseCSVLine(lines[0]);
  const emailIdx = header.findIndex(h => h.toLowerCase() === 'email');
  const stateIdx = header.findIndex(h => h.toLowerCase() === 'state');
  const firstNameIdx = header.findIndex(h => h.toLowerCase().includes('first') && h.toLowerCase().includes('name'));
  const lastNameIdx = header.findIndex(h => h.toLowerCase().includes('last') && h.toLowerCase().includes('name'));
  const companyIdx = header.findIndex(h => h.toLowerCase().includes('company') && h.toLowerCase().includes('name'));
  
  if (emailIdx === -1) {
    console.error('No email column found in CSV');
    return [];
  }
  
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    const email = fields[emailIdx]?.trim()?.toLowerCase();
    const state = stateIdx >= 0 ? fields[stateIdx]?.trim()?.toUpperCase() : '';
    if (email && state) {
      results.push({
        email,
        state,
        first_name: firstNameIdx >= 0 ? fields[firstNameIdx]?.trim() : '',
        last_name: lastNameIdx >= 0 ? fields[lastNameIdx]?.trim() : '',
        company_name: companyIdx >= 0 ? fields[companyIdx]?.trim() : ''
      });
    }
  }
  return results;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function loadDomainMap() {
  const content = fs.readFileSync(DOMAIN_MAP_FILE, 'utf-8');
  const map = {};
  for (const line of content.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) map[parts[0].toLowerCase()] = parts[1];
  }
  return map;
}

function makeRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function addLeadsToCampaign(campaignId, leads, batchSize = 100) {
  let total = 0;
  let errors = 0;
  
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize).map(l => ({
      email: l.email,
      first_name: l.first_name || '',
      last_name: l.last_name || '',
      company_name: l.company_name || ''
    }));
    
    if (DRY_RUN) {
      total += batch.length;
      continue;
    }
    
    const result = await makeRequest('POST', `${BASE}/lead/add`, {
      api_key: API_KEY,
      workspace_id: WORKSPACE_ID,
      campaign_id: campaignId,
      leads: batch
    });
    
    if (result.error || result.message?.includes('error')) {
      console.error(`    Error adding batch ${i}-${i+batch.length}: ${JSON.stringify(result).slice(0, 200)}`);
      errors++;
    } else {
      total += batch.length;
    }
    
    await sleep(500); // Rate limit
    
    if ((i / batchSize) % 10 === 0 && i > 0) {
      process.stdout.write(`    ...${total} leads added so far\n`);
    }
  }
  
  return { total, errors };
}

async function deleteLeadsFromCampaign(campaignId, emails, batchSize = 100) {
  let total = 0;
  let errors = 0;
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    if (DRY_RUN) {
      total += batch.length;
      continue;
    }
    
    const result = await makeRequest('POST', `${BASE}/lead/delete`, {
      api_key: API_KEY,
      workspace_id: WORKSPACE_ID,
      campaign_id: campaignId,
      delete_list: batch
    });
    
    if (result.error || (result.message && result.message.includes('error'))) {
      console.error(`    Error deleting batch ${i}-${i+batch.length}: ${JSON.stringify(result).slice(0, 200)}`);
      errors++;
    } else {
      total += batch.length;
    }
    
    await sleep(300);
    
    if ((i / batchSize) % 10 === 0 && i > 0) {
      process.stdout.write(`    ...${total} leads deleted so far\n`);
    }
  }
  
  return { total, errors };
}

async function getContactedEmails(campaignId) {
  // Get already contacted/bounced/replied leads so we DON'T move them
  const contacted = new Set();
  
  for (const status of ['CONTACTED', 'BOUNCED', 'REPLIED']) {
    const result = await makeRequest('GET', 
      `${BASE}/lead/workspace-leads?api_key=${API_KEY}&workspace_id=${WORKSPACE_ID}&campaign_id=${campaignId}&status=${status}&limit=1000`);
    if (Array.isArray(result)) {
      for (const lead of result) {
        contacted.add(lead.email?.toLowerCase());
      }
    }
    await sleep(300);
  }
  
  return contacted;
}

async function main() {
  console.log(`=== PLUSVIBE LEAD MIGRATION ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);
  
  // Load domain map to filter out Microsoft leads (already removed from PlusVibe)
  console.log('Loading domain ESP map...');
  const domainMap = loadDomainMap();
  console.log(`  ${Object.keys(domainMap).length} domains loaded\n`);
  
  let grandTotalAdded = 0;
  let grandTotalDeleted = 0;
  
  for (const pair of CAMPAIGN_PAIRS) {
    console.log(`\n--- ${pair.name} ---`);
    
    // 1. Read CSV to find Western leads
    const csvPath = path.join(CSV_DIR, pair.csv);
    if (!fs.existsSync(csvPath)) {
      console.log(`  ⚠️ CSV not found: ${csvPath} - skipping`);
      continue;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const allLeads = parseCSV(csvContent);
    
    // Filter: only Western leads that are NOT Microsoft (since MS leads already removed from PlusVibe)
    const westLeads = allLeads.filter(l => {
      if (!WEST_STATES.has(l.state)) return false;
      const domain = l.email.split('@')[1]?.toLowerCase();
      const esp = domainMap[domain] || 'OTHER';
      return esp !== 'MICROSOFT';
    });
    
    const totalNonMs = allLeads.filter(l => {
      const domain = l.email.split('@')[1]?.toLowerCase();
      return (domainMap[domain] || 'OTHER') !== 'MICROSOFT';
    }).length;
    
    console.log(`  CSV: ${allLeads.length} total, ${totalNonMs} non-Microsoft, ${westLeads.length} Western+non-MS to move`);
    
    if (westLeads.length === 0) {
      console.log(`  No Western leads to move`);
      continue;
    }
    
    // 2. Get already contacted leads from East (don't move these)
    console.log(`  Checking contacted leads in East...`);
    const contacted = await getContactedEmails(pair.eastId);
    console.log(`  ${contacted.size} leads already contacted/bounced/replied (will stay in East)`);
    
    // Filter out contacted leads
    const toMove = westLeads.filter(l => !contacted.has(l.email.toLowerCase()));
    console.log(`  ${toMove.length} Western NOT_CONTACTED leads to migrate`);
    
    if (toMove.length === 0) {
      console.log(`  Nothing to move`);
      continue;
    }
    
    // 3. Add to West campaign
    console.log(`  Adding ${toMove.length} leads to West campaign...`);
    const addResult = await addLeadsToCampaign(pair.westId, toMove);
    console.log(`  ✅ Added: ${addResult.total} leads (${addResult.errors} errors)`);
    grandTotalAdded += addResult.total;
    
    // 4. Delete from East campaign
    const emailsToDelete = toMove.map(l => l.email);
    console.log(`  Removing ${emailsToDelete.length} leads from East campaign...`);
    const delResult = await deleteLeadsFromCampaign(pair.eastId, emailsToDelete);
    console.log(`  ✅ Deleted: ${delResult.total} leads (${delResult.errors} errors)`);
    grandTotalDeleted += delResult.total;
  }
  
  console.log(`\n=== MIGRATION COMPLETE ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`Total added to West campaigns: ${grandTotalAdded}`);
  console.log(`Total removed from East campaigns: ${grandTotalDeleted}`);
}

main().catch(console.error);
