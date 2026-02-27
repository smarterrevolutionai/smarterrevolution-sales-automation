#!/usr/bin/env node

/**
 * PlusVibe Campaign Restructure Script v2
 * Fixes state lookup issue by using source CSVs for state data
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
    API_BASE: 'https://api.plusvibe.ai/api/v1',
    API_KEY: 'process.env.PLUSVIBE_API_KEY',
    WORKSPACE_ID: '692307182213832a0e2cf618',
    CSV_DIR: '/opt/smarty-projects/cold-email-leads/campaigns',
    RATE_LIMIT_MS: 200, // 5 req/sec = 200ms between calls
    LOG_FILE: '/opt/smarty-projects/campaign-restructure-v2.log'
};

// Campaign definitions
const CAMPAIGNS = [
    {
        name: 'V2 | Tech & Finance',
        id: '6987e237e2259240c66e6013',
        csv: 'tech-finance.csv',
        westName: 'V2 | Tech & Finance (West)'
    },
    {
        name: 'V2 | Manufacturing',
        id: '6987e238e2259240c66e6014',
        csv: 'manufacturing-construction.csv',
        westName: 'V2 | Manufacturing (West)'
    },
    {
        name: 'V2 | Healthcare',
        id: '6987e238e2259240c66e6015',
        csv: 'healthcare-insurance.csv',
        westName: 'V2 | Healthcare (West)'
    },
    {
        name: 'V2 | Services',
        id: '6987e23945fba752e310c5ed',
        csv: 'services-agencies.csv',
        westName: 'V2 | Services (West)'
    },
    {
        name: 'V2 | Retail',
        id: '6987e23a7d33011e42278325',
        csv: 'retail-hospitality.csv',
        westName: 'V2 | Retail (West)',
        westId: '698b8ebd113e12e2090f4dc7' // Already exists
    },
    {
        name: 'V2 | General',
        id: '6987e23be2259240c66e6017',
        csv: 'general-other.csv',
        westName: 'V2 | General (West)'
    }
];

// West timezone states (Pacific + Mountain)
const WEST_STATES = new Set(['AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY', 'AK']);

// Logging function
function log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage);
    
    try {
        fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n');
    } catch (err) {
        console.error('Failed to write to log file:', err);
    }
    
    if (isError) {
        console.error(message);
    }
}

// Rate limiting helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP request helper
function makeRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(CONFIG.API_BASE + endpoint);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'x-api-key': CONFIG.API_KEY,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (err) {
                    resolve({ body, status: res.statusCode });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Parse CSV line properly handling quoted fields
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i += 2;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
}

// Parse CSV file and return email-to-lead mapping
function parseCsv(csvPath) {
    log(`Parsing CSV: ${csvPath}`);
    
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = parseCsvLine(lines[0]).map(h => h.trim());
    
    const emailToLead = new Map();
    
    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCsvLine(lines[i]);
            const lead = {};
            
            headers.forEach((header, index) => {
                lead[header] = values[index] || '';
            });
            
            if (lead.email) {
                emailToLead.set(lead.email, lead);
            }
        } catch (error) {
            log(`Error parsing line ${i + 1}: ${error.message}`, true);
        }
    }
    
    log(`Parsed ${emailToLead.size} leads from ${csvPath}`);
    return emailToLead;
}

// Classify leads by timezone
function classifyLeads(emailToLead) {
    const eastLeads = new Map();
    const westLeads = new Map();
    
    for (const [email, lead] of emailToLead) {
        const state = lead.state ? lead.state.toUpperCase() : '';
        
        if (WEST_STATES.has(state)) {
            westLeads.set(email, lead);
        } else {
            eastLeads.set(email, lead);
        }
    }
    
    log(`Classification: ${eastLeads.size} East, ${westLeads.size} West`);
    return { eastLeads, westLeads };
}

// Fetch all NOT_CONTACTED leads from a campaign
async function fetchLeads(campaignId, campaignName) {
    log(`Fetching NOT_CONTACTED leads from ${campaignName}`);
    
    let allLeads = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
        const endpoint = `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&status=NOT_CONTACTED&limit=${limit}&offset=${offset}`;
        
        try {
            const response = await makeRequest('GET', endpoint);
            
            if (response.error) {
                log(`Error fetching leads: ${response.error}`, true);
                break;
            }
            
            const leads = response.data || response.leads || [];
            if (leads.length === 0) break;
            
            allLeads = allLeads.concat(leads);
            log(`Fetched ${leads.length} leads (offset ${offset}), total: ${allLeads.length}`);
            
            if (leads.length < limit) break;
            offset += limit;
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error fetching leads at offset ${offset}: ${error.message}`, true);
            break;
        }
    }
    
    log(`Total NOT_CONTACTED leads fetched from ${campaignName}: ${allLeads.length}`);
    return allLeads;
}

// Delete leads from campaign
async function deleteLeads(campaignId, emails, campaignName) {
    if (emails.length === 0) {
        log(`No leads to delete from ${campaignName}`);
        return;
    }
    
    log(`Deleting ${emails.length} leads from ${campaignName}`);
    
    // Delete in batches of 50 to avoid API limits
    const batchSize = 50;
    for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        
        const payload = {
            workspace_id: CONFIG.WORKSPACE_ID,
            campaign_id: campaignId,
            delete_list: batch
        };
        
        try {
            const response = await makeRequest('POST', '/lead/delete', payload);
            
            if (response.status === 'success') {
                log(`Successfully deleted batch of ${batch.length} leads`);
            } else {
                log(`Failed to delete batch: ${JSON.stringify(response)}`, true);
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error deleting batch: ${error.message}`, true);
        }
    }
}

// Add leads to campaign
async function addLeads(campaignId, leads, campaignName) {
    if (leads.length === 0) {
        log(`No leads to add to ${campaignName}`);
        return;
    }
    
    log(`Adding ${leads.length} leads to ${campaignName}`);
    
    // Add in batches of 100 to avoid API limits
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
        const batch = leads.slice(i, i + batchSize);
        
        const payload = {
            workspace_id: CONFIG.WORKSPACE_ID,
            campaign_id: campaignId,
            skip_if_in_workspace: false,
            skip_lead_in_active_pause_camp: true,
            skip_lead_for_active_only_camp: false,
            resume_camp_if_completed: false,
            hubspot_sync: false,
            leads: batch.map(lead => ({
                email: lead.email,
                first_name: lead.first_name || '',
                last_name: lead.last_name || '',
                company_name: lead.company_name || '',
                company_website: lead.company_website || '',
                phone_number: lead.phone_number || '',
                city: lead.city || '',
                linkedin_person_url: lead.linkedin_person_url || '',
                custom_variables: {
                    functional_role: lead.job_title || '',
                    state: lead.state || '',
                    industry: lead.industry || '',
                    company_size: lead.company_size || ''
                }
            })),
            is_overwrite: false
        };
        
        try {
            const response = await makeRequest('POST', '/lead/add', payload);
            
            if (response.status === 'success') {
                log(`Successfully added batch: ${response.leads_uploaded}/${response.total_sent} leads`);
            } else {
                log(`Failed to add batch: ${JSON.stringify(response)}`, true);
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error adding batch: ${error.message}`, true);
        }
    }
}

// Get an existing campaign's details to copy structure for West campaign
async function getCampaignDetails(campaignId) {
    const endpoint = `/campaign/get/campaign?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}`;
    
    try {
        const response = await makeRequest('GET', endpoint);
        return response;
    } catch (error) {
        log(`Error getting campaign details: ${error.message}`, true);
        return null;
    }
}

// Create a new West campaign by copying the East campaign structure
async function createWestCampaign(baseCampaign) {
    log(`Creating West campaign: ${baseCampaign.westName}`);
    
    try {
        // Get the source campaign details
        const sourceDetails = await getCampaignDetails(baseCampaign.id);
        
        if (!sourceDetails || !sourceDetails.data) {
            log(`Failed to get source campaign details for ${baseCampaign.name}`, true);
            return null;
        }
        
        await sleep(CONFIG.RATE_LIMIT_MS);
        
        const sourceCampaign = sourceDetails.data;
        
        // Create the payload for the new West campaign
        const payload = {
            workspace_id: CONFIG.WORKSPACE_ID,
            name: baseCampaign.westName,
            email_from_name: sourceCampaign.email_from_name || 'SmarterRevolution',
            email_from_email: sourceCampaign.email_from_email || sourceCampaign.from_email,
            first_wait_time: sourceCampaign.first_wait_time || 1,
            tracking_domain: sourceCampaign.tracking_domain || '',
            is_active: false, // Keep paused
            schedules: {
                timezone: "America/Los_Angeles",
                timing: {
                    from: "07:00",
                    to: "10:00"
                },
                days: {
                    1: true, 2: true, 3: true, 4: true, 5: true,
                    6: false, 7: false
                },
                daily_limit: 20
            },
            // Copy email steps from source campaign
            email_steps: sourceCampaign.email_steps || []
        };
        
        const response = await makeRequest('POST', '/campaign/add/campaign', payload);
        
        if (response.success || response.data) {
            const newCampaignId = response.data?.campaign_id || response.campaign_id;
            log(`Successfully created West campaign with ID: ${newCampaignId}`);
            return newCampaignId;
        } else {
            log(`Failed to create West campaign: ${JSON.stringify(response)}`, true);
            return null;
        }
        
    } catch (error) {
        log(`Error creating West campaign: ${error.message}`, true);
        return null;
    }
}

// Rename campaign to add (East) suffix
async function renameCampaign(campaignId, newName) {
    log(`Renaming campaign ${campaignId} to ${newName}`);
    
    try {
        // Get current campaign details first
        const details = await getCampaignDetails(campaignId);
        
        if (!details || !details.data) {
            log(`Failed to get campaign details for renaming`, true);
            return;
        }
        
        await sleep(CONFIG.RATE_LIMIT_MS);
        
        const campaign = details.data;
        
        const payload = {
            workspace_id: CONFIG.WORKSPACE_ID,
            campaign_id: campaignId,
            name: newName,
            first_wait_time: campaign.first_wait_time || 1,
            email_from_name: campaign.email_from_name,
            email_from_email: campaign.email_from_email || campaign.from_email,
            tracking_domain: campaign.tracking_domain || '',
            schedules: campaign.schedules || {}
        };
        
        const response = await makeRequest('PATCH', '/campaign/update/campaign', payload);
        
        if (response.success || response.status === 'success') {
            log(`Successfully renamed campaign to ${newName}`);
        } else {
            log(`Failed to rename campaign: ${JSON.stringify(response)}`, true);
        }
        
        await sleep(CONFIG.RATE_LIMIT_MS);
    } catch (error) {
        log(`Error renaming campaign: ${error.message}`, true);
    }
}

// Process a single campaign
async function processCampaign(campaign) {
    log(`\n=== Processing ${campaign.name} ===`);
    
    try {
        // 1. Parse CSV and classify leads
        const csvPath = path.join(CONFIG.CSV_DIR, campaign.csv);
        const emailToLead = parseCsv(csvPath);
        const { eastLeads, westLeads } = classifyLeads(emailToLead);
        
        if (westLeads.size === 0) {
            log(`No West leads found for ${campaign.name}, skipping`);
            return;
        }
        
        // 2. Fetch current leads from East campaign
        const currentLeads = await fetchLeads(campaign.id, campaign.name);
        const currentEmails = new Set(currentLeads.map(lead => lead.email));
        
        // 3. Find West leads that are currently in the East campaign
        const westEmailsInEast = [];
        const westLeadsToAdd = [];
        
        for (const [email, leadData] of westLeads) {
            if (currentEmails.has(email)) {
                westEmailsInEast.push(email);
            }
            westLeadsToAdd.push(leadData);
        }
        
        log(`Found ${westEmailsInEast.length} West leads to move from East campaign`);
        log(`Total ${westLeadsToAdd.length} West leads to add to West campaign`);
        
        // 4. Create West campaign (if not exists)
        let westCampaignId = campaign.westId;
        if (!westCampaignId) {
            westCampaignId = await createWestCampaign(campaign);
            if (!westCampaignId) {
                log(`Failed to create West campaign for ${campaign.name}`, true);
                return;
            }
        } else {
            log(`Using existing West campaign: ${campaign.westId}`);
        }
        
        // 5. Delete West leads from East campaign
        if (westEmailsInEast.length > 0) {
            await deleteLeads(campaign.id, westEmailsInEast, campaign.name);
        }
        
        // 6. Add all West leads to West campaign
        if (westLeadsToAdd.length > 0 && westCampaignId) {
            await addLeads(westCampaignId, westLeadsToAdd, campaign.westName);
        }
        
        // 7. Rename East campaign
        await renameCampaign(campaign.id, `${campaign.name} (East)`);
        
        log(`✅ Completed processing ${campaign.name}`);
        
    } catch (error) {
        log(`❌ Error processing ${campaign.name}: ${error.message}`, true);
    }
}

// Get lead count for a campaign
async function getLeadCount(campaignId, campaignName) {
    try {
        const endpoint = `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&status=NOT_CONTACTED&limit=1&offset=0`;
        const response = await makeRequest('GET', endpoint);
        
        const total = response.total || response.total_count || 0;
        log(`${campaignName}: ${total} NOT_CONTACTED leads`);
        return total;
    } catch (error) {
        log(`Error getting lead count for ${campaignName}: ${error.message}`, true);
        return 0;
    }
}

// Test function to verify CSV parsing and classification
async function testCsvParsing(campaignName) {
    const campaign = CAMPAIGNS.find(c => c.name === campaignName);
    if (!campaign) {
        log(`Campaign not found: ${campaignName}`, true);
        return;
    }
    
    log(`\n=== Testing CSV parsing for ${campaign.name} ===`);
    
    const csvPath = path.join(CONFIG.CSV_DIR, campaign.csv);
    const emailToLead = parseCsv(csvPath);
    const { eastLeads, westLeads } = classifyLeads(emailToLead);
    
    log(`Sample West leads:`);
    let count = 0;
    for (const [email, lead] of westLeads) {
        if (count++ < 3) {
            log(`  ${email} - ${lead.city}, ${lead.state}`);
        } else {
            break;
        }
    }
    
    log(`Sample East leads:`);
    count = 0;
    for (const [email, lead] of eastLeads) {
        if (count++ < 3) {
            log(`  ${email} - ${lead.city}, ${lead.state}`);
        } else {
            break;
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--test-csv')) {
        const campaignName = args[args.indexOf('--test-csv') + 1] || 'V2 | Tech & Finance';
        await testCsvParsing(campaignName);
        return;
    }
    
    log('🚀 Starting PlusVibe Campaign Restructure v2');
    log(`Processing ${CAMPAIGNS.length} campaigns`);
    
    try {
        // Process each campaign
        for (const campaign of CAMPAIGNS) {
            await processCampaign(campaign);
            await sleep(CONFIG.RATE_LIMIT_MS); // Rate limiting between campaigns
        }
        
        log('\n=== Final Lead Count Verification ===');
        
        // Check final counts
        for (const campaign of CAMPAIGNS) {
            await getLeadCount(campaign.id, `${campaign.name} (East)`);
            if (campaign.westId) {
                await getLeadCount(campaign.westId, campaign.westName);
            }
            await sleep(CONFIG.RATE_LIMIT_MS);
        }
        
        log('✅ Campaign restructure completed successfully!');
        
    } catch (error) {
        log(`❌ Fatal error: ${error.message}`, true);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}