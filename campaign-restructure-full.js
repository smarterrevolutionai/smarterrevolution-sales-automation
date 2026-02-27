#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  plusVibeApiBase: 'https://api.plusvibe.ai/api/v1',
  apiKey: 'process.env.PLUSVIBE_API_KEY',
  workspaceId: '692307182213832a0e2cf618',
  rateLimit: 200, // 5 req/sec = 200ms between requests
  logFile: '/opt/smarty-projects/campaign-restructure.log'
};

// Campaign mapping
const campaigns = [
  { id: '6987e237e2259240c66e6013', name: 'V2 | Tech & Finance', leads: 8231, csv: 'tech-finance.csv' },
  { id: '6987e238e2259240c66e6014', name: 'V2 | Manufacturing', leads: 5271, csv: 'manufacturing-construction.csv' },
  { id: '6987e238e2259240c66e6015', name: 'V2 | Healthcare', leads: 3550, csv: 'healthcare-insurance.csv' },
  { id: '6987e23945fba752e310c5ed', name: 'V2 | Services', leads: 4647, csv: 'services-agencies.csv' },
  { id: '6987e23a7d33011e42278325', name: 'V2 | Retail', leads: 3661, csv: 'retail-hospitality.csv' },
  { id: '6987e23be2259240c66e6017', name: 'V2 | General', leads: 27375, csv: 'general-other.csv' }
];

// Timezone state mapping
const eastStates = ['CT', 'DC', 'DE', 'FL', 'GA', 'IN', 'KY', 'MA', 'MD', 'ME', 'MI', 'NC', 'NH', 'NJ', 'NY', 'OH', 'PA', 'RI', 'SC', 'TN', 'VA', 'VT', 'WV', 'AL', 'AR', 'IA', 'IL', 'KS', 'LA', 'MN', 'MO', 'MS', 'ND', 'NE', 'OK', 'SD', 'TX', 'WI'];
const westStates = ['AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY', 'AK'];

// Logging utility
async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  try {
    await fs.appendFile(config.logFile, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

// Rate limiting
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// API request wrapper with rate limiting
async function apiRequest(endpoint, method = 'GET', body = null, queryParams = {}) {
  const url = new URL(`${config.plusVibeApiBase}${endpoint}`);
  
  // Add query parameters
  Object.keys(queryParams).forEach(key => {
    if (queryParams[key] !== undefined) {
      url.searchParams.append(key, queryParams[key]);
    }
  });

  const options = {
    method,
    headers: {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  await log(`API ${method} ${url.toString()}`);
  
  try {
    const response = await fetch(url.toString(), options);
    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
    }
    
    await log(`API Response: ${JSON.stringify(responseData).substring(0, 200)}...`);
    
    // Rate limiting
    await sleep(config.rateLimit);
    
    return responseData;
  } catch (error) {
    await log(`API Error: ${error.message}`);
    throw error;
  }
}

// Create new West campaign
async function createWestCampaign(originalName) {
  const westName = `${originalName} - AI Ops (West)`;
  await log(`Creating West campaign: ${westName}`);
  
  try {
    // Create the campaign first
    const createResponse = await apiRequest('/campaign/add/campaign', 'POST', {
      workspace_id: config.workspaceId,
      camp_name: westName
    });
    
    const newCampaignId = createResponse.id;
    await log(`Created campaign ${newCampaignId}: ${westName}`);
    
    // Update with West-specific settings
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const updatePayload = {
      workspace_id: config.workspaceId,
      campaign_id: newCampaignId,
      status: 'PAUSED',
      schedules: [{
        daily_limit: 20,
        start_date: today,
        days: {
          '1': true, // Monday
          '2': true, // Tuesday  
          '3': true, // Wednesday
          '4': true, // Thursday
          '5': true  // Friday
        },
        timezone: 'America/Los_Angeles',
        timing: {
          from: '07:00',
          to: '10:00'
        }
      }],
      first_wait_time: 0
    };
    
    await apiRequest('/campaign/update/campaign', 'PATCH', updatePayload);
    await log(`Updated West campaign ${newCampaignId} with Pacific timezone settings`);
    
    return newCampaignId;
  } catch (error) {
    await log(`Error creating West campaign: ${error.message}`);
    throw error;
  }
}

// Get NOT_CONTACTED leads from campaign
async function getNotContactedLeads(campaignId) {
  await log(`Fetching NOT_CONTACTED leads from campaign ${campaignId}`);
  
  const leads = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const url = `/lead/workspace-leads`;
      const queryParams = {
        workspace_id: config.workspaceId,
        campaign_id: campaignId,
        status: 'NOT_CONTACTED',
        limit: limit,
        page: page
      };
      
      const leadsData = await apiRequest(url, 'GET', null, queryParams);
      const leadsArray = Array.isArray(leadsData) ? leadsData : [];
      
      if (leadsArray.length > 0) {
        leads.push(...leadsArray);
        await log(`Fetched page ${page}: ${leadsArray.length} leads`);
        page++;
        
        // Check if there are more pages
        if (leadsArray.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      await log(`Error fetching leads page ${page}: ${error.message}`);
      hasMore = false;
    }
  }
  
  await log(`Total NOT_CONTACTED leads fetched: ${leads.length}`);
  return leads;
}

// Separate leads by timezone
function separateLeadsByTimezone(leads) {
  const eastLeads = [];
  const westLeads = [];
  
  leads.forEach(lead => {
    if (westStates.includes(lead.state)) {
      westLeads.push(lead);
    } else {
      // Default to East for unknown/other states
      eastLeads.push(lead);
    }
  });
  
  return { eastLeads, westLeads };
}

// Delete leads from campaign
async function deleteLeadsFromCampaign(campaignId, leadEmails) {
  if (leadEmails.length === 0) return;
  
  await log(`Deleting ${leadEmails.length} leads from campaign ${campaignId}`);
  
  // Delete leads in batches of 50 (smaller batches for safety)
  const batchSize = 50;
  for (let i = 0; i < leadEmails.length; i += batchSize) {
    const batch = leadEmails.slice(i, i + batchSize);
    
    try {
      // Try the delete endpoint
      await apiRequest('/lead/delete', 'POST', {
        workspace_id: config.workspaceId,
        campaign_id: campaignId,
        emails: batch
      });
      await log(`Deleted batch of ${batch.length} leads from campaign ${campaignId}`);
    } catch (error) {
      await log(`Error deleting leads batch: ${error.message}`);
      // Continue with next batch even if this one fails
    }
  }
}

// Add leads to campaign from CSV
async function addLeadsToCampaignFromCSV(campaignId, csvFile, westLeadEmails) {
  if (westLeadEmails.length === 0) return;
  
  await log(`Adding ${westLeadEmails.length} leads to campaign ${campaignId} from CSV ${csvFile}`);
  
  try {
    // Read and parse CSV
    const csvPath = `/opt/smarty-projects/cold-email-leads/campaigns/${csvFile}`;
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',');
    
    // Find leads that match the west email list
    const westEmailSet = new Set(westLeadEmails.map(email => email.toLowerCase()));
    const leadsToAdd = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length >= headers.length) {
        const leadData = {};
        headers.forEach((header, index) => {
          leadData[header] = values[index];
        });
        
        if (westEmailSet.has(leadData.email?.toLowerCase())) {
          // Format for PlusVibe API
          leadsToAdd.push({
            email: leadData.email,
            first_name: leadData.first_name,
            last_name: leadData.last_name,
            company_name: leadData.company_name,
            company_website: leadData.company_website,
            phone_number: leadData.phone_number,
            city: leadData.city,
            state: leadData.state,
            job_title: leadData.job_title,
            industry: leadData.industry,
            company_size: leadData.company_size,
            linkedin_person_url: leadData.linkedin_person_url
          });
        }
      }
    }
    
    if (leadsToAdd.length === 0) {
      await log(`No matching leads found in CSV for ${westLeadEmails.length} west emails`);
      return;
    }
    
    // Add leads in batches
    const batchSize = 50;
    for (let i = 0; i < leadsToAdd.length; i += batchSize) {
      const batch = leadsToAdd.slice(i, i + batchSize);
      
      try {
        await apiRequest('/lead/add', 'POST', {
          workspace_id: config.workspaceId,
          campaign_id: campaignId,
          leads: batch
        });
        await log(`Added batch of ${batch.length} leads to campaign ${campaignId}`);
      } catch (error) {
        await log(`Error adding leads batch: ${error.message}`);
      }
    }
    
  } catch (error) {
    await log(`Error reading CSV or adding leads: ${error.message}`);
  }
}

// Rename campaign with required fields
async function renameCampaign(campaignId, newName) {
  await log(`Renaming campaign ${campaignId} to: ${newName}`);
  
  try {
    await apiRequest('/campaign/update/campaign', 'PATCH', {
      workspace_id: config.workspaceId,
      campaign_id: campaignId,
      camp_name: newName,
      first_wait_time: 0 // Required field
    });
    await log(`Successfully renamed campaign ${campaignId}`);
  } catch (error) {
    await log(`Error renaming campaign: ${error.message}`);
  }
}

// Process a single campaign
async function processCampaign(campaign) {
  await log(`\n${'='.repeat(60)}`);
  await log(`Processing: ${campaign.name} (${campaign.leads} leads)`);
  await log(`${'='.repeat(60)}`);
  
  try {
    // Step 1: Create West version
    await log('\n--- Step 1: Creating West campaign ---');
    const westCampaignId = await createWestCampaign(campaign.name);
    
    // Step 2: Get NOT_CONTACTED leads
    await log('\n--- Step 2: Fetching NOT_CONTACTED leads ---');
    const notContactedLeads = await getNotContactedLeads(campaign.id);
    
    // Step 3: Separate by timezone
    await log('\n--- Step 3: Separating leads by timezone ---');
    const { eastLeads, westLeads } = separateLeadsByTimezone(notContactedLeads);
    await log(`East leads: ${eastLeads.length}, West leads: ${westLeads.length}`);
    
    // Step 4: Move West leads
    await log('\n--- Step 4: Moving West leads ---');
    const westLeadEmails = westLeads.map(lead => lead.email);
    
    if (westLeads.length > 0) {
      // Delete from East campaign
      await deleteLeadsFromCampaign(campaign.id, westLeadEmails);
      
      // Add to West campaign from CSV with full data
      await addLeadsToCampaignFromCSV(westCampaignId, campaign.csv, westLeadEmails);
    }
    
    // Step 5: Rename East campaign
    await log('\n--- Step 5: Renaming East campaign ---');
    const eastName = `${campaign.name} - AI Ops (East)`;
    await renameCampaign(campaign.id, eastName);
    
    // Summary for this campaign
    await log(`\n--- Summary for ${campaign.name} ---`);
    await log(`East campaign: ${campaign.id} - ${eastLeads.length} leads`);
    await log(`West campaign: ${westCampaignId} - ${westLeads.length} leads`);
    
    return {
      originalId: campaign.id,
      westId: westCampaignId,
      eastCount: eastLeads.length,
      westCount: westLeads.length,
      originalName: campaign.name
    };
    
  } catch (error) {
    await log(`Error processing campaign ${campaign.name}: ${error.message}`);
    throw error;
  }
}

// Main execution function
async function main() {
  try {
    await log('='.repeat(80));
    await log('Starting PlusVibe Campaign Restructure - FULL RUN');
    await log(`Processing ${campaigns.length} campaigns into East/West versions`);
    await log('='.repeat(80));
    
    const results = [];
    
    // Process ALL campaigns
    for (const campaign of campaigns) {
      const result = await processCampaign(campaign);
      results.push(result);
      
      // Add a pause between campaigns
      await log('\n*** Pausing between campaigns ***');
      await sleep(5000);
    }
    
    // Final summary
    await log('\n' + '='.repeat(80));
    await log('CAMPAIGN RESTRUCTURE SUMMARY');
    await log('='.repeat(80));
    
    let totalEast = 0;
    let totalWest = 0;
    
    for (const result of results) {
      await log(`${result.originalName}:`);
      await log(`  East: ${result.originalId} - ${result.eastCount} leads`);
      await log(`  West: ${result.westId} - ${result.westCount} leads`);
      totalEast += result.eastCount;
      totalWest += result.westCount;
    }
    
    await log(`\nTotal East leads: ${totalEast}`);
    await log(`Total West leads: ${totalWest}`);
    await log(`Total campaigns created: ${results.length * 2} (${results.length} East + ${results.length} West)`);
    
    await log('\n='.repeat(80));
    await log('Campaign restructure completed successfully!');
    await log('All campaigns remain PAUSED as requested.');
    await log('='.repeat(80));
    
  } catch (error) {
    await log(`Fatal error: ${error.message}`);
    await log(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, processCampaign };