#!/usr/bin/env node
/**
 * Firecrawl Competitor Intelligence Script
 * Tracks competitor websites and reports changes
 * 
 * Usage: node firecrawl-competitor-intel.js [--update]
 * --update: Force update even if no changes detected
 */

const fs = require('fs');
const path = require('path');

const FIRECRAWL_API_KEY = 'process.env.FIRECRAWL_API_KEY';
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';

// State file location
const STATE_FILE = '/opt/smarty-projects/competitor-state.json';

// Competitors to track (configure as needed)
const COMPETITORS = [
  { name: 'Example AI Consulting', domain: 'https://example-ai-consulting.com' },
  { name: 'AI Solutions Inc', domain: 'https://ai-solutions-example.com' },
  { name: 'Digital Transform Co', domain: 'https://digital-transform-example.com' }
  // Add real competitors here
];

async function scrapeUrl(url) {
  try {
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
  } catch (err) {
    return null;
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.log('No previous state found, starting fresh.');
  }
  return { lastRun: null, competitors: {} };
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`State saved to ${STATE_FILE}`);
  } catch (err) {
    console.error('Failed to save state:', err.message);
  }
}

function hashContent(content) {
  // Simple hash for change detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

async function analyzeCompetitor(competitor, previousData) {
  console.log(`\n📊 Analyzing: ${competitor.name}`);
  
  const result = {
    name: competitor.name,
    domain: competitor.domain,
    scannedAt: new Date().toISOString(),
    pages: {},
    changes: [],
    summary: ''
  };
  
  const pagesToCheck = [
    { name: 'homepage', path: '' },
    { name: 'pricing', path: '/pricing' },
    { name: 'services', path: '/services' },
    { name: 'products', path: '/products' },
    { name: 'blog', path: '/blog' },
    { name: 'about', path: '/about' }
  ];
  
  for (const page of pagesToCheck) {
    const url = competitor.domain + page.path;
    console.log(`  Checking ${page.name}...`);
    
    const data = await scrapeUrl(url);
    
    if (data && data.markdown) {
      const contentHash = hashContent(data.markdown);
      const prevHash = previousData?.pages?.[page.name]?.hash;
      
      result.pages[page.name] = {
        url,
        title: data.metadata?.title || '',
        hash: contentHash,
        contentLength: data.markdown.length,
        excerpt: data.markdown.substring(0, 500)
      };
      
      if (prevHash && prevHash !== contentHash) {
        result.changes.push({
          page: page.name,
          type: 'content_changed',
          description: `${page.name} page content has been updated`
        });
        console.log(`  ⚠️  ${page.name}: CHANGED`);
      } else if (!prevHash) {
        console.log(`  ✅ ${page.name}: New page tracked`);
      } else {
        console.log(`  ✅ ${page.name}: No change`);
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Generate summary
  if (result.changes.length > 0) {
    result.summary = `${result.changes.length} change(s) detected on ${competitor.name}`;
  } else {
    result.summary = `No changes detected on ${competitor.name}`;
  }
  
  return result;
}

function generateReport(results, state) {
  const now = new Date();
  const lastRun = state.lastRun ? new Date(state.lastRun) : null;
  
  let hasChanges = false;
  for (const r of results) {
    if (r.changes.length > 0) hasChanges = true;
  }
  
  let report = `# Competitor Intelligence Report

**Generated:** ${now.toLocaleDateString()} ${now.toLocaleTimeString()}
${lastRun ? `**Previous Scan:** ${lastRun.toLocaleDateString()}` : '**First Scan**'}

---

## Summary

${hasChanges ? '⚠️ **Changes detected!** Review below for details.' : '✅ **No significant changes** detected across monitored competitors.'}

---

## Competitor Status

`;

  for (const result of results) {
    report += `### ${result.name}
**Website:** ${result.domain}

`;
    
    if (result.changes.length > 0) {
      report += `**🔔 Changes Detected:**\n`;
      for (const change of result.changes) {
        report += `- ${change.description}\n`;
      }
      report += '\n';
    } else {
      report += `No changes since last scan.\n\n`;
    }
    
    report += `**Pages Tracked:**\n`;
    for (const [pageName, pageData] of Object.entries(result.pages)) {
      report += `- ${pageName}: ${pageData.title || 'Untitled'}\n`;
    }
    report += '\n---\n\n';
  }
  
  report += `## Recommendations

`;
  
  if (hasChanges) {
    report += `- Review changed pages for pricing updates, new offerings, or messaging shifts
- Consider if any changes warrant adjustments to our positioning
- Flag significant changes for Mark and Wolf's review
`;
  } else {
    report += `- Continue monitoring on regular schedule
- Consider expanding competitor list if market is evolving
- Review quarterly for strategic positioning updates
`;
  }
  
  report += `
---
*Generated by Firecrawl Competitor Intel*
*Smarter Revolution AI*
`;

  return report;
}

async function main() {
  const forceUpdate = process.argv.includes('--update');
  
  console.log('🔍 Competitor Intelligence Scan');
  console.log('================================\n');
  
  // Load previous state
  const state = loadState();
  console.log(state.lastRun ? `Last scan: ${state.lastRun}` : 'First scan');
  
  const results = [];
  
  for (const competitor of COMPETITORS) {
    const previousData = state.competitors[competitor.domain];
    const result = await analyzeCompetitor(competitor, previousData);
    results.push(result);
    
    // Update state
    state.competitors[competitor.domain] = {
      lastScanned: result.scannedAt,
      pages: result.pages
    };
  }
  
  // Update state timestamp
  state.lastRun = new Date().toISOString();
  
  // Save state
  saveState(state);
  
  // Generate and output report
  const report = generateReport(results, state);
  
  console.log('\n' + '='.repeat(60));
  console.log(report);
  console.log('='.repeat(60));
  
  // Also output JSON summary
  const summary = {
    scannedAt: state.lastRun,
    competitorsScanned: results.length,
    totalChanges: results.reduce((sum, r) => sum + r.changes.length, 0),
    competitors: results.map(r => ({
      name: r.name,
      changes: r.changes.length,
      summary: r.summary
    }))
  };
  
  console.log('\n📊 JSON Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

main();
