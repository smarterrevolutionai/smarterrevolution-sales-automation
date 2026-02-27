# Meeting No-Show Recovery Script

**Location:** `/opt/smarty-projects/noshow-recovery.js`

## Purpose
Automatically detects discovery calls that were no-shows and triggers recovery actions to re-engage prospects.

## How It Works

1. **Detection Logic:** 
   - Finds deals with stage "Discovery Call Booked"
   - Looks for scheduled meeting activities older than 30 minutes
   - Checks if there's a "call_completed" or "discovery_call" activity after the scheduled time
   - If no completion activity found = NO-SHOW

2. **Recovery Actions:**
   - **Immediate:** Send SMS via sms-touch.js
   - **1 hour later:** Flag for email follow-up
   - **2 days later:** Flag for rebooking attempt

## Usage

### CLI Mode
```bash
# Report no-shows only (default)
node noshow-recovery.js
node noshow-recovery.js --check-only

# Send SMS + create activities
node noshow-recovery.js --auto-sms
```

### Module Mode
```javascript
const { checkNoShows } = require('./noshow-recovery.js');

// Check only
const results = await checkNoShows({ autoSms: false });

// Take actions
const results = await checkNoShows({ autoSms: true });

console.log(`Found ${results.noShows.length} no-shows`);
console.log(`Sent ${results.actions.smssSent} SMS messages`);
```

## Recovery Templates

### SMS Template (via sms-touch.js)
"Hey {firstName}, looks like we missed each other on the call today. No worries at all! Here's my calendar to find another time that works: https://smarterrevolutionai.com/book - Henry"

### Activity Flags
1. **Email follow-up:** "No-show follow-up needed" 
2. **Rebooking:** "Rebooking attempt needed"

## Dependencies

- **CRM API:** http://localhost:3000 (must be running)
- **sms-touch.js:** /opt/smarty-projects/sms-touch.js (for SMS sending)
- **Auth:** admin/WorkSmarter2025! credentials

## Example Output

```
🔍 Starting no-show recovery check...
⚙️  Mode: AUTO-SMS + ACTIONS

🔑 Authenticating with CRM...
✅ CRM authentication successful
📊 Fetching deals with "Discovery Call Booked" stage...
📋 Found 3 deals with "Discovery Call Booked" stage

📋 Checking: John - Deal #abc123
   ❌ NO-SHOW DETECTED: no_completion_activity
   🚀 Executing recovery actions...
   📱 Sending recovery SMS to John at +15551234567...
   ✅ SMS sent successfully to John
   ✅ Email follow-up flag created
   ✅ Rebooking flag created

📊 NO-SHOW RECOVERY SUMMARY
================================
Total deals checked: 3
No-shows detected: 1
🚀 ACTIONS TAKEN:
SMS messages sent: 1
Email flags created: 1
Rebooking flags created: 1
```

## Integration Notes

- Script uses existing sms-touch.js for SMS sending
- SMS template matches Henry's voice and includes booking link
- Activities are logged to CRM for follow-up tracking
- Handles phone number formatting via sms-touch.js
- No external dependencies - pure Node.js

## Deployment

Script is deployed and ready to use:
- ✅ Saved to `/opt/smarty-projects/noshow-recovery.js`
- ✅ Executable permissions set
- ✅ Tested with current CRM data
- ✅ Both CLI and module modes working
- ✅ SMS integration tested

## Cron Integration (Optional)

Add to crontab for automatic checking:
```bash
# Check every hour during business hours (9 AM - 6 PM ET)
0 9-18 * * 1-5 cd /opt/smarty-projects && node noshow-recovery.js --auto-sms >> /var/log/noshow-recovery.log 2>&1
```