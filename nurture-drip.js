#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const STATE_FILE = '/opt/smarty-projects/nurture-state.json';
const DAYS_BETWEEN_EMAILS = 30;

// Email templates for 6-month rotation
const EMAIL_TEMPLATES = {
  1: {
    subject: "Quick thought on AI in {industry}",
    type: "Industry Insight",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      return {
        subject: `Quick thought on AI in ${lead.industry}`,
        textBody: `Hi ${firstName},

I came across some interesting data about how AI is changing the ${lead.industry.toLowerCase()} industry and thought you might find it relevant.

Companies in your space are starting to see real efficiency gains from AI automation - not the flashy stuff you see in headlines, but practical applications that actually save time and reduce errors.

Worth keeping an eye on how this trend develops in ${lead.industry.toLowerCase()}.

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>I came across some interesting data about how AI is changing the ${lead.industry.toLowerCase()} industry and thought you might find it relevant.</p>

<p>Companies in your space are starting to see real efficiency gains from AI automation - not the flashy stuff you see in headlines, but practical applications that actually save time and reduce errors.</p>

<p>Worth keeping an eye on how this trend develops in ${lead.industry.toLowerCase()}.</p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  },
  2: {
    subject: "How a {similarCompany} saved 20 hours/week",
    type: "Case Study",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      const companySizes = {
        'Manufacturing': 'mid-size manufacturer',
        'Healthcare': 'medical practice',
        'Legal': 'law firm',
        'Finance': 'accounting firm',
        'Technology': 'tech startup',
        'Retail': 'retail business',
        'Construction': 'construction company'
      };
      const similarCompany = companySizes[lead.industry] || 'business like yours';
      
      return {
        subject: `How a ${similarCompany} saved 20 hours/week`,
        textBody: `Hi ${firstName},

Quick story that might interest you:

A ${similarCompany} was drowning in manual data entry and report generation. Their team was spending 20+ hours per week on repetitive tasks that could be automated.

We helped them implement a simple AI workflow that:
- Automatically processes incoming documents
- Generates weekly reports without human input
- Flags exceptions that need attention

Result: 20 hours back per week, zero errors, and their team can focus on actual decision-making instead of data shuffling.

Not saying you have the same challenges, but figured the approach might spark some ideas.

Happy to chat if this resonates.

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>Quick story that might interest you:</p>

<p>A ${similarCompany} was drowning in manual data entry and report generation. Their team was spending 20+ hours per week on repetitive tasks that could be automated.</p>

<p>We helped them implement a simple AI workflow that:</p>
<ul>
<li>Automatically processes incoming documents</li>
<li>Generates weekly reports without human input</li>
<li>Flags exceptions that need attention</li>
</ul>

<p><strong>Result:</strong> 20 hours back per week, zero errors, and their team can focus on actual decision-making instead of data shuffling.</p>

<p>Not saying you have the same challenges, but figured the approach might spark some ideas.</p>

<p>Happy to chat if this resonates.</p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  },
  3: {
    subject: "{firstName}, one AI trick for {painPoint}",
    type: "Quick Tip",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      const painPoints = {
        'Manufacturing': 'quality control',
        'Healthcare': 'appointment scheduling',
        'Legal': 'document review',
        'Finance': 'data reconciliation',
        'Technology': 'bug detection',
        'Retail': 'inventory management',
        'Construction': 'project tracking'
      };
      const painPoint = painPoints[lead.industry] || 'workflow optimization';
      
      return {
        subject: `${firstName}, one AI trick for ${painPoint}`,
        textBody: `Hi ${firstName},

Here's a simple AI trick you can implement this week for ${painPoint}:

Set up email rules that automatically categorize and route messages based on content patterns. Most email clients have this built-in, but you can make it smarter by training it to recognize specific types of requests.

For example:
- Flag urgent vs. routine communications
- Auto-route vendor emails to the right department
- Create follow-up reminders for important threads

Takes about 30 minutes to set up, saves hours every week.

The key is starting small and training the system with real examples from your inbox.

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>Here's a simple AI trick you can implement this week for ${painPoint}:</p>

<p>Set up email rules that automatically categorize and route messages based on content patterns. Most email clients have this built-in, but you can make it smarter by training it to recognize specific types of requests.</p>

<p>For example:</p>
<ul>
<li>Flag urgent vs. routine communications</li>
<li>Auto-route vendor emails to the right department</li>
<li>Create follow-up reminders for important threads</li>
</ul>

<p><strong>Takes about 30 minutes to set up, saves hours every week.</strong></p>

<p>The key is starting small and training the system with real examples from your inbox.</p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  },
  4: {
    subject: "AI adoption in {industry} just hit {X}%",
    type: "Market Update",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      const adoptionStats = {
        'Manufacturing': '67%',
        'Healthcare': '58%',
        'Legal': '45%',
        'Finance': '72%',
        'Technology': '84%',
        'Retail': '53%',
        'Construction': '38%'
      };
      const stat = adoptionStats[lead.industry] || '55%';
      
      return {
        subject: `AI adoption in ${lead.industry} just hit ${stat}`,
        textBody: `Hi ${firstName},

Just saw some research that caught my attention:

AI adoption in the ${lead.industry.toLowerCase()} sector hit ${stat} this quarter. That's up from about 30% just two years ago.

What's interesting is that most companies aren't going for the big, flashy AI projects. They're starting with simple automation:

- Document processing
- Email sorting
- Basic data analysis
- Routine task scheduling

The companies seeing the best results are the ones that started small and built up their AI capabilities gradually.

Thought you'd find the trend interesting given our conversation about ${lead.company}'s efficiency goals.

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>Just saw some research that caught my attention:</p>

<p><strong>AI adoption in the ${lead.industry.toLowerCase()} sector hit ${stat} this quarter.</strong> That's up from about 30% just two years ago.</p>

<p>What's interesting is that most companies aren't going for the big, flashy AI projects. They're starting with simple automation:</p>

<ul>
<li>Document processing</li>
<li>Email sorting</li>
<li>Basic data analysis</li>
<li>Routine task scheduling</li>
</ul>

<p>The companies seeing the best results are the ones that started small and built up their AI capabilities gradually.</p>

<p>Thought you'd find the trend interesting given our conversation about ${lead.company}'s efficiency goals.</p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  },
  5: {
    subject: "Free AI readiness playbook for {industry}",
    type: "Free Resource",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      
      return {
        subject: `Free AI readiness playbook for ${lead.industry}`,
        textBody: `Hi ${firstName},

I put together an AI Readiness Playbook specifically for ${lead.industry.toLowerCase()} companies and thought you might find it useful.

It's a practical guide that covers:
- Where to start with AI (without breaking the bank)
- Common mistakes to avoid
- Simple frameworks for evaluating AI opportunities
- Real examples from companies like ${lead.company}

No fluff, just actionable steps you can take this month.

You can download it here: https://smarterrevolutionai.com/playbook

Hope it's helpful for your planning.

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>I put together an <strong>AI Readiness Playbook</strong> specifically for ${lead.industry.toLowerCase()} companies and thought you might find it useful.</p>

<p>It's a practical guide that covers:</p>
<ul>
<li>Where to start with AI (without breaking the bank)</li>
<li>Common mistakes to avoid</li>
<li>Simple frameworks for evaluating AI opportunities</li>
<li>Real examples from companies like ${lead.company}</li>
</ul>

<p>No fluff, just actionable steps you can take this month.</p>

<p><strong><a href="https://smarterrevolutionai.com/playbook">Download the playbook here</a></strong></p>

<p>Hope it's helpful for your planning.</p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  },
  6: {
    subject: "Still thinking about AI, {firstName}?",
    type: "Re-engagement",
    generateContent: (lead) => {
      const firstName = lead.name.split(' ')[0];
      const monthsAgo = Math.floor((new Date() - new Date(lead.addedDate)) / (1000 * 60 * 60 * 24 * 30));
      
      return {
        subject: `Still thinking about AI, ${firstName}?`,
        textBody: `Hi ${firstName},

It's been about ${monthsAgo} months since we last spoke about AI automation for ${lead.company}.

A lot has changed in the AI space since then:
- Tools have become more user-friendly
- Costs have dropped significantly
- Implementation has gotten much simpler

I'm curious if your priorities have shifted at all, or if AI automation is still on your radar.

If you're interested, I'd be happy to offer a fresh AI Visibility Audit to see what new opportunities might make sense for ${lead.company} now.

No pressure - just thought I'd check in.

You can book a quick call here: https://smarterrevolutionai.com/audit

Best,
Henry Alouf
Smarter Revolution

PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.`,
        htmlBody: `<p>Hi ${firstName},</p>

<p>It's been about ${monthsAgo} months since we last spoke about AI automation for ${lead.company}.</p>

<p>A lot has changed in the AI space since then:</p>
<ul>
<li>Tools have become more user-friendly</li>
<li>Costs have dropped significantly</li>
<li>Implementation has gotten much simpler</li>
</ul>

<p>I'm curious if your priorities have shifted at all, or if AI automation is still on your radar.</p>

<p>If you're interested, I'd be happy to offer a fresh <strong>AI Visibility Audit</strong> to see what new opportunities might make sense for ${lead.company} now.</p>

<p>No pressure - just thought I'd check in.</p>

<p><strong><a href="https://smarterrevolutionai.com/audit">Book a quick call here</a></strong></p>

<p>Best,<br>
Henry Alouf<br>
Smarter Revolution</p>

<p><em>PS - If this isn't useful, just reply 'stop' and I'll remove you. No hard feelings.</em></p>`
      };
    }
  }
};

// Utility functions
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading state:', error.message);
  }
  
  return { leads: [] };
}

function saveState(state) {
  try {
    // Atomic write: write to temp file then rename
    const tempFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
    fs.renameSync(tempFile, STATE_FILE);
    return true;
  } catch (error) {
    console.error('Error saving state:', error.message);
    return false;
  }
}

function calculateNextSendDate(addedDate, lastSentMonth) {
  const added = new Date(addedDate);
  const nextMonth = (lastSentMonth % 6) + 1;
  const monthsToAdd = nextMonth + Math.floor(lastSentMonth / 6) * 6;
  
  const nextDate = new Date(added);
  nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
  
  return nextDate.toISOString().split('T')[0];
}

function isEmailDue(lead) {
  if (lead.status !== 'active') return false;
  
  const today = new Date();
  const nextSendDate = new Date(lead.nextSendDate);
  
  return today >= nextSendDate;
}

function getNextEmailMonth(lead) {
  return (lead.lastSentMonth % 6) + 1;
}

// Core functions
function addLead(email, name, company, industry) {
  const state = loadState();
  
  // Check if lead already exists
  const existingLead = state.leads.find(l => l.email === email);
  if (existingLead) {
    return { success: false, error: 'Lead already exists' };
  }
  
  const today = new Date().toISOString().split('T')[0];
  const nextSendDate = calculateNextSendDate(today, 0);
  
  const lead = {
    email,
    name,
    company,
    industry,
    addedDate: today,
    lastSentMonth: 0,
    lastSentDate: null,
    nextSendDate,
    status: 'active'
  };
  
  state.leads.push(lead);
  
  if (saveState(state)) {
    return { success: true, lead };
  } else {
    return { success: false, error: 'Failed to save state' };
  }
}

function removeLead(email) {
  const state = loadState();
  const initialCount = state.leads.length;
  
  state.leads = state.leads.filter(l => l.email !== email);
  
  if (state.leads.length === initialCount) {
    return { success: false, error: 'Lead not found' };
  }
  
  if (saveState(state)) {
    return { success: true };
  } else {
    return { success: false, error: 'Failed to save state' };
  }
}

function listLeads() {
  const state = loadState();
  return { success: true, leads: state.leads };
}

function checkPending() {
  const state = loadState();
  const pendingLeads = state.leads.filter(isEmailDue);
  
  const emails = pendingLeads.map(lead => {
    const emailMonth = getNextEmailMonth(lead);
    const template = EMAIL_TEMPLATES[emailMonth];
    const content = template.generateContent(lead);
    
    return {
      lead: {
        email: lead.email,
        name: lead.name,
        company: lead.company,
        industry: lead.industry
      },
      month: emailMonth,
      type: template.type,
      email: {
        from: 'Henry Alouf <henry@smarterrevolutionai.com>',
        to: `${lead.name} <${lead.email}>`,
        subject: content.subject,
        textBody: content.textBody,
        htmlBody: content.htmlBody
      }
    };
  });
  
  return { success: true, pendingEmails: emails, count: emails.length };
}

function sendPending() {
  const pendingResult = checkPending();
  if (!pendingResult.success) return pendingResult;
  
  const state = loadState();
  const today = new Date().toISOString().split('T')[0];
  
  // Update state for sent emails
  pendingResult.pendingEmails.forEach(emailData => {
    const lead = state.leads.find(l => l.email === emailData.lead.email);
    if (lead) {
      lead.lastSentMonth = emailData.month;
      lead.lastSentDate = today;
      lead.nextSendDate = calculateNextSendDate(lead.addedDate, lead.lastSentMonth);
    }
  });
  
  if (saveState(state)) {
    return { 
      success: true, 
      sentEmails: pendingResult.pendingEmails,
      count: pendingResult.count 
    };
  } else {
    return { success: false, error: 'Failed to update state after sending' };
  }
}

// CLI handling
function handleCLI() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  
  if (args.includes('--add')) {
    const email = args.find(arg => arg.startsWith('--email=')).split('=')[1];
    const name = args.find(arg => arg.startsWith('--name=')).split('=')[1];
    const company = args.find(arg => arg.startsWith('--company=')).split('=')[1];
    const industry = args.find(arg => arg.startsWith('--industry=')).split('=')[1];
    
    const result = addLead(email, name, company, industry);
    console.log(JSON.stringify(result, null, 2));
    
  } else if (args.includes('--remove')) {
    const email = args.find(arg => arg.startsWith('--email=')).split('=')[1];
    
    const result = removeLead(email);
    console.log(JSON.stringify(result, null, 2));
    
  } else if (args.includes('--list')) {
    const result = listLeads();
    console.log(JSON.stringify(result, null, 2));
    
  } else if (args.includes('--check')) {
    const result = checkPending();
    if (isDryRun) {
      console.log('DRY RUN - Emails that would be sent:');
    }
    console.log(JSON.stringify(result, null, 2));
    
  } else if (args.includes('--send')) {
    if (isDryRun) {
      const result = checkPending();
      console.log('DRY RUN - Emails that would be sent:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      const result = sendPending();
      console.log(JSON.stringify(result, null, 2));
    }
    
  } else {
    console.log(`
Warm Lead Nurture Drip System

Usage:
  node nurture-drip.js --add --email="email@company.com" --name="First Last" --company="Company" --industry="Industry"
  node nurture-drip.js --remove --email="email@company.com"
  node nurture-drip.js --list
  node nurture-drip.js --check [--dry-run]
  node nurture-drip.js --send [--dry-run]

Options:
  --dry-run    Show what would be done without making changes
    `);
  }
}

// Module exports
module.exports = {
  addLead,
  removeLead,
  listLeads,
  checkPending,
  sendPending
};

// CLI execution
if (require.main === module) {
  handleCLI();
}