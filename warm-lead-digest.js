#!/usr/bin/env node

/**
 * Warm Lead Daily Digest for Smarter Revolution
 * 
 * Gathers and summarizes warm leads from multiple sources:
 * - PlusVibe INTERESTED labeled emails (last 7 days)
 * - CRM open deals with stage and last activity
 * - Pending follow-ups needed
 * - Stale deals (no activity in 3+ days)
 * 
 * Sends formatted digest via SMS to Mark and Wolf at 8am ET Mon-Fri
 * 
 * Usage:
 *   node warm-lead-digest.js                    # Send digest
 *   node warm-lead-digest.js --dry-run          # Test without sending
 *   node warm-lead-digest.js --verbose          # Show detailed output
 */

const http = require('http');

// Configuration
const PLUSVIBE_API_KEY = "process.env.PLUSVIBE_API_KEY";
const WORKSPACE_ID = "692307182213832a0e2cf618";
const PLUSVIBE_BASE_URL = "https://api.plusvibe.ai/api/v1";

const CRM_BASE_URL = 'http://localhost:3000';
const CRM_ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'WorkSmarter2025!'
};

// Twilio Configuration
const TWILIO_SID = 'process.env.TWILIO_SID';
const TWILIO_AUTH_TOKEN = 'process.env.TWILIO_AUTH_TOKEN';
const TWILIO_FROM_NUMBER = '+18446620687'
const TWILIO_API_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

// Recipients
const RECIPIENTS = [
  { name: 'Mark', number: '+13107405587' },
  { name: 'Wolf', number: '+12133028260' }
];

// Deal stages (from CRM seed data)
const EARLY_STAGE_IDS = ['stage-lead', 'stage-qualified', 'cml9z9wfv0001my8dphmo2fdl', 'stage-proposal'];
const STAGE_NAMES = {
  'stage-lead': 'Lead Identified',
  'stage-qualified': 'Discovery Call Booked', 
  'cml9z9wfv0001my8dphmo2fdl': 'Discovery Call Complete',
  'stage-proposal': 'Proposal Sent'
};

// Follow-up thresholds in days
const FOLLOW_UP_DAYS = 3;
const STALE_DAYS = 7;

/**
 * Safe fetch with timeout
 */
async function safeFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal 
    });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Make HTTP request to CRM (Node.js http module for localhost)
 */
function makeCRMRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        } catch (error) {
          reject(new Error(`Failed to parse CRM response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`CRM request failed: ${error.message}`));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Login to CRM and get session cookie
 */
async function loginToCRM(verbose = false) {
  try {
    if (verbose) console.log('🔐 Logging into CRM...');
    
    const response = await makeCRMRequest('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(CRM_ADMIN_CREDENTIALS)
    });
    
    if (response.status !== 200) {
      throw new Error(`Login failed with status ${response.status}`);
    }
    
    // Extract sr_session cookie
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) {
      throw new Error('No Set-Cookie header in login response');
    }
    
    const sessionCookie = setCookie.find(cookie => cookie.startsWith('sr_session='));
    if (!sessionCookie) {
      throw new Error('sr_session cookie not found in response');
    }
    
    const cookieValue = sessionCookie.split('=')[1].split(';')[0];
    if (verbose) console.log('✓ CRM login successful');
    
    return cookieValue;
  } catch (error) {
    throw new Error(`CRM login failed: ${error.message}`);
  }
}

/**
 * Get INTERESTED emails from PlusVibe (last 7 days)
 */
async function getPlusVibeInterestedEmails(verbose = false) {
  try {
    if (verbose) console.log('🔍 Fetching INTERESTED emails from PlusVibe...');
    
    const url = `${PLUSVIBE_BASE_URL}/unibox/emails?workspace_id=${WORKSPACE_ID}&label=INTERESTED`;
    
    const response = await safeFetch(url, {
      headers: { 'x-api-key': PLUSVIBE_API_KEY }
    });
    
    if (!response.ok) {
      throw new Error(`PlusVibe API error: ${response.status}`);
    }
    
    const data = await response.json();
    const emails = Array.isArray(data) ? data : (data.data || []);
    
    // Filter to last 7 days and incoming emails only
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentEmails = emails.filter(email => {
      const emailDate = new Date(email.date || email.created_at);
      return emailDate >= sevenDaysAgo && 
             (email.direction === 'IN' || email.email_type === 'received') &&
             email.from_address_email !== 'mark@smarterrevolution.com';
    });
    
    if (verbose) console.log(`✓ Found ${recentEmails.length} INTERESTED emails (last 7 days)`);
    
    return recentEmails;
  } catch (error) {
    console.error('❌ PlusVibe fetch failed:', error.message);
    return [];
  }
}

/**
 * Get open deals from CRM
 */
async function getCRMOpenDeals(sessionCookie, verbose = false) {
  try {
    if (verbose) console.log('🔍 Fetching open deals from CRM...');
    
    const response = await makeCRMRequest('/api/deals', {
      headers: {
        'Cookie': `sr_session=${sessionCookie}`
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`CRM API error: ${response.status}`);
    }
    
    const dealsResponse = response.data;
    const allDeals = dealsResponse.data || [];
    // Filter to open deals (assuming deals without a closedAt date are open)
    const openDeals = allDeals.filter(deal => !deal.closedAt && deal.stage);
    
    if (verbose) console.log(`✓ Found ${openDeals.length} open deals`);
    
    return openDeals;
  } catch (error) {
    console.error('❌ CRM deals fetch failed:', error.message);
    return [];
  }
}

/**
 * Get activities from CRM
 */
async function getCRMActivities(sessionCookie, verbose = false) {
  try {
    if (verbose) console.log('🔍 Fetching activities from CRM...');
    
    const response = await makeCRMRequest('/api/activities', {
      headers: {
        'Cookie': `sr_session=${sessionCookie}`
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`CRM API error: ${response.status}`);
    }
    
    const activitiesResponse = response.data;
    const activities = activitiesResponse.data || [];
    
    if (verbose) console.log(`✓ Found ${activities.length} activities`);
    
    return activities;
  } catch (error) {
    console.error('❌ CRM activities fetch failed:', error.message);
    return [];
  }
}

/**
 * Analyze deals for follow-ups and stale status
 */
function analyzeDeals(deals, activities, verbose = false) {
  if (verbose) console.log('📊 Analyzing deals for follow-up needs...');
  
  const now = new Date();
  const followUpNeeded = [];
  const staleDeals = [];
  const activePipeline = [];
  
  for (const deal of deals) {
    // Get most recent activity for this deal
    const dealActivities = activities
      .filter(activity => activity.dealId === deal.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const lastActivity = dealActivities[0];
    const lastActivityDate = lastActivity ? new Date(lastActivity.createdAt) : new Date(deal.createdAt);
    const daysSinceLastActivity = Math.floor((now - lastActivityDate) / (1000 * 60 * 60 * 24));
    
    const dealInfo = {
      id: deal.id,
      company: deal.contact?.company || deal.company || 'Unknown Company',
      contact: deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}`.trim() : 'Unknown Contact',
      value: deal.value ? `$${deal.value.toLocaleString()}` : 'No value',
      stage: deal.stage?.name || STAGE_NAMES[deal.stageId] || deal.stageId || 'Unknown Stage',
      daysSinceActivity: daysSinceLastActivity,
      lastActivity: lastActivity ? `${lastActivity.type}: ${lastActivity.subject || lastActivity.body || 'No description'}` : 'No activities',
      lastActivityDate: lastActivityDate.toLocaleDateString()
    };
    
    if (daysSinceLastActivity >= STALE_DAYS) {
      staleDeals.push(dealInfo);
    } else if (daysSinceLastActivity >= FOLLOW_UP_DAYS) {
      followUpNeeded.push(dealInfo);
    } else {
      activePipeline.push(dealInfo);
    }
  }
  
  if (verbose) {
    console.log(`✓ Active pipeline: ${activePipeline.length}`);
    console.log(`⚠️  Follow-up needed: ${followUpNeeded.length}`);
    console.log(`🚨 Stale deals: ${staleDeals.length}`);
  }
  
  return { activePipeline, followUpNeeded, staleDeals };
}

/**
 * Format digest message
 */
function formatDigest(interestedEmails, dealAnalysis, verbose = false) {
  if (verbose) console.log('📝 Formatting digest...');
  
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  let message = `🌅 WARM LEAD DIGEST - ${today}\n\n`;
  
  // PlusVibe Section
  message += `📧 INTERESTED EMAILS (7 days)\n`;
  if (interestedEmails.length === 0) {
    message += `• No new interested emails\n\n`;
  } else {
    interestedEmails.slice(0, 3).forEach(email => {
      const from = email.from_name || email.from_email || 'Unknown';
      const company = email.company || '';
      const subject = email.subject ? email.subject.substring(0, 40) : 'No subject';
      message += `• ${from}${company ? ` (${company})` : ''}\n  "${subject}..."\n`;
    });
    if (interestedEmails.length > 3) {
      message += `• +${interestedEmails.length - 3} more interested emails\n`;
    }
    message += `\n`;
  }
  
  // Active Pipeline
  message += `🔥 ACTIVE PIPELINE (${dealAnalysis.activePipeline.length})\n`;
  if (dealAnalysis.activePipeline.length === 0) {
    message += `• No active deals\n\n`;
  } else {
    dealAnalysis.activePipeline.slice(0, 3).forEach(deal => {
      message += `• ${deal.company} - ${deal.stage}\n  ${deal.value} • ${deal.daysSinceActivity}d ago\n`;
    });
    if (dealAnalysis.activePipeline.length > 3) {
      message += `• +${dealAnalysis.activePipeline.length - 3} more active deals\n`;
    }
    message += `\n`;
  }
  
  // Follow-ups Needed
  if (dealAnalysis.followUpNeeded.length > 0) {
    message += `⏰ FOLLOW-UP NEEDED (${dealAnalysis.followUpNeeded.length})\n`;
    dealAnalysis.followUpNeeded.forEach(deal => {
      message += `• ${deal.company} - ${deal.stage}\n  ${deal.daysSinceActivity} days since last activity\n`;
    });
    message += `\n`;
  }
  
  // Stale Deals Alert
  if (dealAnalysis.staleDeals.length > 0) {
    message += `🚨 STALE DEALS (${dealAnalysis.staleDeals.length})\n`;
    dealAnalysis.staleDeals.forEach(deal => {
      message += `• ${deal.company} - ${deal.stage}\n  ${deal.daysSinceActivity} days stale!\n`;
    });
    message += `\n`;
  }
  
  // Summary
  const totalDeals = dealAnalysis.activePipeline.length + dealAnalysis.followUpNeeded.length + dealAnalysis.staleDeals.length;
  const totalValue = [...dealAnalysis.activePipeline, ...dealAnalysis.followUpNeeded, ...dealAnalysis.staleDeals]
    .reduce((sum, deal) => {
      const value = deal.value.replace(/[$,]/g, '');
      return sum + (isNaN(value) ? 0 : parseInt(value));
    }, 0);
  
  message += `📊 SUMMARY\n`;
  message += `• ${interestedEmails.length} new interested emails\n`;
  message += `• ${totalDeals} total open deals\n`;
  if (totalValue > 0) {
    message += `• $${totalValue.toLocaleString()} total pipeline value\n`;
  }
  message += `• ${dealAnalysis.followUpNeeded.length} need follow-up\n`;
  message += `• ${dealAnalysis.staleDeals.length} stale deals\n\n`;
  
  message += `📱 View full CRM: http://72.62.252.232:3000`;
  
  if (verbose) console.log(`✓ Digest formatted (${message.length} chars)`);
  
  return message;
}

/**
 * Send SMS via Twilio
 */
async function sendSMS(to, message, verbose = false) {
  try {
    if (verbose) console.log(`📱 Sending SMS to ${to}...`);
    
    const formData = new URLSearchParams({
      To: to,
      From: TWILIO_FROM_NUMBER,
      Body: message
    });

    const authHeader = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const response = await safeFetch(TWILIO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const result = await response.json();

    if (response.ok) {
      if (verbose) console.log(`✓ SMS sent successfully - SID: ${result.sid}`);
      return { success: true, sid: result.sid };
    } else {
      throw new Error(`${result.message} (Code: ${result.code})`);
    }
  } catch (error) {
    console.error(`❌ SMS failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || isDryRun;
  
  console.log('🌅 WARM LEAD DAILY DIGEST STARTING...\n');
  
  try {
    // Gather data
    console.log('📊 Gathering warm lead data...\n');
    
    // Login to CRM first
    const sessionCookie = await loginToCRM(verbose);
    
    const [interestedEmails, openDeals, activities] = await Promise.all([
      getPlusVibeInterestedEmails(verbose),
      getCRMOpenDeals(sessionCookie, verbose),
      getCRMActivities(sessionCookie, verbose)
    ]);
    
    // Analyze deals
    const dealAnalysis = analyzeDeals(openDeals, activities, verbose);
    
    // Format digest
    const digest = formatDigest(interestedEmails, dealAnalysis, verbose);
    
    if (verbose) {
      console.log('\n📄 DIGEST PREVIEW:\n');
      console.log('=' .repeat(50));
      console.log(digest);
      console.log('=' .repeat(50));
      console.log('');
    }
    
    if (isDryRun) {
      console.log('🔍 DRY RUN - No SMS messages sent');
      console.log(`📏 Message length: ${digest.length} characters`);
      return;
    }
    
    // Send to recipients
    console.log('📱 Sending digest via SMS...\n');
    
    const results = [];
    for (const recipient of RECIPIENTS) {
      const result = await sendSMS(recipient.number, digest, verbose);
      results.push({ ...recipient, ...result });
      
      // Small delay between sends
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n✅ DIGEST SENT TO ${successful}/${RECIPIENTS.length} RECIPIENTS`);
    if (failed > 0) {
      console.log(`❌ ${failed} failed sends`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   ${r.name} (${r.number}): ${r.error}`);
      });
    }
    
  } catch (error) {
    console.error('💥 DIGEST FAILED:', error.message);
    process.exit(1);
  }
}

// CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🌅 WARM LEAD DAILY DIGEST

Gathers warm leads from PlusVibe and CRM, sends formatted digest via SMS.

Usage:
  node warm-lead-digest.js                 # Send digest
  node warm-lead-digest.js --dry-run       # Test without sending SMS
  node warm-lead-digest.js --verbose       # Show detailed output
  node warm-lead-digest.js --help          # Show this help

Recipients:
  • Mark: +13107405587
  • Wolf: +12133028260

Data Sources:
  • PlusVibe INTERESTED emails (last 7 days)
  • CRM open deals with activity analysis
  • Follow-up needs (3+ days since activity)
  • Stale deals (7+ days since activity)

Scheduled: 8am ET Mon-Fri via OpenClaw cron
`);
  process.exit(0);
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  loginToCRM,
  getPlusVibeInterestedEmails,
  getCRMOpenDeals,
  getCRMActivities,
  analyzeDeals,
  formatDigest,
  sendSMS
};