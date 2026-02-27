# Lead List Cleanup Tool for PlusVibe

A comprehensive email validation script that cleans your PlusVibe cold email campaigns by removing bad domains, invalid emails, and role-based addresses before they cause bounces.

## 🚀 Quick Start

**Deployed Location:** `/opt/smarty-projects/lead-cleanup.js`

```bash
# SSH into VPS
ssh -i /home/node/.openclaw/workspace/.ssh/id_ed25519_vps -p 2222 smarty@72.62.252.232

# Navigate to project directory
cd /opt/smarty-projects

# Run help to see all options
node lead-cleanup.js --help
```

## 📋 Usage Examples

### 1. Dry Run on PlusVibe Campaign (Recommended First Step)
```bash
node lead-cleanup.js campaign123
```
- Shows what would be cleaned without making changes
- Generates detailed report
- Safe to run anytime

### 2. Actually Clean a PlusVibe Campaign
```bash
node lead-cleanup.js --execute campaign123
```
- Removes bad emails from the campaign via PlusVibe API
- **Warning:** This makes actual changes to your campaign

### 3. Process Emails from a File
```bash
node lead-cleanup.js --emails email-list.txt
```
- Validate emails from a text file (one per line)
- Useful for pre-screening before importing

### 4. Custom Report File
```bash
node lead-cleanup.js --report my-cleanup-report.json campaign123
```
- Save detailed results to custom filename
- Default: `lead-cleanup-report.json`

## 🔍 What It Checks

### ✅ Bad Domain Detection
- **80+ disposable email providers** (10minutemail.com, guerrillamail.com, etc.)
- **Common spam traps** (example.com, test.com, localhost)
- **Typo domains** (gmai.com, gmial.com, yahooo.com)

### 🌐 MX Record Validation
- Checks if domain has valid mail servers
- Catches non-existent domains
- Uses DNS lookup for real-time validation

### 👔 Role-Based Email Detection
- info@, sales@, admin@, support@
- marketing@, hr@, legal@, finance@
- noreply@, careers@, press@
- Usually not decision makers for B2B

## 📊 Output

### Console Summary
```
📊 LEAD CLEANUP SUMMARY REPORT
============================================================
📈 Total emails processed: 1000
✅ Valid emails: 750
❌ Removed emails: 250
📊 Success rate: 75%

📋 REMOVAL BREAKDOWN:
🚫 Bad domains: 85
🌐 No MX record: 45
👔 Role-based: 115
⚠️  Invalid format: 5
```

### JSON Report File
```json
{
  "timestamp": "2026-02-15T00:58:39.580Z",
  "summary": {
    "total": 8,
    "valid": 2,
    "removed": 6
  },
  "details": {
    "badDomains": ["info@example.com", "test@10minutemail.com"],
    "noMxRecords": ["user@fake-domain.com"],
    "roleBased": ["sales@company.com", "admin@yahoo.com"],
    "invalid": ["not-an-email"]
  }
}
```

## 🔧 PlusVibe API Integration

The script automatically integrates with your PlusVibe account:
- **Base URL:** https://api.plusvibe.ai/api/v1
- **Authentication:** x-api-key header (pre-configured)
- **Workspace:** 692307182213832a0e2cf618 (pre-configured)

### API Endpoints Used:
- `GET /lead/workspace-leads` - Fetch campaign emails
- `POST /lead/delete` - Remove bad emails from campaign

## 🛡️ Safety Features

### Dry Run by Default
- Script runs in safe mode unless `--execute` is specified
- Shows exactly what would be changed
- Generates reports for review

### Progress Tracking
- Shows processing progress every 50 emails
- Prevents timeouts on large lists
- Provides ETA for completion

### Error Handling
- Graceful API failures (continues processing)
- DNS timeout protection
- Detailed error messages

## 🚀 Best Practices

### 1. Always Start with Dry Run
```bash
# First, see what would be cleaned
node lead-cleanup.js campaign123

# Review the report, then execute if satisfied
node lead-cleanup.js --execute campaign123
```

### 2. Pre-Screen Email Lists
```bash
# Validate emails before importing to PlusVibe
node lead-cleanup.js --emails new-leads.txt
```

### 3. Regular Campaign Maintenance
```bash
# Weekly cleanup of active campaigns
node lead-cleanup.js --execute campaign123
node lead-cleanup.js --execute campaign456
```

### 4. Keep Detailed Records
```bash
# Save reports with campaign names
node lead-cleanup.js --report "campaign123-cleanup-$(date +%Y%m%d).json" campaign123
```

## 🔍 Troubleshooting

### Common Issues

**"No emails found to process"**
- Check campaign ID is correct
- Verify campaign has leads in PlusVibe
- Try fetching with API to confirm

**"Failed to fetch leads from campaign"**
- Check internet connectivity
- Verify PlusVibe API is accessible
- Campaign might be empty or deleted

**DNS timeout errors**
- Normal for some invalid domains
- Script continues processing other emails
- Check final report for details

### Debug Mode
```bash
# Add more verbose logging (if needed)
DEBUG=* node lead-cleanup.js campaign123
```

## 📈 Performance

- **Speed:** ~100 emails per minute (with MX validation)
- **Memory:** Low usage, streams through large lists
- **Network:** DNS lookups are the main bottleneck
- **Limits:** PlusVibe API has 1000 lead limit per request

## ⚠️ Important Notes

1. **Backup First:** Always export your campaign before cleaning
2. **Test Small:** Try on small campaigns first
3. **Review Reports:** Check what's being removed makes sense
4. **Role-Based Emails:** Consider if you want these (some might be valid)
5. **Industry Specific:** Some industries legitimately use role emails

---

**Last Updated:** February 15, 2026  
**Version:** 1.0  
**Author:** Smarty (OpenClaw Agent)