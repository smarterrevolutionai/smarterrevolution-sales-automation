#!/usr/bin/env node

/**
 * SMS Touch Script for Hot Leads
 * Sends personalized SMS messages via Twilio API
 * 
 * CLI Usage: node sms-touch.js --to="+15551234567" --name="John" --template="initial" --company="Acme Corp"
 * Module Usage: const { sendSMS } = require('./sms-touch.js')
 */

// Twilio Configuration
const TWILIO_SID = 'process.env.TWILIO_SID';
const TWILIO_AUTH_TOKEN = 'process.env.TWILIO_AUTH_TOKEN';
const TWILIO_FROM_NUMBER = '+18446620687'
const TWILIO_API_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

// SMS Templates
const SMS_TEMPLATES = {
  initial: "Hi {firstName}, this is Henry from Smarter Revolution. Saw your reply about the AI audit - would love to set up a quick 15-min call with our team. Here's my calendar: https://smarterrevolutionai.com/book",
  followup: "Hey {firstName}, just following up. The AI visibility audit is completely free and takes about 15 minutes. Any interest? - Henry",
  final: "Hi {firstName}, last note from me. If AI optimization is ever on your radar, we're here: smarterrevolutionai.com. Best, Henry"
};

/**
 * Render SMS template with variables
 */
function renderTemplate(template, variables) {
  let message = SMS_TEMPLATES[template];
  if (!message) {
    throw new Error(`Invalid template: ${template}. Available: ${Object.keys(SMS_TEMPLATES).join(', ')}`);
  }

  // Replace template variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    message = message.replace(new RegExp(placeholder, 'g'), value);
  }

  return message;
}

/**
 * Send SMS via Twilio API
 */
async function sendSMS(options) {
  const { to, name, template, company, dryRun = false } = options;

  // Validate required parameters
  if (!to || !name || !template) {
    throw new Error('Missing required parameters: to, name, template');
  }

  // Render message template
  const message = renderTemplate(template, {
    firstName: name,
    company: company || ''
  });

  console.log(`[SMS Touch] Template: ${template}`);
  console.log(`[SMS Touch] To: ${to}`);
  console.log(`[SMS Touch] Name: ${name}`);
  if (company) console.log(`[SMS Touch] Company: ${company}`);
  console.log(`[SMS Touch] Message: ${message}`);

  // Dry run mode - just print the message
  if (dryRun) {
    console.log(`[SMS Touch] DRY RUN - Message would be sent to ${to}`);
    return {
      success: true,
      dryRun: true,
      message: message,
      to: to
    };
  }

  try {
    // Prepare form data for Twilio API
    const formData = new URLSearchParams({
      To: to,
      From: TWILIO_FROM_NUMBER,
      Body: message
    });

    // Basic auth header
    const authHeader = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    // Send SMS via Twilio API
    const response = await fetch(TWILIO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[SMS Touch] SUCCESS - SID: ${result.sid}, Status: ${result.status}`);
      return {
        success: true,
        sid: result.sid,
        status: result.status,
        message: message,
        to: to
      };
    } else {
      console.error(`[SMS Touch] ERROR - ${result.message} (Code: ${result.code})`);
      return {
        success: false,
        error: result.message,
        code: result.code
      };
    }

  } catch (error) {
    console.error(`[SMS Touch] NETWORK ERROR - ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const options = {};
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      const paramName = key.slice(2); // Remove '--'
      
      if (paramName === 'dry-run') {
        options.dryRun = true;
      } else {
        options[paramName] = value;
      }
    }
  }

  return options;
}

/**
 * Display usage information
 */
function showUsage() {
  console.log(`
SMS Touch Script for Hot Leads

Usage:
  node sms-touch.js --to="+15551234567" --name="John" --template="initial" [options]

Required:
  --to         Phone number (E.164 format, e.g., +15551234567)
  --name       First name for personalization
  --template   Template type: initial, followup, final

Optional:
  --company    Company name (for additional context)
  --dry-run    Print message without sending

Templates:
  initial      First SMS after warm email reply
  followup     Follow-up SMS after 3 days
  final        Final touch SMS after 7 days

Examples:
  node sms-touch.js --to="+15551234567" --name="John" --template="initial" --company="Acme Corp"
  node sms-touch.js --to="+15551234567" --name="Jane" --template="followup" --dry-run
`);
}

// CLI Mode
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const options = parseArgs(args);

  // Validate required CLI arguments
  if (!options.to || !options.name || !options.template) {
    console.error('Error: Missing required arguments');
    showUsage();
    process.exit(1);
  }

  // Send SMS
  sendSMS(options)
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('Failed to send SMS');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error.message);
      process.exit(1);
    });
}

// Module exports
module.exports = {
  sendSMS,
  SMS_TEMPLATES,
  renderTemplate
};