# AI Visibility Audit Automation

Automated system that:
1. Monitors for new assessment submissions from smarterrevolutionai.com
2. Runs AI visibility audits (ChatGPT/Claude, search results, website analysis)
3. Generates personalized PDF reports
4. Emails reports to prospects
5. Updates CRM with audit results

## Setup

1. Copy .env.template to .env and configure:
   - OPENROUTER_API_KEY: Get from openrouter.ai
   - SMTP_USER/SMTP_PASS: Gmail credentials

2. Install dependencies:
   `npm install`

3. Test the system:
   `npm test`

4. Start the automation:
   `npm start`

## Files

- auto-audit-full.js: Main automation script
- test-automation.js: Test script
- package.json: Dependencies
- .env.template: Environment configuration template

## Usage

The system runs continuously, checking for new assessment submissions every minute.
Processed submissions are tracked in processed-assessments.json to avoid duplicates.
Reports are saved in the ./reports/ directory.
