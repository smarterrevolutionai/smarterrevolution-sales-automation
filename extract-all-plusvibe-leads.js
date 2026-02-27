#!/usr/bin/env node
/**
 * Extract ALL leads from all 12 PlusVibe campaigns (East + West)
 * Do NOT use status filter - it returns empty results
 */

const fs = require('fs');
const path = require('path');

const PV_API_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_BASE = 'https://api.plusvibe.ai/api/v1';
const WORKSPACE_ID = '692307182213832a0e2cf618';
const RESULTS_DIR = '/opt/smarty-projects/email-verification';

// All 12 campaign IDs as specified
const CAMPAIGNS = [
  // East campaigns
  { id: '6987e237e2259240c66e6013', name: 'East-1' },
  { id: '6987e238e2259240c66e6014', name: 'East-2' },
  { id: '6987e238e2259240c66e6015', name: 'East-3' },
  { id: '6987e23945fba752e310c5ed', name: 'East-4' },
  { id: '6987e23a7d33011e42278325', name: 'East-5' },
  { id: '6987e23be2259240c66e6017', name: 'East-6' },
  
  // West campaigns
  { id: '698b92d56a4ee295b26b7530', name: 'West-1' },
  { id: '698b92dc2f024992a17bec3a', name: 'West-2' },
  { id: '698b92dcf229fa501f77522f', name: 'West-3' },
  { id: '698b92dd1bbf7e16c9685cb4', name: 'West-4' },
  { id: '698b92de6a4ee295b26b753f', name: 'West-5' },
  { id: '698b92df113e12e2090f528f', name: 'West-6' }
];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(RESULTS_DIR, 'extraction.log'), line + '\n');
}

async function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

async function fetchLeadsPage(campaignId, page, limit) {
  // Do NOT include status parameter - it returns empty results
  const url = `${PV_BASE}/lead/workspace-leads?api_key=${PV_API_KEY}&workspace_id=${WORKSPACE_ID}&campaign_id=${campaignId}&limit=${limit}&page=${page}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API call failed: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  // Response is a direct array, not {data: [...]}
  return Array.isArray(data) ? data : [];
}

async function extractCampaignLeads(campaignId, campaignName) {
  const leads = [];
  let page = 1;
  const limit = 1000; // Use max limit per task requirements
  
  log(`Extracting leads from "${campaignName}" (${campaignId})...`);
  
  while (true) {
    const pageLeads = await fetchLeadsPage(campaignId, page, limit);
    if (pageLeads.length === 0) {
      log(`  Page ${page}: Empty response, finished extraction`);
      break;
    }
    
    // Store full lead data for campaign mapping
    for (const lead of pageLeads) {
      if (lead.email) {
        leads.push({
          email: lead.email.toLowerCase().trim(),
          campaign_id: campaignId,
          campaign_name: campaignName,
          lead_id: lead.id || lead._id,
          full_data: lead
        });
      }
    }
    
    log(`  Page ${page}: Found ${pageLeads.length} leads (${leads.length} total so far)`);
    page++;
    
    // Rate limiting - 4 requests per second max
    await sleep(250);
  }
  
  log(`  Extracted ${leads.length} leads from "${campaignName}"`);
  return leads;
}

async function main() {
  log('=== PlusVibe Lead Extraction - All 12 Campaigns ===');
  
  const allLeads = [];
  let totalExtracted = 0;
  
  for (const campaign of CAMPAIGNS) {
    try {
      const campaignLeads = await extractCampaignLeads(campaign.id, campaign.name);
      allLeads.push(...campaignLeads);
      totalExtracted += campaignLeads.length;
      
      log(`Campaign "${campaign.name}": ${campaignLeads.length} leads extracted`);
      
      // Brief pause between campaigns
      await sleep(1000);
      
    } catch (error) {
      log(`ERROR extracting from "${campaign.name}": ${error.message}`);
      continue;
    }
  }
  
  // Save full dataset with campaign mapping
  const fullDataPath = path.join(RESULTS_DIR, 'all-leads-with-campaigns-feb12.json');
  fs.writeFileSync(fullDataPath, JSON.stringify(allLeads, null, 2));
  log(`Saved full lead dataset to: ${fullDataPath}`);
  
  // Create deduplicated email list for Reoon verification
  const uniqueEmails = [...new Set(allLeads.map(lead => lead.email))];
  const csvContent = 'email\n' + uniqueEmails.join('\n');
  const csvPath = path.join(RESULTS_DIR, 'reoon-input-feb12.csv');
  fs.writeFileSync(csvPath, csvContent);
  
  // Create campaign mapping for later processing
  const emailToCampaigns = {};
  for (const lead of allLeads) {
    if (!emailToCampaigns[lead.email]) {
      emailToCampaigns[lead.email] = [];
    }
    emailToCampaigns[lead.email].push({
      campaign_id: lead.campaign_id,
      campaign_name: lead.campaign_name,
      lead_id: lead.lead_id
    });
  }
  
  const mappingPath = path.join(RESULTS_DIR, 'email-to-campaigns-feb12.json');
  fs.writeFileSync(mappingPath, JSON.stringify(emailToCampaigns, null, 2));
  
  // Final summary
  log('\n=== EXTRACTION SUMMARY ===');
  log(`Total leads extracted: ${totalExtracted}`);
  log(`Unique emails for verification: ${uniqueEmails.length}`);
  log(`CSV file for Reoon: ${csvPath}`);
  log(`Campaign mapping: ${mappingPath}`);
  log(`Full dataset: ${fullDataPath}`);
  
  // Per-campaign breakdown
  log('\n--- Per-Campaign Breakdown ---');
  for (const campaign of CAMPAIGNS) {
    const count = allLeads.filter(lead => lead.campaign_id === campaign.id).length;
    log(`${campaign.name} (${campaign.id}): ${count} leads`);
  }
}

main().catch(e => { 
  log(`FATAL: ${e.message}`); 
  console.error(e);
  process.exit(1); 
});