#!/usr/bin/env node

// CLI argument parsing - must be at the top
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run") || args.includes("-d");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log();
  process.exit(0);
}

/**
 * Discovery Call Prep Automation for Wolf
 * 
 * Automatically generates and sends call prep briefs 30 minutes before scheduled discovery calls
 * Runs every 15 minutes via cron to check for upcoming calls
 * 
 * Features:
 * - Checks CRM for upcoming meetings in next 30 minutes
 * - Generates comprehensive prep briefs using existing call-prep.js logic
 * - Sends briefs via SMS to Wolf (+12133028260)
 * - Prevents duplicate briefs with logging system
 * - Includes company research, pricing tier recommendations, and talking points
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

// Configuration
const CONFIG = {
  CRM_BASE_URL: 'http://localhost:3000',
  WOLF_PHONE: '+12133028260',
  PREP_WINDOW_MINUTES: 30, // Send briefs 30 minutes before calls
  LOG_FILE: '/opt/smarty-projects/call-prep-auto.log',
  SENT_BRIEFS_FILE: '/opt/smarty-projects/call-prep-sent.json',
  
  // CRM Credentials (from existing call-prep.js)
  CRM_USERNAME: 'admin',
  CRM_PASSWORD: 'WorkSmarter2025!',
  
  // Pricing tiers
  PRICING_TIERS: {
    'Starter': { price: '$2,597/mo', employees: '1-25' },
    'Growth': { price: '$4,997/mo', employees: '26-100' },
    'Enterprise': { price: '$9,997/mo', employees: '101-500' },
    'Custom': { price: '$19,997+/mo', employees: '500+' }
  }
};

// Twilio Configuration (from existing sms-touch.js)
const TWILIO_CONFIG = {
  SID: 'process.env.TWILIO_SID',
  AUTH_TOKEN: 'process.env.TWILIO_AUTH_TOKEN',
  FROM_NUMBER: '+18446620687'
};

// Utility functions
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(logEntry.trim());
  
  try {
    fs.appendFileSync(CONFIG.LOG_FILE, logEntry);
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestModule = urlObj.protocol === 'https:' ? https : http;
    
    const req = requestModule.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Authenticate with CRM and get session cookie (from call-prep.js)
async function authenticateCRM() {
  try {
    const response = await makeRequest(`${CONFIG.CRM_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: CONFIG.CRM_USERNAME,
        password: CONFIG.CRM_PASSWORD
      })
    });
    
    if (response.status === 200) {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        const sessionCookie = setCookie.find(cookie => cookie.includes('sr_session'));
        if (sessionCookie) {
          return sessionCookie.split(';')[0];
        }
      }
    }
    return null;
  } catch (error) {
    log(`CRM auth failed: ${error.message}`);
    return null;
  }
}

// Load/save sent briefs tracking
function loadSentBriefs() {
  try {
    if (fs.existsSync(CONFIG.SENT_BRIEFS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.SENT_BRIEFS_FILE, 'utf8'));
    }
  } catch (err) {
    log(`Warning: Could not load sent briefs file: ${err.message}`);
  }
  return {};
}

function saveSentBriefs(sentBriefs) {
  try {
    fs.writeFileSync(CONFIG.SENT_BRIEFS_FILE, JSON.stringify(sentBriefs, null, 2));
  } catch (err) {
    log(`Error: Could not save sent briefs file: ${err.message}`);
  }
}

// Check if brief was already sent for this meeting
function wasAlreadySent(meetingId, meetingDate) {
  const sentBriefs = loadSentBriefs();
  const key = `${meetingId}-${meetingDate}`;
  return sentBriefs[key] === true;
}

function markAsSent(meetingId, meetingDate) {
  const sentBriefs = loadSentBriefs();
  const key = `${meetingId}-${meetingDate}`;
  sentBriefs[key] = true;
  
  // Clean up old entries (keep last 100)
  const entries = Object.keys(sentBriefs);
  if (entries.length > 100) {
    const toDelete = entries.slice(0, entries.length - 100);
    toDelete.forEach(key => delete sentBriefs[key]);
  }
  
  saveSentBriefs(sentBriefs);
}

// Get upcoming meetings from CRM
async function getUpcomingMeetings(sessionCookie) {
  try {
    const now = new Date();
    const thirtyMinutesLater = new Date(now.getTime() + (CONFIG.PREP_WINDOW_MINUTES * 60 * 1000));
    
    // Format dates for API
    const startStr = now.toISOString();
    const endStr = thirtyMinutesLater.toISOString();
    
    const url = `${CONFIG.CRM_BASE_URL}/api/calendar?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`;
    
    const response = await makeRequest(url, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`CRM API returned ${response.status}: ${response.data}`);
    }
    
    const data = JSON.parse(response.data);
    
    // Filter for discovery calls (lead_gen_meeting type)
    const discoveryCalls = data.data.filter(event => 
      event.type === 'lead_gen_meeting' && 
      event.status !== 'completed' &&
      new Date(event.date) > now
    );
    
    log(`Found ${discoveryCalls.length} upcoming discovery calls in next ${CONFIG.PREP_WINDOW_MINUTES} minutes`);
    return discoveryCalls;
    
  } catch (error) {
    log(`Error fetching upcoming meetings: ${error.message}`);
    return [];
  }
}

// Get contact details from CRM
async function getContactDetails(contactId, sessionCookie) {
  try {
    if (!contactId) return null;
    
    const url = `${CONFIG.CRM_BASE_URL}/api/contacts/${contactId}`;
    const response = await makeRequest(url, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 200) {
      return JSON.parse(response.data);
    }
  } catch (error) {
    log(`Error fetching contact details: ${error.message}`);
  }
  return null;
}

// Research company website (simplified version of call-prep.js logic)
async function fetchWebsiteContent(company) {
  if (!company) return { url: null, content: null, success: false };
  
  try {
    const slug = company.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const possibleDomains = [
      `${slug}.com`,
      `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      `${company.toLowerCase().replace(/\s+/g, '')}.com`,
    ];
    
    for (const domain of possibleDomains) {
      try {
        const response = await makeRequest(`https://${domain}`, { timeout: 5000 });
        if (response.status === 200) {
          const content = stripHtml(response.data);
          return {
            url: `https://${domain}`,
            content: content.substring(0, 1500),
            success: true
          };
        }
      } catch (err) {
        continue;
      }
    }
    
    return { url: null, content: null, success: false };
  } catch (error) {
    return { url: null, content: null, success: false, error: error.message };
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// Determine pricing tier based on company info
function determinePricingTier(websiteContent, contactData) {
  // Default to Growth tier if unable to determine
  let tier = 'Growth';
  
  // Try to extract employee count from website or contact data
  if (websiteContent) {
    const employeeIndicators = [
      { pattern: /(\d+)\+?\s*employees?/i, multiplier: 1 },
      { pattern: /team\s+of\s+(\d+)/i, multiplier: 1 },
      { pattern: /over\s+(\d+)/i, multiplier: 1.2 },
      { pattern: /(\d+)\s*-\s*(\d+)\s*employees?/i, multiplier: 1 }
    ];
    
    for (const indicator of employeeIndicators) {
      const match = websiteContent.match(indicator.pattern);
      if (match) {
        const count = parseInt(match[1]) * indicator.multiplier;
        if (count <= 25) tier = 'Starter';
        else if (count <= 100) tier = 'Growth';
        else if (count <= 500) tier = 'Enterprise';
        else tier = 'Custom';
        break;
      }
    }
  }
  
  // Check for enterprise indicators
  const enterpriseKeywords = ['fortune', 'enterprise', 'corporation', 'multinational', 'global'];
  if (websiteContent && enterpriseKeywords.some(keyword => 
    websiteContent.toLowerCase().includes(keyword))) {
    tier = 'Enterprise';
  }
  
  return tier;
}

// Generate industry-specific talking points
function generateTalkingPoints(company, websiteContent) {
  const talkingPoints = [
    `AI doesn't replace your team - it gives them superpowers`,
    `Our "AI Visibility Audit" is completely free and takes 15 minutes`,
    `Most companies see 25-40% efficiency gains in first 90 days`
  ];
  
  if (websiteContent) {
    const content = websiteContent.toLowerCase();
    
    if (content.includes('manufacturing') || content.includes('factory')) {
      talkingPoints.push('Manufacturing clients typically see ROI in supply chain optimization first');
    } else if (content.includes('healthcare') || content.includes('medical')) {
      talkingPoints.push('Healthcare AI implementations focus heavily on compliance and patient data security');
    } else if (content.includes('technology') || content.includes('software')) {
      talkingPoints.push('Tech companies love our API-first approach and developer-friendly integrations');
    } else if (content.includes('retail') || content.includes('store')) {
      talkingPoints.push('Retail clients see immediate impact in inventory management and customer experience');
    }
  }
  
  return talkingPoints;
}

// Generate the comprehensive call prep brief
function generateCallPrepBrief(meeting, contactData, websiteData) {
  const now = new Date();
  const meetingTime = new Date(meeting.date);
  const timeUntil = Math.round((meetingTime - now) / (1000 * 60));
  
  const company = meeting.company || 'Unknown Company';
  const contact = meeting.contact || 'Unknown Contact';
  const tier = determinePricingTier(websiteData.content, contactData);
  const talkingPoints = generateTalkingPoints(company, websiteData.content);
  
  let brief = `🔥 DISCOVERY CALL PREP - ${company}\n`;
  brief += `⏰ Call in ${timeUntil} minutes (${meetingTime.toLocaleTimeString()})\n\n`;
  
  brief += `👤 CONTACT:\n`;
  brief += `${contact}${contactData?.title ? ` - ${contactData.title}` : ''}\n`;
  brief += `${contactData?.email || 'Email not available'}\n\n`;
  
  brief += `🏢 COMPANY:\n`;
  if (websiteData.success) {
    brief += `${company} - ${websiteData.url}\n`;
    if (websiteData.content) {
      const summary = websiteData.content.split('.').slice(0, 2).join('.').trim();
      brief += `${summary.substring(0, 200)}...\n`;
    }
  } else {
    brief += `${company} - Website not accessible\n`;
  }
  brief += `\n`;
  
  brief += `💰 RECOMMENDED TIER:\n`;
  const pricingInfo = CONFIG.PRICING_TIERS[tier];
  brief += `${tier} (${pricingInfo.price}) - ${pricingInfo.employees} employees\n\n`;
  
  brief += `💡 KEY TALKING POINTS:\n`;
  talkingPoints.forEach(point => brief += `• ${point}\n`);
  brief += `\n`;
  
  brief += `🎯 PAIN POINTS TO EXPLORE:\n`;
  brief += `• Manual processes eating up time\n`;
  brief += `• Data scattered across different systems\n`;
  brief += `• Team productivity bottlenecks\n`;
  brief += `• Scaling operational challenges\n\n`;
  
  brief += `🚀 OUR SOLUTIONS:\n`;
  brief += `• FREE AI Visibility Audit (perfect opener)\n`;
  brief += `• AI Strategy Workshop\n`;
  brief += `• Guided Knowledge Hub\n`;
  brief += `• Implementation Support\n\n`;
  
  brief += `❓ CONVERSATION STARTERS:\n`;
  brief += `• "What's your biggest operational challenge right now?"\n`;
  brief += `• "How are you currently handling [specific process]?"\n`;
  brief += `• "What keeps you up at night about scaling operations?"\n\n`;
  
  brief += `--- Auto-generated ${now.toLocaleString()} ---`;
  
  return brief;
}

// Send SMS using Twilio
async function sendSMS(phoneNumber, message) {
  try {
    const formData = new URLSearchParams({
      To: phoneNumber,
      From: TWILIO_CONFIG.FROM_NUMBER,
      Body: message
    });
    
    const authHeader = Buffer.from(`${TWILIO_CONFIG.SID}:${TWILIO_CONFIG.AUTH_TOKEN}`).toString('base64');
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_CONFIG.SID}/Messages.json`;
    
    const response = await makeRequest(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    if (response.status === 200 || response.status === 201) {
      const result = JSON.parse(response.data);
      log(`SMS sent successfully - SID: ${result.sid}`);
      return { success: true, sid: result.sid };
    } else {
      const error = JSON.parse(response.data);
      log(`SMS send failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  } catch (error) {
    log(`SMS send error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main automation function
async function runCallPrepAutomation() {
  log('Starting call prep automation check...');
  
  try {
    // Authenticate with CRM
    log('Authenticating with CRM...');
    const sessionCookie = await authenticateCRM();
    if (!sessionCookie) {
      log('❌ CRM authentication failed');
      return;
    }
    log('✅ CRM authentication successful');
    
    // Get upcoming discovery calls
    const upcomingCalls = await getUpcomingMeetings(sessionCookie);
    
    if (upcomingCalls.length === 0) {
      log('No upcoming discovery calls found in next 30 minutes');
      return;
    }
    
    for (const meeting of upcomingCalls) {
      log(`Processing meeting: ${meeting.company} - ${meeting.contact}`);
      
      // Check if we already sent a brief for this meeting
      if (wasAlreadySent(meeting.entityId, meeting.date)) {
        log(`Brief already sent for meeting ${meeting.entityId}, skipping`);
        continue;
      }
      
      // Get additional contact details
      const contactData = await getContactDetails(meeting.contactId, sessionCookie);
      
      // Research company website
      log(`Researching website for ${meeting.company}`);
      const websiteData = await fetchWebsiteContent(meeting.company);
      if (websiteData.success) {
        log(`Website found: ${websiteData.url}`);
      } else {
        log(`Website not accessible for ${meeting.company}`);
      }
      
      // Generate the comprehensive brief
      const brief = generateCallPrepBrief(meeting, contactData, websiteData);
      
      // Send SMS to Wolf
      log(`Sending SMS brief to ${CONFIG.WOLF_PHONE}`);
      const smsResult = await sendSMS(CONFIG.WOLF_PHONE, brief);
      
      if (smsResult.success) {
        // Mark as sent to prevent duplicates
        markAsSent(meeting.entityId, meeting.date);
        log(`✅ Brief sent successfully for ${meeting.company} (SID: ${smsResult.sid})`);
      } else {
        log(`❌ Failed to send brief for ${meeting.company}: ${smsResult.error}`);
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    log(`Fatal error in call prep automation: ${error.message}`);
    console.error(error);
  }
  
  log('Call prep automation check complete');
}

// Error handling
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled promise rejection: ${reason}`);
  process.exit(1);
});

// CLI execution
if (require.main === module) {
  runCallPrepAutomation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Automation failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runCallPrepAutomation,
  getUpcomingMeetings,
  generateCallPrepBrief,
  sendSMS
};

// CLI execution
if (require.main === module) {
  runCallPrepAutomation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Automation failed:', error);
      process.exit(1);
    });
}
