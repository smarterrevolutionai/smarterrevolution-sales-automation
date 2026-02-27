#!/usr/bin/env node

const http = require('http');
const fs = require('fs');

/**
 * Follow-up Sequence Checker for Smarter Revolution CRM
 * 
 * Checks deals in early pipeline stages (Lead, Qualified, Proposal) for follow-up needs
 * based on their most recent activity date.
 * 
 * Follow-up rules:
 * - 3+ days since last activity: Follow-up #1
 * - 7+ days since last activity: Follow-up #2  
 * - 14+ days since last activity: Stale deal
 */

// Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'WorkSmarter2025!'
};

// Early stage IDs from the CRM seed data
const EARLY_STAGE_IDS = ['stage-lead', 'stage-qualified', 'cml9z9wfv0001my8dphmo2fdl', 'stage-proposal'];
const EARLY_STAGE_NAMES = ['Lead Identified', 'Discovery Call Booked', 'Discovery Call Complete', 'Proposal Sent'];

// Follow-up thresholds in days
const FOLLOW_UP_1_DAYS = 3;
const FOLLOW_UP_2_DAYS = 7;
const STALE_DAYS = 14;

/**
 * Make HTTP request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            data: body
          };
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

/**
 * Login to CRM and extract session cookie
 */
async function loginToCRM() {
  console.log('[LOGIN] Logging into CRM...');
  
  const loginData = JSON.stringify(ADMIN_CREDENTIALS);
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  try {
    const response = await makeRequest(options, loginData);
    
    if (response.status !== 200) {
      throw new Error('Login failed with status ' + response.status + ': ' + response.data);
    }

    // Extract sr_session cookie from Set-Cookie header
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) {
      throw new Error('No Set-Cookie header in login response');
    }

    const sessionCookie = setCookie.find(cookie => cookie.startsWith('sr_session='));
    if (!sessionCookie) {
      throw new Error('sr_session cookie not found in response');
    }

    // Extract cookie value
    const cookieValue = sessionCookie.split('=')[1].split(';')[0];
    console.log('[LOGIN] Login successful, got session cookie');
    return cookieValue;
    
  } catch (error) {
    console.error('[LOGIN] Login failed:', error.message);
    throw error;
  }
}

/**
 * Fetch all deals from CRM
 */
async function fetchAllDeals(sessionCookie) {
  console.log('[DEALS] Fetching all deals...');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/deals',
    method: 'GET',
    headers: {
      'Cookie': 'sr_session=' + sessionCookie,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status !== 200) {
      throw new Error('Failed to fetch deals: ' + response.status + ' ' + response.data);
    }

    const result = JSON.parse(response.data);
    const deals = result.data || [];
    
    console.log('[DEALS] Fetched ' + deals.length + ' deals');
    return deals;
    
  } catch (error) {
    console.error('[DEALS] Failed to fetch deals:', error.message);
    throw error;
  }
}

/**
 * Fetch activities for a specific deal
 */
async function fetchDealActivities(dealId, sessionCookie) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/activities?dealId=' + encodeURIComponent(dealId),
    method: 'GET',
    headers: {
      'Cookie': 'sr_session=' + sessionCookie,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status !== 200) {
      throw new Error('Failed to fetch activities for deal ' + dealId + ': ' + response.status);
    }

    const result = JSON.parse(response.data);
    return result.data || [];
    
  } catch (error) {
    console.error('[ACTIVITIES] Failed to fetch activities for deal ' + dealId + ':', error.message);
    return [];
  }
}

/**
 * Calculate days since last activity
 */
function daysSinceLastActivity(activities) {
  if (!activities.length) {
    return null; // No activities found
  }

  // Sort activities by date (most recent first)
  const sortedActivities = activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const mostRecentActivity = sortedActivities[0];
  
  const lastActivityDate = new Date(mostRecentActivity.date);
  const now = new Date();
  const diffTime = Math.abs(now - lastActivityDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Determine follow-up status based on days since last activity
 */
function determineFollowUpStatus(daysSince) {
  if (daysSince === null) {
    return { type: 'no-activities', followupNumber: null };
  }
  
  if (daysSince >= STALE_DAYS) {
    return { type: 'stale', followupNumber: null };
  }
  
  if (daysSince >= FOLLOW_UP_2_DAYS) {
    return { type: 'followup', followupNumber: 2 };
  }
  
  if (daysSince >= FOLLOW_UP_1_DAYS) {
    return { type: 'followup', followupNumber: 1 };
  }
  
  return { type: 'ok', followupNumber: null };
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('[MAIN] Starting follow-up sequence checker...');
    console.log('[MAIN] Date: ' + new Date().toISOString().split('T')[0]);
    console.log('');

    // Step 1: Login and get session cookie
    const sessionCookie = await loginToCRM();
    
    // Step 2: Fetch all deals
    const allDeals = await fetchAllDeals(sessionCookie);
    
    // Step 3: Filter deals in early stages
    const earlyStageDeals = allDeals.filter(deal => 
      EARLY_STAGE_IDS.includes(deal.stageId) || 
      (deal.stage && EARLY_STAGE_NAMES.includes(deal.stage.name))
    );
    
    console.log('[FILTER] Found ' + earlyStageDeals.length + ' deals in early stages (' + EARLY_STAGE_NAMES.join(', ') + ')');
    console.log('');

    const followupsNeeded = [];
    const staleDeals = [];
    let processedCount = 0;

    // Step 4: Process each early stage deal
    for (const deal of earlyStageDeals) {
      processedCount++;
      console.log('[PROCESS] [' + processedCount + '/' + earlyStageDeals.length + '] Processing deal: "' + deal.name + '" (' + (deal.stage ? deal.stage.name : 'Unknown Stage') + ')');
      
      // Fetch activities for this deal
      const activities = await fetchDealActivities(deal.id, sessionCookie);
      console.log('[PROCESS]   Found ' + activities.length + ' activities');
      
      // Calculate days since last activity
      const daysSince = daysSinceLastActivity(activities);
      console.log('[PROCESS]   Days since last activity: ' + (daysSince !== null ? daysSince : 'N/A'));
      
      // Determine follow-up status
      const status = determineFollowUpStatus(daysSince);
      
      if (status.type === 'followup') {
        const dealInfo = {
          dealId: deal.id,
          dealName: deal.name,
          contactEmail: deal.contact ? deal.contact.email : null,
          contactName: deal.contact ? (deal.contact.firstName + ' ' + deal.contact.lastName).trim() : null,
          company: deal.contact ? deal.contact.company : null,
          daysSinceActivity: daysSince,
          followupNumber: status.followupNumber
        };
        followupsNeeded.push(dealInfo);
        console.log('[PROCESS]   FOLLOW-UP #' + status.followupNumber + ' NEEDED');
        
      } else if (status.type === 'stale') {
        const dealInfo = {
          dealId: deal.id,
          dealName: deal.name,
          contactEmail: deal.contact ? deal.contact.email : null,
          contactName: deal.contact ? (deal.contact.firstName + ' ' + deal.contact.lastName).trim() : null,
          company: deal.contact ? deal.contact.company : null,
          daysSinceActivity: daysSince
        };
        staleDeals.push(dealInfo);
        console.log('[PROCESS]   STALE DEAL (' + daysSince + ' days)');
        
      } else if (status.type === 'no-activities') {
        console.log('[PROCESS]   No activities found - may need immediate attention');
        
      } else {
        console.log('[PROCESS]   Recent activity - no follow-up needed');
      }
      
      console.log('');
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 5: Generate report
    const report = {
      date: new Date().toISOString().split('T')[0],
      followups_needed: followupsNeeded,
      stale_deals: staleDeals,
      summary: {
        total_deals: allDeals.length,
        early_stage_deals: earlyStageDeals.length,
        needing_followup: followupsNeeded.length,
        stale: staleDeals.length
      }
    };

    // Output the report
    console.log('[REPORT] FOLLOW-UP SEQUENCE REPORT');
    console.log('================================================');
    console.log(JSON.stringify(report, null, 2));
    
    // Also write to file for reference
    const reportFile = '/tmp/follow-up-report-' + report.date + '.json';
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('');
    console.log('[REPORT] Report saved to: ' + reportFile);
    
    process.exit(0);
    
  } catch (error) {
    console.error('[ERROR] Script failed:', error.message);
    process.exit(1);
  }
}

// Execute the script
if (require.main === module) {
  main();
}

module.exports = { main };