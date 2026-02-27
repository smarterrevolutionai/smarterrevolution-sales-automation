#!/usr/bin/env node

/**
 * Meeting No-Show Recovery Script
 * Detects discovery calls that were no-shows and triggers recovery actions
 * 
 * CLI Usage: 
 *   node noshow-recovery.js                    # Report no-shows only
 *   node noshow-recovery.js --check-only       # Report no-shows only (explicit)
 *   node noshow-recovery.js --auto-sms         # Send SMS + create activities
 * 
 * Module Usage: 
 *   const { checkNoShows } = require('./noshow-recovery.js')
 *   const results = await checkNoShows({ autoSms: false })
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const CRM_CREDENTIALS = {
  username: 'admin',
  password: 'WorkSmarter2025!'
};

const NO_SHOW_THRESHOLD_MINUTES = 30;

const SMS_TEMPLATE = "Hey {firstName}, looks like we missed each other on the call today. No worries at all! Here's my calendar to find another time that works: https://smarterrevolutionai.com/book - Henry";

// Recovery activity templates
const RECOVERY_ACTIVITIES = {
  emailFlag: {
    type: 'follow_up',
    subject: 'No-show follow-up needed',
    body: 'Discovery call was a no-show. Email follow-up required.'
  },
  rebookingFlag: {
    type: 'follow_up',
    subject: 'Rebooking attempt needed',
    body: 'Discovery call was a no-show. Attempt rebooking required.'
  }
};

/**
 * Make HTTP request with promise
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
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

/**
 * Authenticate with CRM and get session cookie
 */
async function authenticateCRM() {
  console.log('🔑 Authenticating with CRM...');
  
  const loginData = JSON.stringify(CRM_CREDENTIALS);
  
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
      throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.data)}`);
    }

    // Extract sr_session cookie
    const setCookieHeader = response.headers['set-cookie'];
    if (!setCookieHeader) {
      throw new Error('No cookies returned from login');
    }

    const sessionCookie = setCookieHeader.find(cookie => 
      cookie.startsWith('sr_session=')
    );

    if (!sessionCookie) {
      throw new Error('sr_session cookie not found');
    }

    const cookieValue = sessionCookie.split(';')[0];
    console.log('✅ CRM authentication successful');
    return cookieValue;
    
  } catch (error) {
    console.error('❌ CRM authentication failed:', error.message);
    throw error;
  }
}

/**
 * Fetch deals from CRM
 */
async function fetchDeals(sessionCookie) {
  console.log('📊 Fetching deals with "Discovery Call Booked" stage...');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/deals',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch deals: ${response.status}`);
    }

    const dealsData = response.data.data || response.data;
    const deals = Array.isArray(dealsData) ? dealsData : [];
    const discoveryDeals = deals.filter(deal => 
      deal.stage?.name === 'Discovery Call Booked'
    );

    console.log(`📋 Found ${discoveryDeals.length} deals with "Discovery Call Booked" stage`);
    return discoveryDeals;
    
  } catch (error) {
    console.error('❌ Failed to fetch deals:', error.message);
    throw error;
  }
}

/**
 * Fetch activities for a deal
 */
async function fetchActivities(dealId, sessionCookie) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/activities?dealId=${dealId}`,
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status !== 200) {
      console.warn(`⚠️  Failed to fetch activities for deal ${dealId}: ${response.status}`);
      return [];
    }

    const activitiesData = response.data.data || response.data;
    return Array.isArray(activitiesData) ? activitiesData : [];
    
  } catch (error) {
    console.warn(`⚠️  Error fetching activities for deal ${dealId}:`, error.message);
    return [];
  }
}

/**
 * Create activity in CRM
 */
async function createActivity(activity, sessionCookie) {
  const activityData = JSON.stringify(activity);
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/activities',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(activityData),
      'Cookie': sessionCookie
    }
  };

  try {
    const response = await makeRequest(options, activityData);
    
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Failed to create activity: ${response.status}`);
    }

    return response.data;
    
  } catch (error) {
    console.error('❌ Failed to create activity:', error.message);
    throw error;
  }
}

/**
 * Send SMS via sms-touch.js
 */
async function sendRecoverySMS(deal, firstName) {
  if (!deal.contact || !deal.contact.phone) {
    console.log(`📱 No phone number for ${firstName}, skipping SMS`);
    return { success: false, reason: 'no_phone' };
  }

  const phone = deal.contact.phone;
  const company = deal.contact.company || 'your business';

  console.log(`📱 Sending recovery SMS to ${firstName} at ${phone}...`);

  try {
    const command = `node /opt/smarty-projects/sms-touch.js --to="${phone}" --name="${firstName}" --template="initial" --company="${company}"`;
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 30000 // 30 second timeout
    });

    console.log(`✅ SMS sent successfully to ${firstName}`);
    return { success: true, output };
    
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${firstName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if deal is a no-show
 */
function isNoShow(deal, activities) {
  const now = new Date();
  
  // Find scheduled meeting activities
  const scheduledActivities = activities.filter(activity => {
    const isScheduled = activity.type === 'meeting' || 
                       activity.type === 'discovery_call' ||
                       (activity.subject && activity.subject.toLowerCase().includes('discovery')) ||
                       (activity.subject && activity.subject.toLowerCase().includes('call'));
    
    if (!isScheduled || !activity.scheduledAt) {
      return false;
    }

    const scheduledTime = new Date(activity.scheduledAt);
    const minutesAgo = (now - scheduledTime) / (1000 * 60);
    
    return minutesAgo > NO_SHOW_THRESHOLD_MINUTES;
  });

  if (scheduledActivities.length === 0) {
    return { isNoShow: false, reason: 'no_scheduled_meeting' };
  }

  // Find the most recent scheduled activity
  const recentScheduled = scheduledActivities.sort((a, b) => 
    new Date(b.scheduledAt) - new Date(a.scheduledAt)
  )[0];

  // Check for completion activities after the scheduled time
  const scheduledTime = new Date(recentScheduled.scheduledAt);
  const completionActivities = activities.filter(activity => {
    const activityTime = new Date(activity.createdAt);
    const isCompletion = activity.type === 'call_completed' || 
                        activity.type === 'discovery_call' ||
                        (activity.subject && activity.subject.toLowerCase().includes('call completed')) ||
                        (activity.subject && activity.subject.toLowerCase().includes('discovery completed'));
    
    return isCompletion && activityTime > scheduledTime;
  });

  const isNoShow = completionActivities.length === 0;
  
  return {
    isNoShow,
    scheduledActivity: recentScheduled,
    reason: isNoShow ? 'no_completion_activity' : 'completion_found'
  };
}

/**
 * Main function to check for no-shows
 */
async function checkNoShows(options = {}) {
  const { autoSms = false } = options;
  
  console.log('🔍 Starting no-show recovery check...');
  console.log(`⚙️  Mode: ${autoSms ? 'AUTO-SMS + ACTIONS' : 'REPORT ONLY'}\n`);
  
  try {
    const sessionCookie = await authenticateCRM();
    const deals = await fetchDeals(sessionCookie);
    
    const results = {
      totalChecked: deals.length,
      noShows: [],
      skipped: [],
      errors: [],
      actions: {
        smssSent: 0,
        emailFlagsCreated: 0,
        rebookingFlagsCreated: 0
      }
    };

    console.log('🔎 Analyzing deals for no-shows...\n');
    
    for (const deal of deals) {
      const firstName = deal.contact?.firstName || 'there';
      console.log(`📋 Checking: ${firstName} - Deal #${deal.id}`);
      
      try {
        const activities = await fetchActivities(deal.id, sessionCookie);
        const noShowCheck = isNoShow(deal, activities);
        
        if (!noShowCheck.isNoShow) {
          console.log(`   ✅ Not a no-show: ${noShowCheck.reason}\n`);
          if (noShowCheck.reason === 'no_scheduled_meeting') {
            results.skipped.push({
              deal,
              reason: 'No scheduled meeting found'
            });
          }
          continue;
        }

        console.log(`   ❌ NO-SHOW DETECTED: ${noShowCheck.reason}`);
        
        const noShowData = {
          deal,
          scheduledActivity: noShowCheck.scheduledActivity,
          reason: noShowCheck.reason,
          recoveryActions: {
            immediateSms: { needed: true, completed: false },
            emailFlag: { needed: true, completed: false },
            rebookingFlag: { needed: true, completed: false }
          }
        };

        // Execute recovery actions if auto-sms is enabled
        if (autoSms) {
          console.log('   🚀 Executing recovery actions...');
          
          // 1. Send immediate SMS
          const smsResult = await sendRecoverySMS(deal, firstName);
          noShowData.recoveryActions.immediateSms.completed = smsResult.success;
          noShowData.recoveryActions.immediateSms.result = smsResult;
          
          if (smsResult.success) {
            results.actions.smssSent++;
          }

          // 2. Create email follow-up flag
          try {
            const emailActivity = {
              ...RECOVERY_ACTIVITIES.emailFlag,
              contactId: deal.contact?.id,
              dealId: deal.id
            };
            await createActivity(emailActivity, sessionCookie);
            noShowData.recoveryActions.emailFlag.completed = true;
            results.actions.emailFlagsCreated++;
            console.log('   ✅ Email follow-up flag created');
          } catch (error) {
            console.log('   ❌ Failed to create email flag:', error.message);
            noShowData.recoveryActions.emailFlag.error = error.message;
          }

          // 3. Create rebooking flag
          try {
            const rebookActivity = {
              ...RECOVERY_ACTIVITIES.rebookingFlag,
              contactId: deal.contact?.id,
              dealId: deal.id
            };
            await createActivity(rebookActivity, sessionCookie);
            noShowData.recoveryActions.rebookingFlag.completed = true;
            results.actions.rebookingFlagsCreated++;
            console.log('   ✅ Rebooking flag created');
          } catch (error) {
            console.log('   ❌ Failed to create rebooking flag:', error.message);
            noShowData.recoveryActions.rebookingFlag.error = error.message;
          }
        }

        results.noShows.push(noShowData);
        console.log('');
        
      } catch (error) {
        console.error(`   ❌ Error processing deal ${deal.id}:`, error.message);
        results.errors.push({
          dealId: deal.id,
          error: error.message
        });
      }
    }

    // Summary
    console.log('📊 NO-SHOW RECOVERY SUMMARY');
    console.log('================================');
    console.log(`Total deals checked: ${results.totalChecked}`);
    console.log(`No-shows detected: ${results.noShows.length}`);
    console.log(`Deals skipped: ${results.skipped.length}`);
    console.log(`Processing errors: ${results.errors.length}`);
    
    if (autoSms) {
      console.log('\n🚀 ACTIONS TAKEN:');
      console.log(`SMS messages sent: ${results.actions.smssSent}`);
      console.log(`Email flags created: ${results.actions.emailFlagsCreated}`);
      console.log(`Rebooking flags created: ${results.actions.rebookingFlagsCreated}`);
    }

    if (results.noShows.length > 0) {
      console.log('\n🔍 NO-SHOW DETAILS:');
      results.noShows.forEach((noShow, index) => {
        const { deal, scheduledActivity } = noShow;
        const firstName = deal.contact?.firstName || 'Unknown';
        const phone = deal.contact?.phone || 'No phone';
        const scheduledTime = scheduledActivity ? 
          new Date(scheduledActivity.scheduledAt).toLocaleString() : 'Unknown';
        
        console.log(`\n${index + 1}. ${firstName} (Deal #${deal.id})`);
        console.log(`   Phone: ${phone}`);
        console.log(`   Scheduled: ${scheduledTime}`);
        console.log(`   Recovery needed: SMS, Email flag, Rebooking flag`);
        
        if (autoSms) {
          console.log(`   SMS sent: ${noShow.recoveryActions.immediateSms.completed ? '✅' : '❌'}`);
          console.log(`   Email flag: ${noShow.recoveryActions.emailFlag.completed ? '✅' : '❌'}`);
          console.log(`   Rebooking flag: ${noShow.recoveryActions.rebookingFlag.completed ? '✅' : '❌'}`);
        }
      });
    }

    return results;
    
  } catch (error) {
    console.error('❌ No-show check failed:', error.message);
    throw error;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const autoSms = args.includes('--auto-sms');
  
  if (checkOnly && autoSms) {
    console.error('❌ Cannot use both --check-only and --auto-sms flags');
    process.exit(1);
  }

  checkNoShows({ autoSms })
    .then(results => {
      // Output JSON for programmatic use
      if (process.env.NODE_ENV === 'json') {
        console.log(JSON.stringify(results, null, 2));
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    });
}

// Module export
module.exports = { checkNoShows };