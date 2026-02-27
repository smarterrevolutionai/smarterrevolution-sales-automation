#!/usr/bin/env node

/**
 * PlusVibe Campaign Restructure - RETAIL ONLY
 * Process just the Retail campaign since it has an existing West campaign
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
    RATE_LIMIT_MS: 200,
    LOG_FILE: '/opt/smarty-projects/campaign-restructure-retail.log'
};

// Only Retail campaign
const CAMPAIGN = {
    name: 'V2 | Retail',
    id: '6987e23a7d33011e42278325',
    csv: 'retail-hospitality.csv',
    westName: 'V2 | Retail (West)',
    westId: '698b8ebd113e12e2090f4dc7'
};

// West timezone states
const WEST_STATES = new Set(['AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY', 'AK']);

function log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    try {
        fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n');
    } catch (err) {
        console.error('Failed to write to log file:', err);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

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

async function fetchNotContactedLeads(campaignId, campaignName) {
    log(`Fetching NOT_CONTACTED leads from ${campaignName}`);
    
    const endpoint = `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&limit=10000`;
    
    try {
        const response = await makeRequest('GET', endpoint);
        if (Array.isArray(response)) {
            const notContactedLeads = response.filter(lead => lead.status === 'NOT_CONTACTED');
            log(`Fetched ${response.length} leads (${notContactedLeads.length} NOT_CONTACTED)`);
            return notContactedLeads;
        } else {
            log(`Unexpected response: ${JSON.stringify(response)}`);
            return [];
        }
    } catch (error) {
        log(`Error fetching leads: ${error.message}`, true);
        return [];
    }
}

async function deleteLeads(campaignId, emails, campaignName) {
    if (emails.length === 0) return;
    
    log(`Deleting ${emails.length} leads from ${campaignName}`);
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
                log(`Delete batch failed: ${JSON.stringify(response)}`);
            }
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error deleting batch: ${error.message}`, true);
        }
    }
    
    log(`Total deleted: ${totalDeleted}/${emails.length}`);
}

async function addLeads(campaignId, leads, campaignName) {
    if (leads.length === 0) return;
    
    log(`Adding ${leads.length} leads to ${campaignName}`);
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
                log(`Add batch failed: ${JSON.stringify(response)}`);
            }
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Error adding batch: ${error.message}`, true);
        }
    }
    
    log(`Total added: ${totalAdded}/${leads.length}`);
}

async function main() {
    log('🚀 Processing Retail Campaign Only');
    
    try {
        // Parse CSV and classify
        const csvPath = path.join(CONFIG.CSV_DIR, CAMPAIGN.csv);
        const emailToLead = parseCsv(csvPath);
        const { eastLeads, westLeads } = classifyLeads(emailToLead);
        
        // Fetch current leads from East campaign
        const currentLeads = await fetchNotContactedLeads(CAMPAIGN.id, CAMPAIGN.name);
        const currentEmails = new Set(currentLeads.map(lead => lead.email));
        
        // Find West leads in East campaign
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
        
        // Delete West leads from East campaign
        if (westEmailsInEast.length > 0) {
            await deleteLeads(CAMPAIGN.id, westEmailsInEast, CAMPAIGN.name);
        }
        
        // Add all West leads to West campaign
        if (westLeadsToAdd.length > 0) {
            await addLeads(CAMPAIGN.westId, westLeadsToAdd, CAMPAIGN.westName);
        }
        
        // Final verification
        log('\n=== Final Verification ===');
        const finalEast = await fetchNotContactedLeads(CAMPAIGN.id, `${CAMPAIGN.name} (East) - Final Count`);
        const finalWest = await fetchNotContactedLeads(CAMPAIGN.westId, `${CAMPAIGN.westName} - Final Count`);
        
        log(`Final counts:`);
        log(`East: ${finalEast.length} NOT_CONTACTED leads`);
        log(`West: ${finalWest.length} NOT_CONTACTED leads`);
        
        log('✅ Retail campaign restructure completed successfully!');
        
    } catch (error) {
        log(`❌ Fatal error: ${error.message}`, true);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}