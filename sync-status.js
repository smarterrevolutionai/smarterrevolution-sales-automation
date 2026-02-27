#!/usr/bin/env node

/**
 * PlusVibe ↔ CRM Sync Status Monitor
 * Checks health and recent activity of the sync pipeline
 * Usage: node sync-status.js
 */

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const CRM_BASE_URL = 'http://localhost:3000';
const WEBHOOK_LOGS_DIR = '/opt/smarty-projects/webhook-logs';

class SyncStatusMonitor {
  constructor() {
    this.status = {
      timestamp: new Date().toISOString(),
      webhook_receiver: {
        running: false,
        pid: null,
        uptime: null
      },
      last_webhook: {
        timestamp: null,
        type: null,
        age_minutes: null
      },
      crm_health: {
        online: false,
        last_check: null
      },
      recent_deals: {
        this_week: 0,
        last_deal: null
      }
    };
  }

  async checkWebhookReceiver() {
    return new Promise((resolve) => {
      exec('sudo pm2 jlist', (error, stdout) => {
        if (error) {
          console.error('Error checking PM2 processes:', error);
          resolve();
          return;
        }

        try {
          const processes = JSON.parse(stdout);
          const webhookReceiver = processes.find(p => p.name === 'webhook-receiver');
          
          if (webhookReceiver && webhookReceiver.pm2_env.status === 'online') {
            this.status.webhook_receiver = {
              running: true,
              pid: webhookReceiver.pid,
              uptime: webhookReceiver.pm2_env.pm_uptime,
              restart_count: webhookReceiver.pm2_env.restart_time
            };
          }
        } catch (parseError) {
          console.error('Error parsing PM2 JSON:', parseError);
        }
        
        resolve();
      });
    });
  }

  async checkLastWebhook() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Check today's logs first, then yesterday
      const logFiles = [
        path.join(WEBHOOK_LOGS_DIR, `webhook-${today}.json`),
        path.join(WEBHOOK_LOGS_DIR, `webhook-${yesterday}.json`)
      ];

      let lastWebhook = null;
      
      for (const logFile of logFiles) {
        if (fs.existsSync(logFile)) {
          const logs = fs.readFileSync(logFile, 'utf8').trim().split('\n');
          if (logs.length > 0 && logs[0] !== '') {
            try {
              const lastLog = JSON.parse(logs[logs.length - 1]);
              lastWebhook = lastLog;
              break;
            } catch (parseError) {
              console.warn('Error parsing webhook log:', parseError);
            }
          }
        }
      }

      if (lastWebhook) {
        const webhookTime = new Date(lastWebhook.timestamp);
        const ageMinutes = Math.floor((Date.now() - webhookTime.getTime()) / (1000 * 60));
        
        this.status.last_webhook = {
          timestamp: lastWebhook.timestamp,
          type: lastWebhook.webhook_event || 'unknown',
          sentiment: lastWebhook.sentiment || 'unknown',
          age_minutes: ageMinutes,
          from_email: lastWebhook.from_email || 'unknown'
        };
      }
    } catch (error) {
      console.error('Error checking webhook logs:', error);
    }
  }

  async checkCRMHealth() {
    try {
      const response = await fetch(`${CRM_BASE_URL}/api/health`);
      if (response.ok) {
        const healthData = await response.json();
        this.status.crm_health = {
          online: healthData.status === 'ok',
          last_check: new Date().toISOString(),
          database: healthData.checks?.database || false,
          users: healthData.checks?.users || false,
          pipeline: healthData.checks?.pipeline || false
        };
      }
    } catch (error) {
      console.error('Error checking CRM health:', error);
      this.status.crm_health = {
        online: false,
        last_check: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async checkRecentDeals() {
    try {
      // We can't easily filter by date without auth, so let's just count recent deals
      // For now, we'll use a simplified check
      this.status.recent_deals = {
        this_week: 'Unable to check without auth',
        note: 'Need to implement proper CRM authentication for deal statistics'
      };
    } catch (error) {
      console.error('Error checking recent deals:', error);
      this.status.recent_deals = {
        error: error.message
      };
    }
  }

  async generateOverallStatus() {
    const issues = [];
    
    // Check for issues
    if (!this.status.webhook_receiver.running) {
      issues.push('⚠️ Webhook receiver not running');
    }
    
    if (!this.status.crm_health.online) {
      issues.push('❌ CRM not responding');
    }
    
    if (this.status.last_webhook.age_minutes > 60 * 24) { // Over 24 hours
      issues.push(`⏰ Last webhook ${this.status.last_webhook.age_minutes} minutes ago`);
    }

    this.status.overall = {
      healthy: issues.length === 0,
      issues: issues,
      summary: issues.length === 0 ? 
        '✅ All systems operational' : 
        `⚠️ ${issues.length} issue${issues.length > 1 ? 's' : ''} detected`
    };
  }

  async run() {
    console.log('🔍 Checking PlusVibe ↔ CRM sync status...');
    
    await Promise.all([
      this.checkWebhookReceiver(),
      this.checkLastWebhook(),
      this.checkCRMHealth(),
      this.checkRecentDeals()
    ]);
    
    await this.generateOverallStatus();
    
    return this.status;
  }
}

// Main execution
async function main() {
  const monitor = new SyncStatusMonitor();
  const status = await monitor.run();
  
  // Output JSON for machine consumption
  console.log(JSON.stringify(status, null, 2));
  
  // Human-readable summary
  console.error('\n📊 PlusVibe ↔ CRM Sync Status Summary:');
  console.error(status.overall.summary);
  
  if (status.overall.issues.length > 0) {
    console.error('\nIssues:');
    status.overall.issues.forEach(issue => console.error(`  ${issue}`));
  }
  
  console.error(`\n💡 Quick Stats:`);
  console.error(`  • Webhook receiver: ${status.webhook_receiver.running ? 'Running ✅' : 'Stopped ❌'}`);
  console.error(`  • CRM health: ${status.crm_health.online ? 'Online ✅' : 'Offline ❌'}`);
  console.error(`  • Last webhook: ${status.last_webhook.age_minutes || 'unknown'} minutes ago (${status.last_webhook.sentiment || 'unknown'} sentiment)`);
  
  // Exit with error code if not healthy
  process.exit(status.overall.healthy ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Sync status check failed:', error);
    process.exit(1);
  });
}

module.exports = { SyncStatusMonitor };