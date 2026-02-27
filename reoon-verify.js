#!/usr/bin/env node
/**
 * Reoon Email Verification Pipeline
 * Smarter Revolution — Built by Smarty 🧠
 * 
 * Usage:
 *   node reoon-verify.js --check-balance
 *   node reoon-verify.js --verify-file <csv_path> [--limit 2000]
 *   node reoon-verify.js --verify-plusvibe [--limit 2000]
 *   node reoon-verify.js --status <task_id>
 *   node reoon-verify.js --results <task_id> [--output results.json]
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'process.env.REOON_API_KEY';
const API_BASE = 'https://emailverifier.reoon.com/api/v1';
const RESULTS_DIR = '/opt/smarty-projects/email-verification';
const LOG_FILE = path.join(RESULTS_DIR, 'verification.log');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function checkBalance() {
  const res = await fetch(`${API_BASE}/check-account-balance/?key=${API_KEY}`);
  const data = await res.json();
  log(`Balance: ${data.remaining_daily_credits} daily credits, ${data.remaining_instant_credits} instant credits, API status: ${data.api_status}`);
  return data;
}

async function createBulkTask(emails, taskName) {
  log(`Submitting ${emails.length} emails for verification as "${taskName}"...`);
  
  const res = await fetch(`${API_BASE}/create-bulk-verification-task/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: taskName.substring(0, 25),
      emails: emails,
      key: API_KEY,
    }),
  });
  
  const data = await res.json();
  
  if (data.status === 'success') {
    log(`Task created! ID: ${data.task_id}, Processing: ${data.count_processing}, Dupes removed: ${data.count_duplicates_removed}, Rejected: ${data.count_rejected_emails}`);
    
    // Save task info
    const taskFile = path.join(RESULTS_DIR, `task-${data.task_id}.json`);
    fs.writeFileSync(taskFile, JSON.stringify({
      task_id: data.task_id,
      task_name: taskName,
      created_at: new Date().toISOString(),
      count_submitted: data.count_submitted,
      count_processing: data.count_processing,
      count_duplicates_removed: data.count_duplicates_removed,
      count_rejected: data.count_rejected_emails,
    }, null, 2));
  } else {
    log(`ERROR: Task creation failed - ${data.reason || JSON.stringify(data)}`);
  }
  
  return data;
}

async function getTaskResults(taskId) {
  const res = await fetch(`${API_BASE}/get-result-bulk-verification-task/?key=${API_KEY}&task_id=${taskId}`);
  const data = await res.json();
  
  log(`Task ${taskId}: status=${data.status}, progress=${data.progress_percentage}%, checked=${data.count_checked}/${data.count_total}`);
  
  if (data.status === 'completed' && data.results) {
    // Analyze results
    const results = data.results;
    const emails = Object.keys(results);
    const stats = { safe: 0, invalid: 0, catch_all: 0, role_account: 0, disposable: 0, spamtrap: 0, disabled: 0, inbox_full: 0, unknown: 0, other: 0 };
    const safeEmails = [];
    const unsafeEmails = [];
    
    for (const email of emails) {
      const r = results[email];
      const status = r.status || 'unknown';
      if (stats.hasOwnProperty(status)) {
        stats[status]++;
      } else {
        stats.other++;
      }
      
      if (r.is_safe_to_send) {
        safeEmails.push(email);
      } else {
        unsafeEmails.push({ email, status, score: r.overall_score || 0 });
      }
    }
    
    log(`Results: ${emails.length} total | Safe: ${stats.safe} | Invalid: ${stats.invalid} | Catch-all: ${stats.catch_all} | Role: ${stats.role_account} | Disposable: ${stats.disposable} | Spamtrap: ${stats.spamtrap} | Disabled: ${stats.disabled} | Unknown: ${stats.unknown}`);
    
    // Save full results
    const resultsFile = path.join(RESULTS_DIR, `results-${taskId}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(data, null, 2));
    
    // Save safe emails list
    const safeFile = path.join(RESULTS_DIR, `safe-${taskId}.csv`);
    fs.writeFileSync(safeFile, 'email\n' + safeEmails.join('\n'));
    
    // Save unsafe emails list
    const unsafeFile = path.join(RESULTS_DIR, `unsafe-${taskId}.csv`);
    fs.writeFileSync(unsafeFile, 'email,status,score\n' + unsafeEmails.map(u => `${u.email},${u.status},${u.score}`).join('\n'));
    
    log(`Saved: ${resultsFile}, ${safeFile} (${safeEmails.length}), ${unsafeFile} (${unsafeEmails.length})`);
    
    return { stats, safeCount: safeEmails.length, unsafeCount: unsafeEmails.length, total: emails.length };
  }
  
  return data;
}

async function pollUntilComplete(taskId, intervalMs = 15000, maxWaitMs = 600000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`${API_BASE}/get-result-bulk-verification-task/?key=${API_KEY}&task_id=${taskId}`);
    const data = await res.json();
    
    if (data.status === 'completed') {
      return await getTaskResults(taskId);
    }
    
    log(`Task ${taskId}: ${data.status} - ${data.progress_percentage || 0}% (${data.count_checked || 0}/${data.count_total || '?'})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  
  log(`Task ${taskId}: Timed out after ${maxWaitMs/1000}s. Check manually with --status ${taskId}`);
  return null;
}

function extractEmailsFromCSV(filepath, limit) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const emailIndex = headers.indexOf('email');
  
  if (emailIndex === -1) {
    log(`ERROR: No 'email' column found in ${filepath}. Headers: ${headers.join(', ')}`);
    return [];
  }
  
  const emails = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const email = (cols[emailIndex] || '').trim().toLowerCase();
    if (email && email.includes('@')) {
      emails.add(email);
    }
  }
  
  let emailArray = Array.from(emails);
  if (limit && limit < emailArray.length) {
    emailArray = emailArray.slice(0, limit);
  }
  
  log(`Extracted ${emailArray.length} unique emails from ${path.basename(filepath)}${limit ? ` (limited to ${limit})` : ''}`);
  return emailArray;
}

// Load previously verified emails to avoid re-verifying
function loadVerifiedEmails() {
  const verifiedFile = path.join(RESULTS_DIR, 'all-verified.json');
  if (fs.existsSync(verifiedFile)) {
    return new Set(JSON.parse(fs.readFileSync(verifiedFile, 'utf-8')));
  }
  return new Set();
}

function saveVerifiedEmails(emails) {
  const verifiedFile = path.join(RESULTS_DIR, 'all-verified.json');
  const existing = loadVerifiedEmails();
  for (const e of emails) existing.add(e);
  fs.writeFileSync(verifiedFile, JSON.stringify(Array.from(existing)));
  log(`Total verified emails tracked: ${existing.size}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === '--check-balance') {
    await checkBalance();
    
  } else if (command === '--verify-file') {
    const filepath = args[1];
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : null;
    
    if (!filepath) {
      console.error('Usage: --verify-file <csv_path> [--limit N]');
      process.exit(1);
    }
    
    // Check balance first
    const balance = await checkBalance();
    const totalCredits = (balance.remaining_daily_credits || 0) + (balance.remaining_instant_credits || 0);
    
    // Extract emails
    let emails = extractEmailsFromCSV(filepath, limit);
    
    // Remove already verified
    const verified = loadVerifiedEmails();
    const originalCount = emails.length;
    emails = emails.filter(e => !verified.has(e));
    if (originalCount !== emails.length) {
      log(`Skipping ${originalCount - emails.length} already-verified emails`);
    }
    
    if (emails.length === 0) {
      log('No new emails to verify!');
      return;
    }
    
    if (emails.length > totalCredits) {
      log(`WARNING: ${emails.length} emails but only ${totalCredits} credits available. Limiting to ${totalCredits}.`);
      emails = emails.slice(0, totalCredits);
    }
    
    const taskName = path.basename(filepath, '.csv').substring(0, 25);
    const result = await createBulkTask(emails, taskName);
    
    if (result.status === 'success') {
      log('Polling for results...');
      const finalResult = await pollUntilComplete(result.task_id);
      if (finalResult) {
        saveVerifiedEmails(emails);
      }
    }
    
  } else if (command === '--status') {
    const taskId = args[1];
    await getTaskResults(taskId);
    
  } else if (command === '--verify-batch') {
    // Verify multiple files in sequence
    const files = args.slice(1).filter(a => !a.startsWith('--'));
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : null;
    
    for (const filepath of files) {
      log(`\n=== Processing ${filepath} ===`);
      let emails = extractEmailsFromCSV(filepath, limit);
      
      const verified = loadVerifiedEmails();
      emails = emails.filter(e => !verified.has(e));
      
      if (emails.length === 0) {
        log(`All emails in ${filepath} already verified. Skipping.`);
        continue;
      }
      
      const balance = await checkBalance();
      const totalCredits = (balance.remaining_daily_credits || 0) + (balance.remaining_instant_credits || 0);
      if (totalCredits < 10) {
        log('Not enough credits remaining. Stopping.');
        break;
      }
      
      if (emails.length > totalCredits) {
        emails = emails.slice(0, totalCredits);
      }
      
      const taskName = path.basename(filepath, '.csv').substring(0, 25);
      const result = await createBulkTask(emails, taskName);
      
      if (result.status === 'success') {
        const finalResult = await pollUntilComplete(result.task_id);
        if (finalResult) {
          saveVerifiedEmails(emails);
        }
      }
    }
    
  } else {
    console.log(`
Reoon Email Verification Pipeline — Smarty 🧠

Commands:
  --check-balance                    Check remaining credits
  --verify-file <csv> [--limit N]    Verify emails from a CSV file
  --verify-batch <csv1> <csv2> ...   Verify multiple CSV files
  --status <task_id>                 Check task status and get results
    `);
  }
}

main().catch(e => {
  log(`FATAL ERROR: ${e.message}`);
  console.error(e);
  process.exit(1);
});
