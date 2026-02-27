#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Configuration
const CONFIG = {
  plusvibe: {
    baseUrl: 'https://api.plusvibe.ai',
    apiKey: 'process.env.PLUSVIBE_API_KEY',
    workspaceId: '692307182213832a0e2cf618'
  },
  twilio: {
    accountSid: 'process.env.TWILIO_SID',
    authToken: 'process.env.TWILIO_AUTH_TOKEN',
    fromNumber: '+18446620687',
    recipients: ['+13107405587', '+12133028260'] // Mark, Wolf
  },
  campaigns: {
    '6987e237e2259240c66e6013': 'V2 Tech & Finance',
    '6987e238e2259240c66e6014': 'V2 Manufacturing',
    '6987e238e2259240c66e6015': 'V2 Healthcare',
    '6987e23945fba752e310c5ed': 'V2 Services',
    '6987e23a7d33011e42278325': 'V2 Retail'
    // Skipping General: '6987e23be2259240c66e6017' (draft)
  },
  logFile: '/opt/smarty-projects/campaign-health.log',
  thresholds: {
    healthy: 2,
    watch: 3,
    alert: 5
  }
};

// Utility functions
function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, error: 'Invalid JSON' });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function getDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // 30 days back
  
  return {
    start_date: startDate.toISOString().split('T')[0], // YYYY-MM-DD format
    end_date: endDate.toISOString().split('T')[0]
  };
}

async function getCampaignStats(campaignId) {
  const { start_date, end_date } = getDateRange();
  const url = `${CONFIG.plusvibe.baseUrl}/api/v1/analytics/campaign/stats?workspace_id=${CONFIG.plusvibe.workspaceId}&campaign_id=${campaignId}&start_date=${start_date}&end_date=${end_date}`;
  
  try {
    const response = await makeHttpRequest(url, {
      headers: {
        'x-api-key': CONFIG.plusvibe.apiKey
      }
    });

    if (response.status === 200) {
      // The API returns an array of campaigns, find the one we want
      const campaigns = response.data;
      if (Array.isArray(campaigns) && campaigns.length > 0) {
        // Look for our specific campaign in the array
        const campaign = campaigns.find(c => c._id === campaignId) || campaigns[0];
        return campaign;
      } else if (response.data && response.data._id) {
        // Single campaign object
        return response.data;
      } else {
        console.error(`Unexpected response format for campaign ${campaignId}:`, response.data);
        return null;
      }
    } else {
      console.error(`Failed to get stats for campaign ${campaignId}:`, response.data);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching stats for campaign ${campaignId}:`, error.message);
    return null;
  }
}

async function pauseCampaign(campaignId) {
  const url = `${CONFIG.plusvibe.baseUrl}/api/v1/campaign/update/campaign`;
  
  try {
    const body = JSON.stringify({
      campaign_id: campaignId,
      workspace_id: CONFIG.plusvibe.workspaceId,
      status: false
    });

    const response = await makeHttpRequest(url, {
      method: 'PATCH',
      headers: {
        'x-api-key': CONFIG.plusvibe.apiKey,
        'Content-Type': 'application/json'
      },
      body: body
    });

    return response.status === 200 && response.data && response.data.success;
  } catch (error) {
    console.error(`Error pausing campaign ${campaignId}:`, error.message);
    return false;
  }
}

async function sendSMS(message) {
  const promises = CONFIG.twilio.recipients.map(async (recipient) => {
    const auth = Buffer.from(`${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`).toString('base64');
    
    const body = new URLSearchParams({
      From: CONFIG.twilio.fromNumber,
      To: recipient,
      Body: message
    }).toString();

    try {
      const response = await makeHttpRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`, 
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body
        }
      );

      return response.status === 201;
    } catch (error) {
      console.error(`Error sending SMS to ${recipient}:`, error.message);
      return false;
    }
  });

  const results = await Promise.all(promises);
  return results.some(result => result); // Return true if at least one SMS was sent
}

function calculateAlertLevel(bounceRate) {
  if (bounceRate < CONFIG.thresholds.healthy) return 'healthy';
  if (bounceRate < CONFIG.thresholds.watch) return 'watch';
  if (bounceRate < CONFIG.thresholds.alert) return 'alert';
  return 'critical';
}

function determineOverallStatus(campaigns) {
  const levels = campaigns.map(c => c.level);
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('alert')) return 'alert';
  if (levels.includes('watch')) return 'watch';
  return 'healthy';
}

async function logResult(result) {
  try {
    const logEntry = JSON.stringify(result) + '\n';
    fs.appendFileSync(CONFIG.logFile, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

async function main() {
  const startTime = new Date();
  const result = {
    timestamp: startTime.toISOString(),
    overall_status: 'healthy',
    campaigns: [],
    alerts_sent: false,
    campaigns_paused: []
  };

  const { start_date, end_date } = getDateRange();
  console.log(`Starting campaign health check at ${result.timestamp}`);
  console.log(`Analyzing data from ${start_date} to ${end_date}`);

  // Process each campaign
  for (const [campaignId, campaignName] of Object.entries(CONFIG.campaigns)) {
    console.log(`\nChecking campaign: ${campaignName} (${campaignId})`);
    
    const stats = await getCampaignStats(campaignId);
    if (!stats) {
      console.log(`Skipping ${campaignName} - no stats available`);
      continue;
    }

    const campaignData = {
      name: campaignName,
      id: campaignId,
      status: stats.status === 'ACTIVE' ? 'active' : 'paused',
      sent: stats.sent_count || 0,
      bounced: stats.bounced_count || 0,
      bounce_rate: 0,
      replied: stats.replied_count || 0,
      reply_rate: 0,
      contacted: stats.lead_contacted_count || 0,
      not_contacted: (stats.lead_count || 0) - (stats.lead_contacted_count || 0),
      level: 'healthy',
      action_taken: 'none'
    };

    // Calculate rates (avoid division by zero)
    if (campaignData.sent > 0) {
      campaignData.bounce_rate = Math.round((campaignData.bounced / campaignData.sent) * 100 * 100) / 100;
      campaignData.reply_rate = Math.round((campaignData.replied / campaignData.sent) * 100 * 100) / 100;
    }

    // Determine alert level
    campaignData.level = calculateAlertLevel(campaignData.bounce_rate);

    // Auto-pause if critical
    if (campaignData.level === 'critical' && campaignData.status === 'active') {
      console.log(`🚨 CRITICAL: ${campaignName} bounce rate is ${campaignData.bounce_rate}% - attempting to pause`);
      
      const paused = await pauseCampaign(campaignId);
      if (paused) {
        campaignData.status = 'paused';
        campaignData.action_taken = 'paused';
        result.campaigns_paused.push(campaignId);
        console.log(`✅ Successfully paused ${campaignName}`);
      } else {
        console.log(`❌ Failed to pause ${campaignName}`);
      }
    }

    // Send alerts for alert or critical campaigns
    if (campaignData.level === 'alert' || campaignData.level === 'critical') {
      const actionText = campaignData.action_taken === 'paused' ? 'Campaign auto-paused.' : 'Manual review needed.';
      const message = `⚠️ PlusVibe Alert: ${campaignName} bounce rate at ${campaignData.bounce_rate}%. ${actionText} Check dashboard.`;
      
      console.log(`📱 Sending SMS alert for ${campaignName}`);
      const smsSent = await sendSMS(message);
      
      if (smsSent) {
        result.alerts_sent = true;
        campaignData.action_taken = campaignData.action_taken === 'paused' ? 'paused' : 'alerted';
        console.log(`✅ SMS alert sent for ${campaignName}`);
      } else {
        console.log(`❌ Failed to send SMS for ${campaignName}`);
      }
    }

    result.campaigns.push(campaignData);
    
    // Status indicators
    const statusIcon = {
      'healthy': '✅',
      'watch': '⚠️',
      'alert': '🟠',
      'critical': '🚨'
    }[campaignData.level];

    console.log(`${statusIcon} ${campaignName}: ${campaignData.sent} sent, ${campaignData.bounced} bounced (${campaignData.bounce_rate}%), ${campaignData.replied} replied (${campaignData.reply_rate}%) - ${campaignData.level.toUpperCase()}`);
  }

  // Determine overall status
  result.overall_status = determineOverallStatus(result.campaigns);

  // Output JSON result
  console.log('\n=== CAMPAIGN HEALTH MONITOR RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // Log to file
  await logResult(result);

  const endTime = new Date();
  console.log(`\n✅ Health check completed in ${endTime - startTime}ms`);
  console.log(`📝 Log saved to: ${CONFIG.logFile}`);

  // Summary
  const statusCounts = result.campaigns.reduce((acc, c) => {
    acc[c.level] = (acc[c.level] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n📊 Summary: ${Object.entries(statusCounts).map(([level, count]) => `${count} ${level}`).join(', ')}`);
  
  if (result.alerts_sent) {
    console.log(`📱 ${result.campaigns_paused.length} campaigns paused, SMS alerts sent to Mark & Wolf`);
  }

  // Exit with appropriate code
  if (result.overall_status === 'critical') process.exit(2);
  if (result.overall_status === 'alert') process.exit(1);
  process.exit(0);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(3);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(3);
});

// Run the main function
main().catch(console.error);