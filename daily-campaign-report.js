#!/usr/bin/env node
/**
 * Daily Campaign Monitoring Report
 * Pulls PlusVibe campaign stats and sends a morning report to Mark + Wolf
 * 
 * Run via cron at 9 AM ET daily (Monday-Friday)
 */

const fs = require('fs');
const path = require('path');

// Config
const PV_API = 'https://api.plusvibe.ai/api/v1';
const PV_KEY = 'process.env.PLUSVIBE_API_KEY';
const PV_WORKSPACE = '692307182213832a0e2cf618';

const CAMPAIGNS = {
  'tech_finance': '6987e237e2259240c66e6013',
  'manufacturing': '6987e238e2259240c66e6014',
  'healthcare': '6987e238e2259240c66e6015',
  'services': '6987e23945fba752e310c5ed',
  'retail': '6987e23a7d33011e42278325',
  'general': '6987e23be2259240c66e6017',
};

// Google credentials from env file
function loadEnv() {
  const envPath = '/opt/smarterrevolutionai-site/.env';
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) {
      env[line.substring(0, idx)] = line.substring(idx + 1);
    }
  }
  return env;
}

async function pvGet(endpoint, params = {}) {
  const url = new URL(`${PV_API}${endpoint}`);
  url.searchParams.set('workspace_id', PV_WORKSPACE);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  
  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': PV_KEY },
  });
  
  if (!res.ok) {
    console.error(`PV API error: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json();
}

async function getLeadCounts() {
  const data = await pvGet('/lead/count/lead-status');
  return data;
}

async function getCampaignStats() {
  // Try multiple campaign endpoints
  let data = await pvGet('/campaign/list-all');
  if (!data || !data.data || data.data.length === 0) {
    data = await pvGet('/campaign');
  }
  if (!data || !data.data) return [];
  return data.data;
}

async function getWarmupHealth() {
  const data = await pvGet('/warmup/status');
  return data;
}

function formatNumber(n) {
  return (n || 0).toLocaleString();
}

function generateReport(leadCounts, campaigns, warmup) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  
  // Extract lead status counts
  // Parse lead counts array into object
  const lc = {};
  if (Array.isArray(leadCounts)) {
    for (const item of leadCounts) {
      lc[item.status] = item.count;
    }
  } else {
    Object.assign(lc, leadCounts || {});
  }
  const totalLeads = Object.values(lc).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  
  // Campaign summary
  let campaignRows = '';
  let totalSent = 0;
  let totalOpened = 0;
  let totalReplied = 0;
  let totalBounced = 0;
  
  const campaignList = Array.isArray(campaigns) ? campaigns : [];
  for (const camp of campaignList) {
    const stats = camp.stats || camp.analytics || {};
    const sent = stats.emailsSent || stats.sent || stats.contacted || 0;
    const opened = stats.opened || stats.uniqueOpens || 0;
    const replied = stats.replied || stats.replies || 0;
    const bounced = stats.bounced || stats.bounces || 0;
    const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0';
    const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : '0.0';
    
    totalSent += sent;
    totalOpened += opened;
    totalReplied += replied;
    totalBounced += bounced;
    
    const name = camp.name || camp.title || 'Unknown';
    const status = camp.status || 'UNKNOWN';
    
    campaignRows += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${status}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatNumber(sent)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${openRate}%</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${replyRate}%</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatNumber(bounced)}</td>
      </tr>`;
  }
  
  const totalOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
  const totalReplyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0.0';
  const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0.0';
  
  // Warmup summary
  let warmupSummary = 'No warmup data available';
  if (warmup && warmup.data) {
    const active = warmup.data.filter(a => a.warmupStatus === 'active' || a.warmup_enabled).length;
    const total = warmup.data.length;
    warmupSummary = `${active} of ${total} accounts actively warming`;
  }
  
  // Health indicators
  const bounceHealth = parseFloat(bounceRate) < 2 ? '🟢' : parseFloat(bounceRate) < 5 ? '🟡' : '🔴';
  const openHealth = parseFloat(totalOpenRate) > 40 ? '🟢' : parseFloat(totalOpenRate) > 20 ? '🟡' : '🔴';
  const replyHealth = parseFloat(totalReplyRate) > 2 ? '🟢' : parseFloat(totalReplyRate) > 0.5 ? '🟡' : '🔴';
  
  return `
<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9f9f9;">
  <div style="background: #DC2626; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Campaign Daily Report</h1>
    <p style="margin: 5px 0 0; opacity: 0.9;">${dateStr}</p>
  </div>
  
  <div style="padding: 20px;">
    <!-- Health Overview -->
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px; font-size: 18px; color: #333;">Health Overview</h2>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px;">${openHealth} Open Rate</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">${totalOpenRate}%</td>
        </tr>
        <tr>
          <td style="padding: 8px;">${replyHealth} Reply Rate</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">${totalReplyRate}%</td>
        </tr>
        <tr>
          <td style="padding: 8px;">${bounceHealth} Bounce Rate</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">${bounceRate}%</td>
        </tr>
        <tr>
          <td style="padding: 8px;">📧 Total Sent</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">${formatNumber(totalSent)}</td>
        </tr>
        <tr>
          <td style="padding: 8px;">💬 Total Replies</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">${formatNumber(totalReplied)}</td>
        </tr>
      </table>
    </div>
    
    <!-- Campaign Breakdown -->
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px; font-size: 18px; color: #333;">Campaign Breakdown</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 8px; text-align: left;">Campaign</th>
            <th style="padding: 8px; text-align: center;">Status</th>
            <th style="padding: 8px; text-align: right;">Sent</th>
            <th style="padding: 8px; text-align: right;">Opens</th>
            <th style="padding: 8px; text-align: right;">Replies</th>
            <th style="padding: 8px; text-align: right;">Bounced</th>
          </tr>
        </thead>
        <tbody>
          ${campaignRows || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #999;">No campaign data yet (campaigns launch Monday)</td></tr>'}
        </tbody>
      </table>
    </div>
    
    <!-- Lead Status -->
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px; font-size: 18px; color: #333;">Lead Status Summary</h2>
      <table style="width: 100%;">
        <tr><td style="padding: 5px;">Not Contacted</td><td style="text-align: right; font-weight: bold;">${formatNumber(lc.NOT_CONTACTED || lc.notContacted || 0)}</td></tr>
        <tr><td style="padding: 5px;">Contacted</td><td style="text-align: right; font-weight: bold;">${formatNumber(lc.CONTACTED || lc.contacted || 0)}</td></tr>
        <tr><td style="padding: 5px;">Replied</td><td style="text-align: right; font-weight: bold;">${formatNumber(lc.REPLIED || lc.replied || 0)}</td></tr>
        <tr><td style="padding: 5px;">Bounced</td><td style="text-align: right; font-weight: bold;">${formatNumber(lc.BOUNCED || lc.bounced || 0)}</td></tr>
        <tr><td style="padding: 5px;">Completed</td><td style="text-align: right; font-weight: bold;">${formatNumber(lc.COMPLETED || lc.completed || 0)}</td></tr>
      </table>
    </div>
    
    <!-- Warmup Status -->
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px; font-size: 18px; color: #333;">Warmup Status</h2>
      <p style="color: #666;">${warmupSummary}</p>
    </div>
    
    <!-- Action Items -->
    <div style="background: #FEF3C7; border-radius: 8px; padding: 20px; border-left: 4px solid #F59E0B;">
      <h2 style="margin: 0 0 10px; font-size: 16px; color: #92400E;">Action Items</h2>
      <ul style="margin: 0; padding-left: 20px; color: #92400E;">
        ${parseFloat(bounceRate) > 3 ? '<li>Bounce rate above 3%. Review and clean affected campaigns.</li>' : ''}
        ${totalReplied > 0 ? `<li>${totalReplied} replies need review. Check Unibox.</li>` : ''}
        ${parseFloat(totalOpenRate) < 20 && totalSent > 100 ? '<li>Open rate below 20%. Consider subject line testing.</li>' : ''}
        <li>Check PlusVibe Unibox for any new replies requiring response.</li>
      </ul>
    </div>
  </div>
  
  <div style="padding: 15px; text-align: center; color: #999; font-size: 12px;">
    Generated by Smarty | Smarter Revolution AI Operations
  </div>
</div>`;
}

async function sendEmail(env, to, subject, htmlBody) {
  const { google } = require('/opt/smarterrevolutionai-site/node_modules/googleapis');
  
  const creds = JSON.parse(env.GOOGLE_CREDENTIALS);
  const tokens = JSON.parse(env.GOOGLE_TOKENS);
  
  const oauth2Client = new google.auth.OAuth2(
    creds.installed.client_id,
    creds.installed.client_secret,
    'http://localhost'
  );
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const raw = Buffer.from(
    `To: ${to}\nSubject: ${subject}\nContent-Type: text/html; charset=utf-8\n\n${htmlBody}`
  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}

async function main() {
  console.log('Starting daily campaign report...');
  
  const env = loadEnv();
  
  // Pull data from PlusVibe
  const [leadCounts, campaigns] = await Promise.all([
    getLeadCounts(),
    getCampaignStats(),
  ]);
  
  console.log('Lead counts:', JSON.stringify(leadCounts));
  console.log('Campaigns:', campaigns?.length || 0, 'found');
  
  // Generate report
  const html = generateReport(leadCounts, campaigns, null);
  
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  
  const subject = `Campaign Report - ${today}`;
  
  // Send to Mark and Wolf
  const recipients = [
    'mark@smarterrevolution.com',
    'wolf@smarterrevolution.com',
    'henry@smarterrevolutionai.com',
  ];
  
  for (const to of recipients) {
    try {
      await sendEmail(env, to, subject, html);
      console.log(`Sent to ${to}`);
    } catch (err) {
      console.error(`Failed to send to ${to}:`, err.message);
    }
  }
  
  // Save report locally
  const reportDir = '/opt/smarty-projects/campaign-reports';
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  
  const dateSlug = new Date().toISOString().split('T')[0];
  fs.writeFileSync(
    path.join(reportDir, `report-${dateSlug}.html`),
    html
  );
  fs.writeFileSync(
    path.join(reportDir, `data-${dateSlug}.json`),
    JSON.stringify({ leadCounts, campaignCount: campaigns?.length, generatedAt: new Date().toISOString() }, null, 2)
  );
  
  console.log('Report saved and sent successfully.');
}

main().catch(err => {
  console.error('Report generation failed:', err);
  process.exit(1);
});
