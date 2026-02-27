#!/usr/bin/env node

/**
 * Lead List Cleanup Tool for PlusVibe Cold Email Campaigns
 * Validates email lists and removes bad domains before they cause bounces
 */

const dns = require('dns').promises;
const https = require('https');
const fs = require('fs').promises;

// PlusVibe API Configuration
const PLUSVIBE_CONFIG = {
  baseUrl: 'https://api.plusvibe.ai/api/v1',
  apiKey: 'process.env.PLUSVIBE_API_KEY',
  workspaceId: '692307182213832a0e2cf618'
};

// Known bad domains (disposable email providers, spam traps)
const BAD_DOMAINS = new Set([
  // Disposable email providers
  '10minutemail.com', '20minutemail.com', 'temp-mail.org', 'guerrillamail.com',
  'mailinator.com', 'maildrop.cc', 'throwaway.email', 'tempmail.ninja',
  'getnada.com', 'fakeinbox.com', 'yopmail.com', 'dispostable.com',
  'tempail.com', 'mailtemp.net', 'sharklasers.com', 'grr.la',
  'mohmal.com', 'meltmail.com', 'tempinbox.com', 'minuteinbox.com',
  'emailondeck.com', 'temp-mails.com', 'burnermail.io', 'guerrillamailblock.com',
  'mailsac.com', 'spamgourmet.com', 'dodgeit.com', '33mail.com',
  'anonbox.net', 'email-fake.com', 'temporary-mail.net', 'disposable.deborah.dementiero.com',
  
  // Common spam traps and honeypots
  'example.com', 'example.org', 'example.net', 'test.com',
  'localhost', 'invalid.invalid', 'none.none', 'nowhere.com',
  
  // Typo domains
  'gmai.com', 'gmial.com', 'yahooo.com', 'hotmial.com',
  'outlok.com', 'gmailcom', 'yahoo.co', 'hotmai.com',
  
  // Additional disposable providers
  'mailcatch.com', 'inboxalias.com', 'tempr.email', 'tempmailo.com',
  'disposablemail.com', 'emailtemporar.ro', 'sogetthis.com', 'spamherelots.com',
  'bccto.me', 'nwldx.com', 'trashmail.com', 'mytrashmail.com',
  'thankyou2010.com', 'trash-amil.com', 'kurzepost.de', 'objectmail.com',
  'proxymail.eu', 'rcpt.at', 'trash-mail.at', 'trashmail.at',
  'trashmail.me', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org'
]);

// Role-based email patterns (usually not decision makers)
const ROLE_BASED_PATTERNS = [
  /^(info|contact|support|help|sales|admin|administrator|webmaster|postmaster)@/i,
  /^(marketing|hr|recruiting|legal|finance|accounting|billing)@/i,
  /^(noreply|no-reply|donotreply|do-not-reply)@/i,
  /^(careers|jobs|press|media|news|enquiry|enquiries)@/i,
  /^(customerservice|customer-service|service|technical|tech)@/i,
  /^(general|office|reception|inquiries|inquiry)@/i
];

class LeadCleanupTool {
  constructor() {
    this.results = {
      total: 0,
      valid: 0,
      removed: 0,
      reasons: {
        badDomain: [],
        noMxRecord: [],
        roleBased: [],
        invalid: []
      }
    };
  }

  /**
   * Make HTTPS request to PlusVibe API
   */
  async apiRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, PLUSVIBE_CONFIG.baseUrl);
      
      if (method === 'GET' && !endpoint.includes('?')) {
        url.searchParams.append('api_key', PLUSVIBE_CONFIG.apiKey);
        url.searchParams.append('workspace_id', PLUSVIBE_CONFIG.workspaceId);
      }

      const options = {
        method,
        headers: {
          'x-api-key': PLUSVIBE_CONFIG.apiKey,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            resolve({ data, status: res.statusCode });
          }
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * Get leads from PlusVibe campaign
   */
  async getLeadsFromCampaign(campaignId) {
    console.log(`📥 Fetching leads from campaign: ${campaignId}`);
    
    try {
      const response = await this.apiRequest(
        `/lead/workspace-leads?api_key=${PLUSVIBE_CONFIG.apiKey}&workspace_id=${PLUSVIBE_CONFIG.workspaceId}&campaign_id=${campaignId}&limit=1000`
      );
      
      if (response.leads) {
        console.log(`✅ Found ${response.leads.length} leads in campaign`);
        return response.leads.map(lead => lead.email).filter(Boolean);
      } else {
        console.log(`⚠️  Unexpected response format:`, response);
        return [];
      }
    } catch (error) {
      console.error(`❌ Failed to fetch leads from campaign:`, error.message);
      return [];
    }
  }

  /**
   * Check if domain has valid MX records
   */
  async hasMxRecord(domain) {
    try {
      const mxRecords = await dns.resolveMx(domain);
      return mxRecords && mxRecords.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate a single email address
   */
  async validateEmail(email) {
    const issues = [];
    
    // Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      issues.push('invalid_format');
      return { valid: false, issues };
    }

    const [localPart, domain] = email.split('@');
    
    // Check against bad domains
    if (BAD_DOMAINS.has(domain.toLowerCase())) {
      issues.push('bad_domain');
    }

    // Check for role-based emails
    if (ROLE_BASED_PATTERNS.some(pattern => pattern.test(email))) {
      issues.push('role_based');
    }

    // Check MX records
    const hasMx = await this.hasMxRecord(domain);
    if (!hasMx) {
      issues.push('no_mx_record');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Process a list of emails
   */
  async processEmails(emails) {
    console.log(`🔍 Processing ${emails.length} emails...`);
    
    const validEmails = [];
    const invalidEmails = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i].trim().toLowerCase();
      
      if (i % 50 === 0) {
        console.log(`📊 Progress: ${i}/${emails.length} (${Math.round(i/emails.length*100)}%)`);
      }

      const validation = await this.validateEmail(email);
      
      this.results.total++;
      
      if (validation.valid) {
        validEmails.push(email);
        this.results.valid++;
      } else {
        invalidEmails.push({ email, issues: validation.issues });
        this.results.removed++;
        
        // Categorize by primary issue
        const primaryIssue = validation.issues[0];
        if (primaryIssue === 'bad_domain') {
          this.results.reasons.badDomain.push(email);
        } else if (primaryIssue === 'no_mx_record') {
          this.results.reasons.noMxRecord.push(email);
        } else if (primaryIssue === 'role_based') {
          this.results.reasons.roleBased.push(email);
        } else {
          this.results.reasons.invalid.push(email);
        }
      }
    }

    return { validEmails, invalidEmails };
  }

  /**
   * Remove leads from PlusVibe campaign
   */
  async removeLeadsFromCampaign(campaignId, emailsToRemove) {
    if (emailsToRemove.length === 0) {
      console.log('📝 No emails to remove from campaign');
      return true;
    }

    console.log(`🗑️  Removing ${emailsToRemove.length} leads from campaign: ${campaignId}`);
    
    try {
      const response = await this.apiRequest('/lead/delete', 'POST', {
        campaign_id: campaignId,
        delete_list: emailsToRemove
      });
      
      console.log('✅ Successfully removed leads from campaign');
      return true;
    } catch (error) {
      console.error('❌ Failed to remove leads from campaign:', error.message);
      return false;
    }
  }

  /**
   * Print summary report
   */
  printSummary(dryRun = true) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LEAD CLEANUP SUMMARY REPORT');
    console.log('='.repeat(60));
    console.log(`📈 Total emails processed: ${this.results.total}`);
    console.log(`✅ Valid emails: ${this.results.valid}`);
    console.log(`❌ Removed emails: ${this.results.removed}`);
    console.log(`📊 Success rate: ${Math.round(this.results.valid/this.results.total*100)}%`);
    
    console.log('\n📋 REMOVAL BREAKDOWN:');
    console.log(`🚫 Bad domains: ${this.results.reasons.badDomain.length}`);
    console.log(`🌐 No MX record: ${this.results.reasons.noMxRecord.length}`);
    console.log(`👔 Role-based: ${this.results.reasons.roleBased.length}`);
    console.log(`⚠️  Invalid format: ${this.results.reasons.invalid.length}`);

    if (dryRun) {
      console.log('\n🧪 DRY RUN MODE - No changes were made to PlusVibe');
      console.log('🚀 Use --execute flag to actually remove emails from campaign');
    } else {
      console.log('\n✅ EXECUTION MODE - Changes were applied to PlusVibe');
    }
    
    // Show some examples
    if (this.results.reasons.badDomain.length > 0) {
      console.log(`\n🚫 Bad domain examples: ${this.results.reasons.badDomain.slice(0, 5).join(', ')}${this.results.reasons.badDomain.length > 5 ? '...' : ''}`);
    }
    if (this.results.reasons.roleBased.length > 0) {
      console.log(`👔 Role-based examples: ${this.results.reasons.roleBased.slice(0, 5).join(', ')}${this.results.reasons.roleBased.length > 5 ? '...' : ''}`);
    }
    
    console.log('='.repeat(60));
  }

  /**
   * Save detailed report to file
   */
  async saveReport(filename = 'lead-cleanup-report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.results,
      details: {
        badDomains: this.results.reasons.badDomain,
        noMxRecords: this.results.reasons.noMxRecord,
        roleBased: this.results.reasons.roleBased,
        invalid: this.results.reasons.invalid
      }
    };

    try {
      await fs.writeFile(filename, JSON.stringify(report, null, 2));
      console.log(`💾 Detailed report saved to: ${filename}`);
    } catch (error) {
      console.error('❌ Failed to save report:', error.message);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🧹 Lead List Cleanup Tool for PlusVibe Cold Email Campaigns

USAGE:
  node lead-cleanup.js [OPTIONS] <CAMPAIGN_ID|EMAIL_FILE>

OPTIONS:
  --execute          Execute changes (remove from PlusVibe campaign)
  --dry-run          Dry run mode (default, no changes made)
  --emails <file>    Process emails from file instead of campaign
  --report <file>    Save detailed report to file
  --help, -h         Show this help message

EXAMPLES:
  # Dry run on campaign (shows what would be cleaned)
  node lead-cleanup.js campaign123

  # Actually remove bad emails from campaign
  node lead-cleanup.js --execute campaign123

  # Process emails from file
  node lead-cleanup.js --emails emails.txt

  # Save detailed report
  node lead-cleanup.js --report cleanup-report.json campaign123

FEATURES:
  ✅ Bad domain detection (disposable email providers)
  ✅ MX record validation (domain has mail servers)
  ✅ Role-based email detection (info@, sales@, admin@)
  ✅ PlusVibe API integration (auto-remove from campaigns)
  ✅ Dry-run mode for safe testing
  ✅ Detailed reporting and summaries
    `);
    process.exit(0);
  }

  const execute = args.includes('--execute');
  const dryRun = !execute;
  const emailFileIndex = args.indexOf('--emails');
  const reportFileIndex = args.indexOf('--report');
  
  let campaignId = null;
  let emailFile = null;
  let reportFile = 'lead-cleanup-report.json';

  // Parse arguments
  if (emailFileIndex !== -1 && emailFileIndex + 1 < args.length) {
    emailFile = args[emailFileIndex + 1];
  }
  
  if (reportFileIndex !== -1 && reportFileIndex + 1 < args.length) {
    reportFile = args[reportFileIndex + 1];
  }

  // Get campaign ID or assume last argument
  const lastArg = args[args.length - 1];
  if (!lastArg.startsWith('--') && lastArg !== emailFile && lastArg !== reportFile) {
    campaignId = lastArg;
  }

  if (!campaignId && !emailFile) {
    console.error('❌ Please provide either a campaign ID or --emails file');
    process.exit(1);
  }

  const cleanup = new LeadCleanupTool();
  let emails = [];

  try {
    // Get emails from source
    if (emailFile) {
      console.log(`📂 Loading emails from file: ${emailFile}`);
      const fileContent = await fs.readFile(emailFile, 'utf8');
      emails = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes('@'));
    } else if (campaignId) {
      emails = await cleanup.getLeadsFromCampaign(campaignId);
    }

    if (emails.length === 0) {
      console.log('📭 No emails found to process');
      process.exit(0);
    }

    // Process emails
    const { validEmails, invalidEmails } = await cleanup.processEmails(emails);
    
    // Remove from PlusVibe if not dry run
    if (!dryRun && campaignId && invalidEmails.length > 0) {
      const emailsToRemove = invalidEmails.map(item => item.email);
      await cleanup.removeLeadsFromCampaign(campaignId, emailsToRemove);
    }

    // Print summary and save report
    cleanup.printSummary(dryRun);
    await cleanup.saveReport(reportFile);

  } catch (error) {
    console.error('❌ Error during cleanup process:', error.message);
    process.exit(1);
  }
}

// Run CLI if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = LeadCleanupTool;