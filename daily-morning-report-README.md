# Daily Morning Report Script

**Location:** `/opt/smarty-projects/daily-morning-report.js`

## What it does:
1. Pulls PlusVibe campaign stats for last 24 hours
2. Fetches warm leads from PlusVibe (INTERESTED label)
3. Checks system health (Website, CRM, Twilio, PlusVibe)
4. Generates a formatted daily report

## Manual execution:
```bash
cd /opt/smarty-projects
node daily-morning-report.js
```

## OpenClaw Cron Job Setup:
Add this to OpenClaw cron configuration to run daily at 8 AM ET:

```yaml
jobs:
  daily_morning_report:
    schedule: "0 13 * * *"  # 8 AM ET = 1 PM UTC
    command: "cd /opt/smarty-projects && node daily-morning-report.js"
    description: "Generate daily sales & marketing report"
    notify_on_failure: true
```

## Output format:
```
📊 Smarter Revolution Daily Report - Friday, February 13, 2026

CAMPAIGNS (Last 24h):
- Sent: X | Bounced: X (X%) | Replied: X | Positive: X

WARM LEADS:
- X interested leads in Unibox
  • Name (Company) - email@domain.com

SYSTEM HEALTH:
- Website: ✅
- CRM: ✅  
- Twilio: ✅
- PlusVibe: ✅
```

## Dependencies:
- Node.js v20+ (native fetch support)
- No npm packages required
- Uses PlusVibe API key: 928fd41c-ca0ebf02-beec065e-c7062e63

Created: February 13, 2026
