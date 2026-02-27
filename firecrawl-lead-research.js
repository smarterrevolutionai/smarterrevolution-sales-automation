#!/usr/bin/env node
/**
 * Firecrawl Lead Research Script
 * Scrapes company websites to generate sales-ready company briefs
 * 
 * Usage: node firecrawl-lead-research.js <domain>
 * Example: node firecrawl-lead-research.js acme.com
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
    console.error(`Failed to scrape ${url}:`, data.error || 'Unknown error');
    return null;
  }
  return data.data;
}

async function researchCompany(domain) {
  console.log(`\n🔍 Researching: ${domain}\n`);
  
  // Normalize domain
  if (!domain.startsWith('http')) {
    domain = `https://${domain}`;
  }
  
  const results = {
    domain,
    scrapedAt: new Date().toISOString(),
    pages: {},
    brief: null
  };
  
  // Pages to try scraping
  const pagesToScrape = [
    { name: 'homepage', url: domain },
    { name: 'about', url: `${domain}/about` },
    { name: 'about-us', url: `${domain}/about-us` },
    { name: 'team', url: `${domain}/team` },
    { name: 'services', url: `${domain}/services` },
    { name: 'products', url: `${domain}/products` },
    { name: 'contact', url: `${domain}/contact` }
  ];
  
  // Scrape pages
  for (const page of pagesToScrape) {
    console.log(`  Scraping ${page.name}...`);
    try {
      const data = await scrapeUrl(page.url);
      if (data && data.markdown) {
        results.pages[page.name] = {
          url: page.url,
          title: data.metadata?.title || '',
          description: data.metadata?.description || '',
          content: data.markdown.substring(0, 5000) // Limit content size
        };
        console.log(`  ✅ ${page.name}: ${data.metadata?.title || 'OK'}`);
      }
    } catch (err) {
      // Page doesn't exist or error - skip silently
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Generate company brief
  results.brief = generateBrief(results);
  
  return results;
}

function generateBrief(results) {
  const homepage = results.pages.homepage || {};
  const about = results.pages.about || results.pages['about-us'] || {};
  const services = results.pages.services || results.pages.products || {};
  const team = results.pages.team || {};
  
  const brief = {
    company_name: extractCompanyName(homepage),
    website: results.domain,
    description: homepage.description || about.description || 'No description found',
    services: extractServices(services.content || homepage.content || ''),
    team_info: extractTeamInfo(team.content || about.content || ''),
    talking_points: [],
    potential_pain_points: []
  };
  
  // Generate talking points based on what we found
  if (brief.services.length > 0) {
    brief.talking_points.push(`They offer: ${brief.services.slice(0, 3).join(', ')}`);
  }
  if (brief.team_info) {
    brief.talking_points.push(`Team insight: ${brief.team_info}`);
  }
  
  // Identify potential pain points for AI transformation pitch
  brief.potential_pain_points = [
    'Manual processes that could be automated with AI',
    'Customer communication that could benefit from AI assistance',
    'Content creation and marketing that AI could accelerate',
    'Data analysis and reporting automation opportunities'
  ];
  
  return brief;
}

function extractCompanyName(homepage) {
  if (homepage.title) {
    // Usually company name is first part of title before | or -
    const parts = homepage.title.split(/[|\-–—]/);
    return parts[0].trim();
  }
  return 'Unknown Company';
}

function extractServices(content) {
  // Simple extraction - look for common patterns
  const services = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Look for bullet points or headers that might be services
    if (line.match(/^[\-\*•]\s+.{10,50}$/) || line.match(/^#{1,3}\s+.{5,40}$/)) {
      const service = line.replace(/^[\-\*•#\s]+/, '').trim();
      if (service.length > 5 && service.length < 60 && !services.includes(service)) {
        services.push(service);
      }
    }
    if (services.length >= 10) break;
  }
  
  return services;
}

function extractTeamInfo(content) {
  // Look for team size indicators
  const teamMatches = content.match(/(\d+)\s*(employees?|team members?|people|staff)/i);
  if (teamMatches) {
    return `Approximately ${teamMatches[1]} ${teamMatches[2]}`;
  }
  
  // Look for leadership mentions
  const leadershipMatch = content.match(/(CEO|Founder|President|Owner)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  if (leadershipMatch) {
    return `${leadershipMatch[1]}: ${leadershipMatch[2]}`;
  }
  
  return null;
}

function formatMarkdownReport(results) {
  const brief = results.brief;
  
  return `# Company Brief: ${brief.company_name}

**Website:** ${brief.website}
**Researched:** ${new Date(results.scrapedAt).toLocaleString()}

## Overview
${brief.description}

## Services/Products
${brief.services.length > 0 ? brief.services.map(s => `- ${s}`).join('\n') : 'No specific services identified'}

## Team Information
${brief.team_info || 'No team information found'}

## Talking Points for Sales Call
${brief.talking_points.map(p => `- ${p}`).join('\n')}

## Potential AI Transformation Opportunities
${brief.potential_pain_points.map(p => `- ${p}`).join('\n')}

---
*Generated by Firecrawl Lead Research*
`;
}

// Main execution
async function main() {
  const domain = process.argv[2];
  
  if (!domain) {
    console.log('Usage: node firecrawl-lead-research.js <domain>');
    console.log('Example: node firecrawl-lead-research.js acme.com');
    process.exit(1);
  }
  
  try {
    const results = await researchCompany(domain);
    
    console.log('\n' + '='.repeat(60));
    console.log(formatMarkdownReport(results));
    console.log('='.repeat(60));
    
    // Also output JSON for programmatic use
    console.log('\n📊 JSON Output:');
    console.log(JSON.stringify(results.brief, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
