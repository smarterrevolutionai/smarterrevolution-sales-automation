#!/usr/bin/env node

/**
 * PlusVibe Campaign Restructure Script - FINAL VERSION
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
    LOG_FILE: '/opt/smarty-projects/campaign-restructure-final.log'
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
        // westId removed - was deleted
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
                    resolve({ body, status: res.statusCode, raw: true });
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
                current += '"';
                i += 2;
            } else {
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
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
async function fetchNotContactedLeads(campaignId, campaignName) {
    log(`Fetching NOT_CONTACTED leads from ${campaignName}`);
    
    let allLeads = [];
    let hasMore = true;
    let lastId = '';
    const limit = 1000; // Fetch in larger chunks
    
    while (hasMore) {
        let endpoint = `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&limit=${limit}`;
        if (lastId) {
            endpoint += `&last_id=${lastId}`;
        }
        
        try {
            const response = await makeRequest('GET', endpoint);
            
            if (Array.isArray(response)) {
                // Filter for NOT_CONTACTED leads
                const notContactedLeads = response.filter(lead => lead.status === 'NOT_CONTACTED');
                allLeads = allLeads.concat(notContactedLeads);
                
                log(`Fetched ${response.length} leads (${notContactedLeads.length} NOT_CONTACTED), total: ${allLeads.length}`);
                
                if (response.length < limit) {
                    hasMore = false;
                } else {
                    lastId = response[response.length - 1]._id;
                }
            } else {
                log(`Unexpected response format: ${JSON.stringify(response)}`);
                break;
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error fetching leads: ${error.message}`, true);
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
    let totalDeleted = 0;
    
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
                totalDeleted += batch.length;
            } else {
                log(`Failed to delete batch: ${JSON.stringify(response)}`, true);
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error deleting batch: ${error.message}`, true);
        }
    }
    
    log(`Total deleted from ${campaignName}: ${totalDeleted}/${emails.length}`);
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
    let totalAdded = 0;
    
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
                totalAdded += response.leads_uploaded || 0;
            } else {
                log(`Failed to add batch: ${JSON.stringify(response)}`, true);
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error adding batch: ${error.message}`, true);
        }
    }
    
    log(`Total added to ${campaignName}: ${totalAdded}/${leads.length}`);
}

// Get campaign details
async function getCampaignDetails(campaignId) {
    const campaigns = await makeRequest('GET', `/campaign/list?workspace_id=${CONFIG.WORKSPACE_ID}`);
    
    if (Array.isArray(campaigns)) {
        return campaigns.find(c => c._id === campaignId || c.id === campaignId);
    }
    
    return null;
}

// Create a new West campaign (simplified for now)
async function createWestCampaign(baseCampaign) {
    log(`Creating West campaign: ${baseCampaign.westName}`);
    log(`NOTE: Campaign creation requires manual setup via PlusVibe UI`);
    log(`Please create campaign: ${baseCampaign.westName} with West timezone settings`);
    
    // Return placeholder ID - in practice, this would need manual creation
    return null;
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
        
        // 2. Fetch current NOT_CONTACTED leads from East campaign
        const currentLeads = await fetchNotContactedLeads(campaign.id, campaign.name);
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
        
        log(`Found ${westEmailsInEast.length} West leads currently in East campaign`);
        log(`Total ${westLeadsToAdd.length} West leads to add to West campaign`);
        
        // 4. Use existing West campaign or create new one
        let westCampaignId = campaign.westId;
        if (!westCampaignId) {
            westCampaignId = await createWestCampaign(campaign);
            if (!westCampaignId) {
                log(`West campaign creation needed for ${campaign.name}. Skipping lead operations.`, true);
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
        
        log(`✅ Completed processing ${campaign.name}`);
        
    } catch (error) {
        log(`❌ Error processing ${campaign.name}: ${error.message}`, true);
    }
}

// Get lead count for verification
async function getLeadCounts() {
    log('\n=== Final Lead Count Verification ===');
    
    for (const campaign of CAMPAIGNS) {
        try {
            // East campaign count
            const eastLeads = await fetchNotContactedLeads(campaign.id, `${campaign.name} (for count)`);
            log(`${campaign.name}: ${eastLeads.length} NOT_CONTACTED leads`);
            
            // West campaign count (if exists)
            if (campaign.westId) {
                const westLeads = await fetchNotContactedLeads(campaign.westId, `${campaign.westName} (for count)`);
                log(`${campaign.westName}: ${westLeads.length} NOT_CONTACTED leads`);
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error getting counts for ${campaign.name}: ${error.message}`, true);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--counts')) {
        await getLeadCounts();
        return;
    }
    
    if (args.includes('--dry-run')) {
        log('🧪 DRY RUN MODE - No actual changes will be made');
        
        for (const campaign of CAMPAIGNS) {
            log(`\n=== DRY RUN: ${campaign.name} ===`);
            
            const csvPath = path.join(CONFIG.CSV_DIR, campaign.csv);
            const emailToLead = parseCsv(csvPath);
            const { eastLeads, westLeads } = classifyLeads(emailToLead);
            
            if (westLeads.size > 0) {
                const currentLeads = await fetchNotContactedLeads(campaign.id, campaign.name);
                const currentEmails = new Set(currentLeads.map(lead => lead.email));
                
                const westEmailsInEast = [];
                for (const [email] of westLeads) {
                    if (currentEmails.has(email)) {
                        westEmailsInEast.push(email);
                    }
                }
                
                log(`WOULD MOVE: ${westEmailsInEast.length} leads from East to West`);
                log(`WOULD ADD: ${westLeads.size} total leads to West campaign`);
            } else {
                log(`No West leads found`);
            }
        }
        return;
    }
    
    log('🚀 Starting PlusVibe Campaign Restructure - FINAL VERSION');
    log(`Processing ${CAMPAIGNS.length} campaigns`);
    
    try {
        // Process each campaign
        for (const campaign of CAMPAIGNS) {
            await processCampaign(campaign);
            await sleep(1000); // Longer pause between campaigns
        }
        
        // Final verification
        await getLeadCounts();
        
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