#!/usr/bin/env node

/**
 * PlusVibe Campaign Restructure Script v3
 * Fixed API calls and error handling
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
    LOG_FILE: '/opt/smarty-projects/campaign-restructure-v3.log'
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

// HTTP request helper with better error logging
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

        log(`API ${method} ${endpoint}`);
        if (data) {
            log(`Payload: ${JSON.stringify(data, null, 2)}`);
        }

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                log(`Response (${res.statusCode}): ${body}`);
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (err) {
                    resolve({ body, status: res.statusCode, raw: true });
                }
            });
        });

        req.on('error', (err) => {
            log(`Request error: ${err.message}`, true);
            reject(err);
        });
        
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

// Fetch all leads from a campaign (try different parameter formats)
async function fetchLeads(campaignId, campaignName) {
    log(`Fetching leads from ${campaignName}`);
    
    let allLeads = [];
    let offset = 0;
    const limit = 100;
    
    // Try different API formats
    const apiFormats = [
        `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&status=NOT_CONTACTED&limit=${limit}&offset=${offset}`,
        `/lead/workspace-leads?workspace_id=${CONFIG.WORKSPACE_ID}&campaign_id=${campaignId}&limit=${limit}&offset=${offset}`,
        `/lead/workspace-leads?campaign_id=${campaignId}&limit=${limit}&offset=${offset}`
    ];
    
    for (const endpoint of apiFormats) {
        try {
            log(`Trying endpoint format: ${endpoint.split('?')[0]}`);
            const response = await makeRequest('GET', endpoint);
            
            if (response.data || response.leads || Array.isArray(response)) {
                const leads = response.data || response.leads || response;
                log(`Success! Found ${leads.length} leads with this format`);
                return leads;
            }
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (error) {
            log(`Format failed: ${error.message}`);
        }
    }
    
    log(`All formats failed for ${campaignName}`, true);
    return [];
}

// Test function to verify we can fetch leads
async function testLeadFetching() {
    log('\n=== Testing Lead Fetching ===');
    
    for (const campaign of CAMPAIGNS) {
        log(`Testing ${campaign.name}...`);
        const leads = await fetchLeads(campaign.id, campaign.name);
        log(`Result: ${leads.length} leads`);
        await sleep(CONFIG.RATE_LIMIT_MS);
        
        if (leads.length > 0) {
            log(`Sample lead: ${JSON.stringify(leads[0], null, 2)}`);
            break; // Found working format
        }
    }
}

// Simple test to see available API endpoints
async function testApiEndpoints() {
    log('\n=== Testing API Endpoints ===');
    
    const endpoints = [
        '/campaign/list?workspace_id=' + CONFIG.WORKSPACE_ID,
        '/lead/count?workspace_id=' + CONFIG.WORKSPACE_ID,
        '/workspace/details?workspace_id=' + CONFIG.WORKSPACE_ID
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest('GET', endpoint);
            log(`${endpoint}: SUCCESS`);
        } catch (error) {
            log(`${endpoint}: FAILED - ${error.message}`);
        }
        await sleep(CONFIG.RATE_LIMIT_MS);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--test-csv')) {
        const campaignName = args[args.indexOf('--test-csv') + 1] || 'V2 | Tech & Finance';
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
        return;
    }
    
    if (args.includes('--test-api')) {
        await testApiEndpoints();
        return;
    }
    
    if (args.includes('--test-leads')) {
        await testLeadFetching();
        return;
    }
    
    log('🚀 Starting PlusVibe Campaign Restructure v3');
    log('Use --test-csv, --test-api, or --test-leads for testing individual components');
}

// Run the script
if (require.main === module) {
    main();
}