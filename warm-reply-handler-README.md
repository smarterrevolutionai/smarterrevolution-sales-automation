# Auto CRM Pipeline - PlusVibe Warm Replies Handler

## Overview

This script automatically processes warm replies from PlusVibe and creates corresponding records in the Smarter CRM system. It runs on the VPS and handles the complete workflow from fetching interested emails to creating contacts, deals, activities, and follow-up tasks.

## Location

```
/opt/smarty-projects/warm-reply-handler.js
```

## How It Works

1. **Fetches INTERESTED emails** from PlusVibe API
2. **Checks for existing contacts** in CRM by email address
3. **Creates new contacts** if they don't exist
4. **Creates deals** worth $4997 in "Discovery Call Booked" stage
5. **Creates activities** documenting the warm reply
6. **Creates high-priority follow-up tasks** for 3 days out
7. **Tracks processed emails** to avoid duplicates

## Usage

### Manual Run
```bash
ssh -i /home/node/.openclaw/workspace/.ssh/id_ed25519_vps -p 2222 smarty@72.62.252.232
cd /opt/smarty-projects
node warm-reply-handler.js
```

### Automated Run (Recommended)
Add to crontab to run every 30 minutes:
```bash
# Edit crontab
crontab -e

# Add this line to run every 30 minutes
*/30 * * * * cd /opt/smarty-projects && node warm-reply-handler.js >> /var/log/warm-reply-handler.log 2>&1
```

## Output Example

```
🚀 Starting PlusVibe Warm Replies Handler...
📁 Loaded 4 previously processed emails
🔐 Logging into CRM...
✅ Successfully logged into CRM
🔍 Getting discovery stage ID...
✅ Found discovery stage: Discovery Call Booked
📧 Fetching INTERESTED emails from PlusVibe...
📬 Found 4 INTERESTED emails from PlusVibe
🔄 Processing 4 INTERESTED emails...
⏭️  Email 698f57056f6dd052148ef5b2 already processed, skipping
⏭️  Email 698f56f56f6dd052148ef5b1 already processed, skipping
⏭️  Email 698f3e2dda8cb04bfa0abbcf already processed, skipping
⏭️  Email 698f3e2dda8cb04bfa0abbcb already processed, skipping
💾 Saved 4 processed emails to file
✅ Warm reply processing completed successfully!
```

## Configuration

The script is configured with these endpoints:

- **PlusVibe API**: `https://api.plusvibe.ai/api/v1/unibox/emails`
- **CRM API**: `http://localhost:3000/api`
- **Processed emails file**: `/home/smarty/processed-warm-replies.json`

## What Gets Created in CRM

For each warm reply:

### 1. Contact (if not exists)
- **Email**: From PlusVibe lead email
- **First/Last Name**: Extracted from email address
- **Company**: Extracted from domain name
- **Status**: "qualified"
- **Source**: "cold-email"
- **Notes**: "Warm reply from PlusVibe campaign"

### 2. Deal
- **Name**: "{Company} - AI Operations"
- **Value**: $4,997
- **Probability**: 20%
- **Stage**: "Discovery Call Booked"

### 3. Activity
- **Type**: "email"
- **Subject**: "Warm reply received from PlusVibe campaign"
- **Body**: Details about the prospect's response

### 4. Follow-up Task
- **Title**: "Follow up with {Name} at {Company}"
- **Due Date**: 3 days from today
- **Priority**: "high"

## Monitoring

- Check logs with: `tail -f /var/log/warm-reply-handler.log`
- Processed emails are tracked in: `/home/smarty/processed-warm-replies.json`
- Script runs in about 5-10 seconds typically

## Troubleshooting

### Script Won't Run
```bash
# Check permissions
ls -la /opt/smarty-projects/warm-reply-handler.js

# Should show: -rwxr-xr-x 1 smarty smarty
```

### CRM Login Issues
- Verify CRM is running: `sudo docker ps | grep crm`
- Check CRM logs: `sudo docker logs smarter-crm`

### PlusVibe API Issues
- Verify API key in script configuration
- Check PlusVibe workspace ID

## Security Notes

- API keys are hardcoded in script (secure server environment)
- CRM credentials are stored in script (internal network only)
- Script runs with `smarty` user permissions
- File permissions prevent other users from reading script

## Maintenance

To update the script:
1. Upload new version to VPS
2. Test with: `node warm-reply-handler.js`
3. Verify no errors in output

---

*Last updated: February 13, 2026*