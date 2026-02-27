#!/usr/bin/env node
/**
 * Firecrawl AI Audit Script
 * Generates AI readiness assessment reports for prospect companies
 * 
 * Usage: node firecrawl-ai-audit.js <domain>
 * Example: node firecrawl-ai-audit.js acme.com
 */

const FIRECRAWL_API_KEY = 'process.env.FIRECRAWL_API_KEY';
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';

async function scrapeUrl(url) {
  const response = await fetch(FIRECRAWL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });
  
  const data = await response.json();
  if (!data.success) {
    return null;
  }
  return data.data;
}

async function auditCompany(domain) {
  console.log(`\n🔍 AI Readiness Audit: ${domain}\n`);
  
  if (!domain.startsWith('http')) {
    domain = `https://${domain}`;
  }
  
  const audit = {
    domain,
    auditedAt: new Date().toISOString(),
    pages: {},
    metrics: {},
    score: 0,
    report: null
  };
  
  // Pages to analyze
  const pagesToScrape = [
    { name: 'homepage', url: domain, weight: 3 },
    { name: 'about', url: `${domain}/about`, weight: 2 },
    { name: 'services', url: `${domain}/services`, weight: 2 },
    { name: 'blog', url: `${domain}/blog`, weight: 2 },
    { name: 'contact', url: `${domain}/contact`, weight: 1 },
    { name: 'careers', url: `${domain}/careers`, weight: 1 },
    { name: 'team', url: `${domain}/team`, weight: 1 }
  ];
  
  let totalWeight = 0;
  let successWeight = 0;
  
  for (const page of pagesToScrape) {
    console.log(`  Analyzing ${page.name}...`);
    totalWeight += page.weight;
    
    try {
      const data = await scrapeUrl(page.url);
      if (data && data.markdown) {
        audit.pages[page.name] = {
          url: page.url,
          title: data.metadata?.title || '',
          contentLength: data.markdown.length,
          content: data.markdown.substring(0, 8000)
        };
        successWeight += page.weight;
        console.log(`  ✅ ${page.name}: ${data.markdown.length} chars`);
      }
    } catch (err) {
      // Skip failed pages
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Calculate metrics and score
  audit.metrics = calculateMetrics(audit);
  audit.score = calculateScore(audit.metrics);
  audit.report = generateAuditReport(audit);
  
  return audit;
}

function calculateMetrics(audit) {
  const metrics = {
    websiteCompleteness: 0,
    contentQuality: 0,
    techModernity: 0,
    digitalPresence: 0,
    teamStructure: 0,
    automationReadiness: 0
  };
  
  const pageCount = Object.keys(audit.pages).length;
  
  // Website Completeness (do they have standard pages?)
  metrics.websiteCompleteness = Math.min(100, (pageCount / 5) * 100);
  
  // Content Quality (based on content length and structure)
  let totalContent = 0;
  let hasHeaders = false;
  let hasBullets = false;
  
  for (const page of Object.values(audit.pages)) {
    totalContent += page.contentLength;
    if (page.content.match(/^#{1,3}\s/m)) hasHeaders = true;
    if (page.content.match(/^[\-\*•]\s/m)) hasBullets = true;
  }
  
  metrics.contentQuality = Math.min(100, 
    (totalContent > 10000 ? 40 : totalContent / 250) +
    (hasHeaders ? 30 : 0) +
    (hasBullets ? 30 : 0)
  );
  
  // Tech Modernity (look for modern tech signals)
  const allContent = Object.values(audit.pages).map(p => p.content).join(' ').toLowerCase();
  let techScore = 50; // Base score
  
  if (allContent.includes('api')) techScore += 10;
  if (allContent.includes('integration')) techScore += 10;
  if (allContent.includes('automation')) techScore += 15;
  if (allContent.includes('cloud')) techScore += 10;
  if (allContent.includes('data')) techScore += 5;
  
  metrics.techModernity = Math.min(100, techScore);
  
  // Digital Presence (blog, careers, social signals)
  let presenceScore = 30;
  if (audit.pages.blog) presenceScore += 30;
  if (audit.pages.careers) presenceScore += 20;
  if (allContent.includes('linkedin') || allContent.includes('twitter')) presenceScore += 20;
  
  metrics.digitalPresence = Math.min(100, presenceScore);
  
  // Team Structure (signals of organized team)
  let teamScore = 30;
  if (audit.pages.team) teamScore += 30;
  if (audit.pages.careers) teamScore += 20;
  if (allContent.match(/\d+\s*(employees?|team|people)/i)) teamScore += 20;
  
  metrics.teamStructure = Math.min(100, teamScore);
  
  // Automation Readiness (existing automation/AI mentions)
  let autoScore = 20;
  if (allContent.includes('ai') || allContent.includes('artificial intelligence')) autoScore += 25;
  if (allContent.includes('automat')) autoScore += 25;
  if (allContent.includes('machine learning')) autoScore += 15;
  if (allContent.includes('chatbot') || allContent.includes('chat bot')) autoScore += 15;
  
  metrics.automationReadiness = Math.min(100, autoScore);
  
  return metrics;
}

function calculateScore(metrics) {
  const weights = {
    websiteCompleteness: 0.15,
    contentQuality: 0.20,
    techModernity: 0.20,
    digitalPresence: 0.15,
    teamStructure: 0.10,
    automationReadiness: 0.20
  };
  
  let score = 0;
  for (const [metric, weight] of Object.entries(weights)) {
    score += metrics[metric] * weight;
  }
  
  return Math.round(score);
}

function generateAuditReport(audit) {
  const { metrics, score } = audit;
  
  // Determine readiness level
  let readinessLevel, readinessEmoji;
  if (score >= 80) {
    readinessLevel = 'Highly Ready';
    readinessEmoji = '🟢';
  } else if (score >= 60) {
    readinessLevel = 'Moderately Ready';
    readinessEmoji = '🟡';
  } else if (score >= 40) {
    readinessLevel = 'Developing';
    readinessEmoji = '🟠';
  } else {
    readinessLevel = 'Early Stage';
    readinessEmoji = '🔴';
  }
  
  // Generate strengths
  const strengths = [];
  if (metrics.contentQuality >= 70) strengths.push('Strong content foundation');
  if (metrics.techModernity >= 70) strengths.push('Technology-forward mindset');
  if (metrics.digitalPresence >= 70) strengths.push('Active digital presence');
  if (metrics.automationReadiness >= 50) strengths.push('Already exploring automation');
  if (metrics.websiteCompleteness >= 80) strengths.push('Comprehensive web presence');
  
  // Generate opportunities
  const opportunities = [];
  if (metrics.automationReadiness < 50) opportunities.push('Customer service automation with AI chatbots');
  if (metrics.contentQuality < 60) opportunities.push('AI-powered content creation and optimization');
  if (metrics.digitalPresence < 60) opportunities.push('Automated social media and marketing');
  opportunities.push('Internal process automation');
  opportunities.push('AI-assisted data analysis and reporting');
  opportunities.push('Intelligent document processing');
  
  // Generate recommendations
  const recommendations = [
    'Start with a pilot AI project in customer service or marketing',
    'Audit internal processes for automation opportunities',
    'Train team on AI tools and best practices',
    'Develop an AI governance framework'
  ];
  
  return {
    score,
    readinessLevel,
    readinessEmoji,
    metrics,
    strengths: strengths.slice(0, 4),
    opportunities: opportunities.slice(0, 5),
    recommendations,
    summary: `Based on our analysis, ${audit.domain} has an AI Readiness Score of ${score}/100, indicating a "${readinessLevel}" status for AI transformation.`
  };
}

function formatMarkdownReport(audit) {
  const r = audit.report;
  
  return `# AI Readiness Audit Report

**Company:** ${audit.domain}
**Audit Date:** ${new Date(audit.auditedAt).toLocaleDateString()}

---

## ${r.readinessEmoji} Overall Score: ${r.score}/100

**Readiness Level:** ${r.readinessLevel}

${r.summary}

---

## Detailed Metrics

| Category | Score |
|----------|-------|
| Website Completeness | ${r.metrics.websiteCompleteness}/100 |
| Content Quality | ${r.metrics.contentQuality}/100 |
| Technology Modernity | ${r.metrics.techModernity}/100 |
| Digital Presence | ${r.metrics.digitalPresence}/100 |
| Team Structure | ${r.metrics.teamStructure}/100 |
| Automation Readiness | ${r.metrics.automationReadiness}/100 |

---

## 💪 Strengths

${r.strengths.length > 0 ? r.strengths.map(s => `- ${s}`).join('\n') : '- Building foundation for AI transformation'}

---

## 🚀 AI Transformation Opportunities

${r.opportunities.map(o => `- ${o}`).join('\n')}

---

## 📋 Recommended Next Steps

${r.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

---

## Ready to Transform?

Smarter Revolution specializes in helping mid-market companies implement AI solutions that deliver real results. Let's discuss how we can help accelerate your AI journey.

📞 **Schedule a Discovery Call:** [Book Now](https://smarterrevolutionai.com/call)

---
*This audit was generated using AI-powered website analysis. Results are indicative and a full assessment would include additional factors.*

*Powered by Smarter Revolution AI*
`;
}

async function main() {
  const domain = process.argv[2];
  
  if (!domain) {
    console.log('Usage: node firecrawl-ai-audit.js <domain>');
    console.log('Example: node firecrawl-ai-audit.js acme.com');
    process.exit(1);
  }
  
  try {
    const audit = await auditCompany(domain);
    
    console.log('\n' + '='.repeat(60));
    console.log(formatMarkdownReport(audit));
    console.log('='.repeat(60));
    
    console.log('\n📊 JSON Summary:');
    console.log(JSON.stringify(audit.report, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
