#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// CLI argument parsing
const args = process.argv.slice(2);
const onlyTest = args.find(arg => arg.startsWith('--only='))?.split('=')[1];
const noCleanup = args.includes('--no-cleanup');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(message) {
  console.log(message);
}

function logResult(testName, passed, details = '') {
  const status = passed ? '[PASS]' : '[FAIL]';
  const message = details ? `${testName} — ${details}` : testName;
  log(`${status} ${message}`);
  
  results.tests.push({ name: testName, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

function makeHttpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = { statusCode: res.statusCode, body: JSON.parse(body), headers: res.headers };
          resolve(response);
        } catch (e) {
          resolve({ statusCode: res.statusCode, body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTest(testName, testFn) {
  if (onlyTest && testName.toLowerCase() !== onlyTest.toLowerCase()) {
    return;
  }
  
  try {
    await testFn();
  } catch (error) {
    logResult(testName, false, error.message);
  }
}

// Test functions
async function testWebhookPositive() {
  const options = {
    hostname: 'localhost',
    port: 3005,
    path: '/webhook/plusvibe',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const testData = {
    webhook_event: 'email_reply',
    from_email: 'smoketest@example.com',
    first_name: 'Smoke',
    last_name: 'Test',
    text_body: 'Yes, I\'m very interested in learning more!',
    timestamp: new Date().toISOString()
  };

  const response = await makeHttpRequest(options, testData);
  
  if (response.statusCode === 200 && response.body.sentiment === 'HOT') {
    logResult('Webhook Receiver', true, 'Positive reply detected as HOT');
  } else {
    logResult('Webhook Receiver', false, `Expected HOT sentiment, got ${response.body?.sentiment || 'no response'}`);
  }
}

async function testWebhookNegative() {
  const options = {
    hostname: 'localhost',
    port: 3005,
    path: '/webhook/plusvibe',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const testData = {
    webhook_event: 'email_reply',
    from_email: 'smoketest-neg@example.com',
    first_name: 'Negative',
    last_name: 'Test',
    text_body: 'No thanks, not interested at all.',
    timestamp: new Date().toISOString()
  };

  const response = await makeHttpRequest(options, testData);
  
  if (response.statusCode === 200 && response.body.sentiment === 'NEGATIVE') {
    logResult('Webhook Receiver', true, 'Negative reply detected as NEGATIVE');
  } else {
    logResult('Webhook Receiver', false, `Expected NEGATIVE sentiment, got ${response.body?.sentiment || 'no response'}`);
  }
}

async function testAutoPipeline() {
  try {
    const command = 'node /opt/smarty-projects/auto-pipeline.js --email="smoketest@example.com" --name="Smoke Test" --company="Smoke Test Corp" --reply-text="Yes interested"';
    const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
    logResult('Auto-Pipeline', true, 'CRM deal creation completed');
  } catch (error) {
    logResult('Auto-Pipeline', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function testCRMDealCreated() {
  try {
    // Login to CRM
    const loginOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const loginData = {
      username: 'admin',
      password: 'WorkSmarter2025!'
    };

    const loginResponse = await makeHttpRequest(loginOptions, loginData);
    
    if (loginResponse.statusCode !== 200) {
      throw new Error('Failed to login to CRM');
    }

    // Extract session cookie
    const sessionCookie = loginResponse.headers['set-cookie']?.find(cookie => cookie.startsWith('sr_session='));
    if (!sessionCookie) {
      throw new Error('No session cookie received from CRM login');
    }

    // Search for the test contact
    const searchOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/contacts?search=smoketest@example.com',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie.split(';')[0]
      }
    };

    const searchResponse = await makeHttpRequest(searchOptions);
    
    if (searchResponse.statusCode === 200 && searchResponse.body.data && searchResponse.body.data.length > 0) {
      const contact = searchResponse.body.data[0];
      logResult('CRM Deal Created', true, `Contact found (ID: ${contact.id})`);
      
      // Store contact ID for cleanup
      global.testContactId = contact.id;
      global.sessionCookie = sessionCookie.split(';')[0];
    } else {
      logResult('CRM Deal Created', false, 'Test contact not found in CRM');
    }
  } catch (error) {
    logResult('CRM Deal Created', false, error.message);
  }
}

async function testSMSTouch() {
  try {
    const command = 'node /opt/smarty-projects/sms-touch.js --to="+15550000000" --name="Smoke" --template="initial" --company="Test Corp" --dry-run';
    const output = execSync(command, { encoding: 'utf8', timeout: 15000 });
    logResult('SMS Touch', true, 'Dry-run successful');
  } catch (error) {
    logResult('SMS Touch', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function testCallPrep() {
  try {
    const command = 'node /opt/smarty-projects/call-prep.js --company="Google" --contact="Test" --email="test@google.com" --title="CEO"';
    const output = execSync(command, { encoding: 'utf8', timeout: 15000 });
    
    // Check if brief file was created
    const briefPattern = '/opt/smarty-projects/call-briefs/google-*.md';
    const briefFiles = execSync(`ls ${briefPattern} 2>/dev/null || echo "none"`, { encoding: 'utf8' }).trim();
    
    if (briefFiles !== 'none') {
      logResult('Call Prep', true, 'Brief generated');
      global.testBriefFile = briefFiles.split('\n')[0];
    } else {
      logResult('Call Prep', false, 'No brief file created');
    }
  } catch (error) {
    logResult('Call Prep', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function testFollowupChecker() {
  try {
    const command = 'node /opt/smarty-projects/follow-up-checker.js';
    const output = execSync(command, { encoding: 'utf8', timeout: 15000 });
    logResult('Follow-up Checker', true, 'Completed');
  } catch (error) {
    logResult('Follow-up Checker', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function testDailyReport() {
  try {
    const command = 'node /opt/smarty-projects/daily-report.js --quiet';
    const output = execSync(command, { encoding: 'utf8', timeout: 15000 });
    logResult('Daily Report', true, 'Generated');
  } catch (error) {
    logResult('Daily Report', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function testLeadScorer() {
  try {
    // Create test CSV
    const testCsvContent = `email,name,company,score
test1@example.com,Test One,Test Corp,0
test2@example.com,Test Two,Test Inc,0`;
    
    fs.writeFileSync('/tmp/smoke-test-leads.csv', testCsvContent);
    
    const command = 'node /opt/smarty-projects/lead-scorer.js --input=/tmp/smoke-test-leads.csv --output=/tmp/smoke-test-scored.csv';
    const output = execSync(command, { encoding: 'utf8', timeout: 20000 });
    
    // Check if output file exists
    if (fs.existsSync('/tmp/smoke-test-scored.csv')) {
      logResult('Lead Scorer', true, 'Scored output created');
      global.testCsvFiles = ['/tmp/smoke-test-leads.csv', '/tmp/smoke-test-scored.csv'];
    } else {
      logResult('Lead Scorer', false, 'Output file not created');
    }
  } catch (error) {
    logResult('Lead Scorer', false, `Exit code ${error.status}: ${error.message}`);
  }
}

async function cleanup() {
  if (noCleanup) {
    log('\n🧹 Cleanup skipped (--no-cleanup flag)');
    return;
  }

  let cleanupPassed = true;
  
  try {
    // Delete CRM contact and deals
    if (global.testContactId && global.sessionCookie) {
      try {
        const deleteOptions = {
          hostname: 'localhost',
          port: 3000,
          path: `/api/contacts/${global.testContactId}`,
          method: 'DELETE',
          headers: {
            'Cookie': global.sessionCookie
          }
        };
        
        await makeHttpRequest(deleteOptions);
        log('✓ Test contact deleted from CRM');
      } catch (error) {
        log('✗ Failed to delete test contact');
        cleanupPassed = false;
      }
    }

    // Remove temp files
    if (global.testCsvFiles) {
      for (const file of global.testCsvFiles) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            log(`✓ Removed ${file}`);
          }
        } catch (error) {
          log(`✗ Failed to remove ${file}`);
          cleanupPassed = false;
        }
      }
    }

    // Remove test brief file
    if (global.testBriefFile) {
      try {
        if (fs.existsSync(global.testBriefFile)) {
          fs.unlinkSync(global.testBriefFile);
          log('✓ Removed test call brief');
        }
      } catch (error) {
        log('✗ Failed to remove test brief');
        cleanupPassed = false;
      }
    }

    logResult('Cleanup', cleanupPassed, cleanupPassed ? 'Test data removed' : 'Some cleanup failed');
  } catch (error) {
    logResult('Cleanup', false, error.message);
  }
}

// Main execution
async function main() {
  log('🔥 SMOKE TEST — Sales Automation Pipeline');
  log(`Date: ${new Date().toLocaleString()}`);
  log('');

  // Run tests in order
  await runTest('webhook-positive', testWebhookPositive);
  await runTest('webhook-negative', testWebhookNegative);
  await runTest('auto-pipeline', testAutoPipeline);
  await runTest('crm-verify', testCRMDealCreated);
  await runTest('sms', testSMSTouch);
  await runTest('call-prep', testCallPrep);
  await runTest('follow-up', testFollowupChecker);
  await runTest('daily-report', testDailyReport);
  await runTest('lead-scorer', testLeadScorer);
  
  if (!onlyTest) {
    await runTest('cleanup', cleanup);
  }

  // Final results
  log('');
  const total = results.passed + results.failed;
  if (results.failed === 0) {
    log(`Result: ${results.passed}/${total} PASSED ✅`);
    process.exit(0);
  } else {
    log(`Result: ${results.passed}/${total} PASSED, ${results.failed} FAILED ❌`);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log(`\n❌ CRITICAL ERROR: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log(`\n❌ UNHANDLED REJECTION: ${error.message}`);
  process.exit(1);
});

// Run the smoke test
main().catch((error) => {
  log(`\n❌ SMOKE TEST FAILED: ${error.message}`);
  process.exit(1);
});