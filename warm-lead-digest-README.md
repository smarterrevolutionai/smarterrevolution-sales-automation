# 🌅 Warm Lead Daily Digest System

Automated daily digest that gathers warm leads from PlusVibe and CRM, analyzes follow-up needs, and sends formatted summaries via SMS to Mark and Wolf at 8am ET Mon-Fri.

## 📋 What It Does

The system collects and analyzes:
- **PlusVibe INTERESTED emails** (last 7 days)
- **CRM open deals** with stage and last activity
- **Follow-up analysis** (3+ days since activity)
- **Stale deal alerts** (7+ days since activity)
- **Pipeline value calculation**

## 🚀 Usage

```bash
# Send full digest to Mark and Wolf
node warm-lead-digest.js

# Test without sending SMS
node warm-lead-digest.js --dry-run

# Show detailed output
node warm-lead-digest.js --verbose

# Show help
node warm-lead-digest.js --help
```

## 📱 Recipients

- **Mark**: +13107405587
- **Wolf**: +12133028260

## 📊 Data Sources

### PlusVibe API
- **Endpoint**: `https://api.plusvibe.ai/api/v1/unibox/emails`
- **Auth**: x-api-key header
- **Filters**: INTERESTED label, last 7 days, incoming only

### CRM API
- **Endpoint**: `http://localhost:3000/api/deals` & `/api/activities`
- **Auth**: Session-based login (admin/WorkSmarter2025!)
- **Data**: Open deals, activities, follow-up analysis

### Twilio SMS
- **Service**: Twilio SMS API
- **From**: +18446620687
- **Auth**: Account SID + Auth Token (hardcoded)

## 📄 Sample Digest

```
🌅 WARM LEAD DIGEST - Mon, Feb 17

📧 INTERESTED EMAILS (7 days)
• John Smith (Acme Corp)
  "Re: AI Audit Discussion..."
• Jane Doe (TechCorp)
  "Interested in automation..."
• +3 more interested emails

🔥 ACTIVE PIPELINE (9)
• Acme Corp - Discovery Call Booked
  $25,000 • 1d ago
• TechCorp - Proposal Sent
  $50,000 • 2d ago
• +7 more active deals

⏰ FOLLOW-UP NEEDED (2)
• OldCorp - Discovery Call Complete
  4 days since last activity
• SlowCorp - Lead Identified
  5 days since last activity

🚨 STALE DEALS (1)
• DeadCorp - Proposal Sent
  14 days stale!

📊 SUMMARY
• 5 new interested emails
• 12 total open deals
• $150,000 total pipeline value
• 2 need follow-up
• 1 stale deals

📱 View full CRM: http://72.62.252.232:3000
```

## 🔧 Technical Details

### Dependencies
- **Node.js**: Built-in modules only (http, fs)
- **APIs**: PlusVibe, CRM, Twilio
- **No npm packages required**

### Follow-up Rules
- **Active**: 0-2 days since last activity
- **Follow-up needed**: 3-6 days since last activity  
- **Stale**: 7+ days since last activity

### Error Handling
- API failures are logged but don't stop execution
- Empty data sets are handled gracefully
- SMS failures are reported but don't crash the script

### Security
- Credentials hardcoded for simplicity (private VPS)
- Session-based CRM auth with automatic login
- Twilio credentials embedded (acceptable for internal tool)

## 📅 Scheduling

Set up as OpenClaw cron job to run at 8am ET Monday-Friday:

```bash
# Add to OpenClaw cron configuration
0 8 * * 1-5 cd /opt/smarty-projects && node warm-lead-digest.js
```

## 🧪 Testing

```bash
# Test SMS sending only
node test-digest.js

# Full dry run with verbose output
node warm-lead-digest.js --dry-run --verbose

# Check API connections
curl -s http://localhost:3000/api/deals -H 'x-api-key: TEST'  # Should get 401
curl -s 'https://api.plusvibe.ai/api/v1/unibox/emails?workspace_id=692307182213832a0e2cf618&label=INTERESTED' -H 'x-api-key: 928fd41c-ca0ebf02-beec065e-c7062e63'
```

## 🔍 Monitoring

Check logs for failures:
```bash
tail -f /var/log/openclaw/cron.log
```

## 🏗️ Deployment

1. **Script location**: `/opt/smarty-projects/warm-lead-digest.js`
2. **Permissions**: `chmod +x warm-lead-digest.js`
3. **Test**: Run `--dry-run` first
4. **Schedule**: Add to OpenClaw cron
5. **Monitor**: Check SMS delivery and logs

## 📈 Future Enhancements

- Add email digest option
- Include deal velocity metrics
- Add conversation summaries from call transcripts  
- Customize digest format per recipient
- Add weekend/holiday skip logic
- Include competitor win/loss analysis

---

**Created**: 2025-02-15 by OpenClaw/Smarty  
**Location**: `/opt/smarty-projects/warm-lead-digest.js`  
**Schedule**: 8am ET Mon-Fri via OpenClaw cron  
**Status**: ✅ Active