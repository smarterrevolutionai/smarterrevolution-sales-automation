#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const isQuiet = args.includes('--quiet');

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            data: data ? JSON.parse(data) : null,
            headers: res.headers
          };
          resolve(result);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Helper function to make HEAD request for uptime check
function checkWebsite(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'HEAD',
      timeout: 5000
    };
    
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      resolve({
        status: res.statusCode,
        responseTime
      });
    });
    
    req.on('error', () => {
      resolve({
        status: 'ERROR',
        responseTime: 'N/A'
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'TIMEOUT',
        responseTime: 'N/A'
      });
    });
    
    req.end();
  });
}

// Get current date/time in ET
function getETDateTime() {
  const now = new Date();
  const etDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  const etTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
  
  return {
    date: etDate,
    time: etTime,
    dateForFile: now.toISOString().split('T')[0] // YYYY-MM-DD
  };
}

// Calculate percentage safely
function calculatePercentage(part, total) {
  if (!total || total === 0) return 'N/A';
  return Math.round((part / total) * 100);
}

// Calculate days since last activity
function daysSince(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Main function to gather all data
async function gatherData() {
  const data = {
    plusvibe: { campaigns: null, unibox: null },
    crm: { deals: null, activities: null, auth_token: null },
    website: null
  };

  try {
    // 1. PlusVibe Campaign Stats
    const campaignOptions = {
      hostname: 'api.plusvibe.ai',
      port: 443,
      path: '/api/v1/analytics/campaign-stats?workspace_id=692307182213832a0e2cf618',
      method: 'GET',
      protocol: 'https:',
      headers: {
        'x-api-key': 'process.env.PLUSVIBE_API_KEY'
      }
    };
    
    const campaignResult = await makeRequest(campaignOptions);
    if (campaignResult.statusCode === 200) {
      data.plusvibe.campaigns = campaignResult.data;
    }
  } catch (e) {
    console.error('PlusVibe campaigns error:', e.message);
  }

  try {
    // 2. PlusVibe Unread Unibox
    const uniboxOptions = {
      hostname: 'api.plusvibe.ai',
      port: 443,
      path: '/api/v1/unibox/emails?workspace_id=692307182213832a0e2cf618&email_type=received&is_read=0',
      method: 'GET',
      protocol: 'https:',
      headers: {
        'x-api-key': 'process.env.PLUSVIBE_API_KEY'
      }
    };
    
    const uniboxResult = await makeRequest(uniboxOptions);
    if (uniboxResult.statusCode === 200) {
      data.plusvibe.unibox = uniboxResult.data;
    }
  } catch (e) {
    console.error('PlusVibe unibox error:', e.message);
  }

  try {
    // 3. CRM Auth
    const authOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      protocol: 'http:',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const authData = JSON.stringify({
      username: 'admin',
      password: 'WorkSmarter2025!'
    });
    
    const authResult = await makeRequest(authOptions, authData);
    if (authResult.statusCode === 200 && authResult.data && authResult.data.token) {
      data.crm.auth_token = authResult.data.token;
      
      // 4. Get CRM Deals
      const dealsOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/deals',
        method: 'GET',
        protocol: 'http:',
        headers: {
          'Authorization': `Bearer ${data.crm.auth_token}`
        }
      };
      
      const dealsResult = await makeRequest(dealsOptions);
      if (dealsResult.statusCode === 200) {
        data.crm.deals = dealsResult.data;
      }
      
      // 5. Get CRM Activities
      const activitiesOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/activities?limit=20',
        method: 'GET',
        protocol: 'http:',
        headers: {
          'Authorization': `Bearer ${data.crm.auth_token}`
        }
      };
      
      const activitiesResult = await makeRequest(activitiesOptions);
      if (activitiesResult.statusCode === 200) {
        data.crm.activities = activitiesResult.data;
      }
    }
  } catch (e) {
    console.error('CRM error:', e.message);
  }

  try {
    // 6. Website Uptime Check
    data.website = await checkWebsite('https://smarterrevolutionai.com');
  } catch (e) {
    console.error('Website check error:', e.message);
    data.website = { status: 'ERROR', responseTime: 'N/A' };
  }

  return data;
}

// Generate formatted text report
function generateTextReport(data, dateTime) {
  const { date, time } = dateTime;
  
  let report = `📊 DAILY SALES & MARKETING REPORT\n`;
  report += `Date: ${date} | Generated: ${time} ET\n\n`;
  
  // EMAIL CAMPAIGNS
  report += `━━━ EMAIL CAMPAIGNS ━━━\n`;
  if (data.plusvibe.campaigns) {
    const camps = data.plusvibe.campaigns;
    const sent24h = camps.sent_24h || 0;
    const total = camps.total_sent || 0;
    const opened24h = camps.opened_24h || 0;
    const replied24h = camps.replied_24h || 0;
    const bounced24h = camps.bounced_24h || 0;
    
    const openRate = calculatePercentage(opened24h, sent24h);
    const replyRate = calculatePercentage(replied24h, sent24h);
    const bounceRate = calculatePercentage(bounced24h, sent24h);
    
    report += `Sent (24h): ${sent24h} | Total: ${total}\n`;
    report += `Opened (24h): ${opened24h} | Open Rate: ${openRate}%\n`;
    report += `Replied (24h): ${replied24h} | Reply Rate: ${replyRate}%\n`;
    report += `Bounced (24h): ${bounced24h} | Bounce Rate: ${bounceRate}%\n`;
  } else {
    report += `Sent (24h): N/A | Total: N/A\n`;
    report += `Opened (24h): N/A | Open Rate: N/A\n`;
    report += `Replied (24h): N/A | Reply Rate: N/A\n`;
    report += `Bounced (24h): N/A | Bounce Rate: N/A\n`;
  }
  
  // UNIBOX
  report += `\n━━━ UNIBOX ━━━\n`;
  if (data.plusvibe.unibox && data.plusvibe.unibox.emails) {
    const unreadCount = data.plusvibe.unibox.emails.length;
    report += `Unread Replies: ${unreadCount}\n`;
    
    if (unreadCount > 0) {
      report += `⚡ New replies needing attention:\n`;
      data.plusvibe.unibox.emails.slice(0, 5).forEach(email => {
        const name = email.from_name || 'Unknown';
        const company = email.from_company || 'Unknown Company';
        const snippet = email.snippet ? email.snippet.substring(0, 50) + '...' : 'No preview';
        report += `  - ${name} (${company}) — "${snippet}"\n`;
      });
    }
  } else {
    report += `Unread Replies: N/A\n`;
  }
  
  // CRM PIPELINE
  report += `\n━━━ CRM PIPELINE ━━━\n`;
  if (data.crm.deals && Array.isArray(data.crm.deals)) {
    const deals = data.crm.deals;
    const totalDeals = deals.length;
    const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    
    // Count by stage
    const stageCount = deals.reduce((acc, deal) => {
      const stage = deal.stage || 'Unknown';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    
    report += `Total Deals: ${totalDeals} | Pipeline Value: $${totalValue.toLocaleString()}\n`;
    report += `By Stage:\n`;
    report += `  Lead Identified: ${stageCount['Lead Identified'] || 0}\n`;
    report += `  Discovery Call Booked: ${stageCount['Discovery Call Booked'] || 0}\n`;
    report += `  Discovery Call Complete: ${stageCount['Discovery Call Complete'] || 0}\n`;
    report += `  Proposal Sent: ${stageCount['Proposal Sent'] || 0}\n`;
    report += `  Closed Won: ${stageCount['Closed Won'] || 0}\n`;
  } else {
    report += `Total Deals: N/A | Pipeline Value: N/A\n`;
    report += `By Stage:\n`;
    report += `  Lead Identified: N/A\n`;
    report += `  Discovery Call Booked: N/A\n`;
    report += `  Discovery Call Complete: N/A\n`;
    report += `  Proposal Sent: N/A\n`;
    report += `  Closed Won: N/A\n`;
  }
  
  // FOLLOW-UPS NEEDED
  report += `\n━━━ FOLLOW-UPS NEEDED ━━━\n`;
  if (data.crm.deals && Array.isArray(data.crm.deals)) {
    const staleDeals = data.crm.deals.filter(deal => {
      if (!deal.last_activity_date) return true;
      const daysSinceActivity = daysSince(deal.last_activity_date);
      return daysSinceActivity >= 7;
    });
    
    report += `Stale deals (7+ days no activity): ${staleDeals.length}\n`;
    staleDeals.slice(0, 5).forEach(deal => {
      const days = daysSince(deal.last_activity_date);
      report += `  - ${deal.name || 'Unnamed Deal'} — ${days} days silent\n`;
    });
  } else {
    report += `Stale deals (7+ days no activity): N/A\n`;
  }
  
  // WEBSITE
  report += `\n━━━ WEBSITE ━━━\n`;
  if (data.website) {
    if (data.website.status === 200) {
      report += `Status: ✅ Online (${data.website.responseTime}ms)\n`;
    } else {
      report += `Status: ❌ DOWN\n`;
    }
  } else {
    report += `Status: ❌ DOWN\n`;
  }
  
  return report;
}

// Generate JSON report
function generateJsonReport(data, dateTime) {
  return JSON.stringify({
    generated: {
      date: dateTime.date,
      time: dateTime.time,
      timestamp: new Date().toISOString()
    },
    email_campaigns: data.plusvibe.campaigns || null,
    unibox: data.plusvibe.unibox || null,
    crm_pipeline: data.crm.deals || null,
    crm_activities: data.crm.activities || null,
    website_status: data.website || null
  }, null, 2);
}

// Save report to file
function saveReport(content, dateTime, isJson) {
  const reportsDir = '/opt/smarty-projects/daily-reports';
  const extension = isJson ? 'json' : 'txt';
  const filename = `report-${dateTime.dateForFile}.${extension}`;
  const filepath = path.join(reportsDir, filename);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  fs.writeFileSync(filepath, content, 'utf8');
  return filepath;
}

// Main execution
async function main() {
  try {
    const dateTime = getETDateTime();
    
    if (!isQuiet) {
      console.log('🔄 Gathering daily report data...');
    }
    
    const data = await gatherData();
    
    const report = isJson ? 
      generateJsonReport(data, dateTime) : 
      generateTextReport(data, dateTime);
    
    // Save to file
    const savedPath = saveReport(report, dateTime, isJson);
    
    if (!isQuiet) {
      console.log(report);
      console.log(`\n📁 Report saved to: ${savedPath}`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error generating daily report:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { gatherData, generateTextReport, generateJsonReport };