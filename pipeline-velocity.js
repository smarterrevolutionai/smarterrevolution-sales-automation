#!/usr/bin/env node

/**
 * Pipeline Velocity Tracker
 * Analyzes deal flow through sales pipeline and identifies bottlenecks
 * 
 * Usage:
 *   node pipeline-velocity.js [--json] [--threshold=7]
 *   
 * Module:
 *   const { analyzePipeline } = require('./pipeline-velocity.js')
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Pipeline stages in order
const PIPELINE_STAGES = [
  'Lead Identified',
  'Discovery Call Booked', 
  'Discovery Call Complete',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
];

// Stage-specific at-risk thresholds (days)
const AT_RISK_THRESHOLDS = {
  'Discovery Call Booked': 5,    // Call not happening?
  'Proposal Sent': 10,           // Going cold?
  'Negotiation': 14              // Stuck?
};

/**
 * Make HTTP request with cookie authentication
 */
function makeRequest(method, path, data = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers.Cookie = cookie;
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ data: parsed, headers: res.headers });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || responseData}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Authenticate with CRM and get session cookie
 */
async function authenticate() {
  try {
    const response = await makeRequest('POST', '/api/auth/login', {
      username: 'admin',
      password: 'WorkSmarter2025!'
    });
    
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const sessionCookie = setCookieHeader.find(cookie => cookie.startsWith('sr_session='));
      if (sessionCookie) {
        return sessionCookie.split(';')[0]; // Extract just the sr_session=value part
      }
    }
    throw new Error('No session cookie in response');
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Fetch all deals from CRM
 */
async function fetchDeals(cookie) {
  const response = await makeRequest('GET', '/api/deals', null, cookie);
  return response.data.data; // Deals are nested in data.data
}

/**
 * Fetch activities for a specific deal
 */
async function fetchActivities(dealId, cookie) {
  const response = await makeRequest('GET', `/api/activities?dealId=${dealId}`, null, cookie);
  return response.data.data || []; // Activities are nested in data.data
}

/**
 * Convert UTC date to ET timezone string
 */
function toETString(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Get current date/time in ET
 */
function nowInET() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Calculate days between two dates
 */
function daysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
}

/**
 * Build timeline for a deal from its activities and stage transitions
 */
function buildDealTimeline(deal, activities) {
  const timeline = {};
  
  // Start with deal creation as Lead Identified
  timeline['Lead Identified'] = {
    date: deal.createdAt,
    days: 0
  };
  
  // For now, since activities don't contain stage transitions directly,
  // we'll use the deal's current stage and estimate progression based on timestamps
  const currentStage = deal.stage?.name || 'Lead Identified';
  const currentStageIndex = PIPELINE_STAGES.indexOf(currentStage);
  
  if (currentStageIndex > 0) {
    // For deals past Lead Identified, estimate stage progression
    // based on activities and deal progression flags
    let estimatedDate = new Date(deal.createdAt);
    
    for (let i = 1; i <= currentStageIndex; i++) {
      const stage = PIPELINE_STAGES[i];
      
      // Use specific deal flags to estimate timing
      switch (stage) {
        case 'Discovery Call Booked':
          if (deal.callScheduled && deal.callScheduledAt) {
            estimatedDate = new Date(deal.callScheduledAt);
          } else {
            // Estimate 2-3 days after lead identified
            estimatedDate = new Date(estimatedDate.getTime() + (2 * 24 * 60 * 60 * 1000));
          }
          break;
          
        case 'Discovery Call Complete':
          if (deal.callCompleted && deal.callCompletedAt) {
            estimatedDate = new Date(deal.callCompletedAt);
          } else {
            // Estimate 1 day after call booked
            estimatedDate = new Date(estimatedDate.getTime() + (1 * 24 * 60 * 60 * 1000));
          }
          break;
          
        case 'Proposal Sent':
          if (deal.proposalSent && deal.proposalSentAt) {
            estimatedDate = new Date(deal.proposalSentAt);
          } else {
            // Estimate 3-5 days after call complete
            estimatedDate = new Date(estimatedDate.getTime() + (4 * 24 * 60 * 60 * 1000));
          }
          break;
          
        default:
          // For other stages, estimate 5-7 days progression
          estimatedDate = new Date(estimatedDate.getTime() + (6 * 24 * 60 * 60 * 1000));
          break;
      }
      
      timeline[stage] = {
        date: estimatedDate.toISOString(),
        days: daysBetween(timeline['Lead Identified'].date, estimatedDate.toISOString())
      };
    }
  }
  
  return timeline;
}

/**
 * Calculate stage metrics across all deals
 */
function calculateStageMetrics(dealAnalyses) {
  const stageMetrics = {};
  
  for (const stage of PIPELINE_STAGES) {
    const dealsInStage = dealAnalyses.filter(deal => 
      deal.currentStage === stage || deal.timeline[stage]
    );
    
    const stageDurations = dealAnalyses
      .map(deal => deal.timeline[stage]?.days)
      .filter(days => days !== undefined && days >= 0);
      
    const totalValue = dealsInStage
      .filter(deal => deal.currentStage === stage)
      .reduce((sum, deal) => sum + (deal.deal.value || 0), 0);
    
    const avgDays = stageDurations.length > 0 
      ? stageDurations.reduce((sum, days) => sum + days, 0) / stageDurations.length
      : 0;
    
    stageMetrics[stage] = {
      currentCount: dealsInStage.filter(deal => deal.currentStage === stage).length,
      totalValue,
      avgDays: Math.round(avgDays * 10) / 10,
      allDeals: dealsInStage.length
    };
  }
  
  return stageMetrics;
}

/**
 * Calculate conversion rates between stages
 */
function calculateConversions(dealAnalyses) {
  const conversions = {};
  
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const currentStage = PIPELINE_STAGES[i];
    const nextStage = PIPELINE_STAGES[i + 1];
    
    const reachedCurrent = dealAnalyses.filter(deal => 
      deal.timeline[currentStage]
    ).length;
    
    const reachedNext = dealAnalyses.filter(deal => 
      deal.timeline[nextStage]
    ).length;
    
    const conversionRate = reachedCurrent > 0 
      ? Math.round((reachedNext / reachedCurrent) * 100)
      : 0;
      
    conversions[`${currentStage} → ${nextStage.replace('Discovery Call ', '').replace('Closed ', '')}`] = {
      rate: conversionRate,
      from: reachedCurrent,
      to: reachedNext
    };
  }
  
  return conversions;
}

/**
 * Identify at-risk deals based on stage duration thresholds
 */
function identifyAtRiskDeals(dealAnalyses, customThreshold = 7) {
  const atRisk = [];
  
  for (const dealAnalysis of dealAnalyses) {
    const { deal, currentStage, daysInCurrentStage } = dealAnalysis;
    
    // Skip closed deals
    if (currentStage === 'Closed Won' || currentStage === 'Closed Lost') {
      continue;
    }
    
    // Check stage-specific thresholds
    const stageThreshold = AT_RISK_THRESHOLDS[currentStage] || customThreshold;
    
    if (daysInCurrentStage > stageThreshold) {
      atRisk.push({
        company: deal.contact?.company || deal.name || 'Unknown',
        stage: currentStage,
        days: daysInCurrentStage,
        threshold: stageThreshold,
        value: deal.value || 0
      });
    }
  }
  
  return atRisk.sort((a, b) => b.days - a.days);
}

/**
 * Calculate velocity summary metrics
 */
function calculateVelocitySummary(dealAnalyses, stageMetrics) {
  const closedDeals = dealAnalyses.filter(deal => 
    deal.currentStage === 'Closed Won' || deal.currentStage === 'Closed Lost'
  );
  
  // Calculate average deal cycle (Lead Identified to Closed)
  const dealCycles = closedDeals
    .map(deal => {
      const leadDate = deal.timeline['Lead Identified']?.date;
      const closeDate = deal.timeline['Closed Won']?.date || deal.timeline['Closed Lost']?.date;
      return leadDate && closeDate ? daysBetween(leadDate, closeDate) : null;
    })
    .filter(cycle => cycle !== null);
    
  const avgDealCycle = dealCycles.length > 0 
    ? Math.round(dealCycles.reduce((sum, cycle) => sum + cycle, 0) / dealCycles.length)
    : 0;
  
  // Calculate total pipeline value (excluding closed)
  const activePipeline = dealAnalyses.filter(deal => 
    deal.currentStage !== 'Closed Won' && deal.currentStage !== 'Closed Lost'
  );
  
  const totalPipelineValue = activePipeline.reduce((sum, deal) => 
    sum + (deal.deal.value || 0), 0
  );
  
  // Estimate closes this month based on deals in late stages
  const lateStageDeals = dealAnalyses.filter(deal => 
    deal.currentStage === 'Negotiation' || deal.currentStage === 'Proposal Sent'
  );
  
  const estimatedCloses = lateStageDeals.length;
  const estimatedValue = lateStageDeals.reduce((sum, deal) => 
    sum + (deal.deal.value || 0), 0
  );
  
  return {
    avgDealCycle,
    totalPipelineValue,
    estimatedCloses,
    estimatedValue,
    totalActiveDeals: activePipeline.length
  };
}

/**
 * Format currency values
 */
function formatCurrency(amount) {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  } else {
    return `$${amount}`;
  }
}

/**
 * Generate formatted report text
 */
function generateReport(analysis) {
  const { dealAnalyses, stageMetrics, conversions, atRiskDeals, velocitySummary } = analysis;
  
  let report = [];
  report.push('📊 PIPELINE VELOCITY REPORT');
  report.push(`Generated: ${nowInET()}`);
  report.push('');
  
  // Stage Metrics
  report.push('━━━ STAGE METRICS ━━━');
  for (const stage of PIPELINE_STAGES) {
    const metrics = stageMetrics[stage];
    const value = formatCurrency(metrics.totalValue);
    report.push(`${stage}: ${metrics.currentCount} deals (${value}) | Avg: ${metrics.avgDays} days`);
  }
  report.push('');
  
  // At-Risk Deals
  if (atRiskDeals.length > 0) {
    report.push('━━━ AT-RISK DEALS ━━━');
    for (const deal of atRiskDeals) {
      report.push(`⚠️ ${deal.company} - In "${deal.stage}" for ${deal.days} days (threshold: ${deal.threshold})`);
    }
    report.push('');
  }
  
  // Conversion Funnel
  report.push('━━━ CONVERSION FUNNEL ━━━');
  for (const [transition, conv] of Object.entries(conversions)) {
    if (conv.from > 0) {
      report.push(`${transition}: ${conv.rate}% (${conv.to}/${conv.from})`);
    }
  }
  report.push('');
  
  // Velocity Summary
  report.push('━━━ VELOCITY SUMMARY ━━━');
  report.push(`Average deal cycle: ${velocitySummary.avgDealCycle} days (Lead → Close)`);
  report.push(`Pipeline value: ${formatCurrency(velocitySummary.totalPipelineValue)} total`);
  report.push(`Estimated closes this month: ${velocitySummary.estimatedCloses} deals (${formatCurrency(velocitySummary.estimatedValue)})`);
  
  return report.join('\n');
}

/**
 * Save report to file
 */
async function saveReport(reportText) {
  const reportsDir = '/opt/smarty-projects/pipeline-reports';
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York'
  }); // YYYY-MM-DD format
  
  const filename = path.join(reportsDir, `velocity-${today}.txt`);
  fs.writeFileSync(filename, reportText);
  
  return filename;
}

/**
 * Main analysis function
 */
async function analyzePipeline(options = {}) {
  const { threshold = 7, includeRawData = false } = options;
  
  try {
    console.log('🔐 Authenticating with CRM...');
    const cookie = await authenticate();
    
    console.log('📋 Fetching deals...');
    const deals = await fetchDeals(cookie);
    
    console.log(`📊 Analyzing ${deals.length} deals...`);
    
    // Analyze each deal
    const dealAnalyses = [];
    
    for (const deal of deals) {
      try {
        const activities = await fetchActivities(deal.id, cookie);
        const timeline = buildDealTimeline(deal, activities);
        
        // Determine current stage
        let currentStage = deal.stage?.name || 'Lead Identified';
        if (!PIPELINE_STAGES.includes(currentStage)) {
          // Find latest stage from timeline
          for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
            if (timeline[PIPELINE_STAGES[i]]) {
              currentStage = PIPELINE_STAGES[i];
              break;
            }
          }
        }
        
        // Calculate days in current stage
        const currentStageEntry = timeline[currentStage];
        const daysInCurrentStage = currentStageEntry 
          ? daysBetween(currentStageEntry.date)
          : daysBetween(deal.createdAt);
        
        dealAnalyses.push({
          deal,
          timeline,
          currentStage,
          daysInCurrentStage
        });
        
      } catch (error) {
        console.log(`⚠️ Could not fetch activities for deal ${deal.id}: ${error.message}`);
        // Use deal creation date as fallback
        dealAnalyses.push({
          deal,
          timeline: { 'Lead Identified': { date: deal.createdAt, days: 0 } },
          currentStage: deal.stage?.name || 'Lead Identified',
          daysInCurrentStage: daysBetween(deal.createdAt)
        });
      }
    }
    
    // Calculate metrics
    console.log('📈 Calculating metrics...');
    const stageMetrics = calculateStageMetrics(dealAnalyses);
    const conversions = calculateConversions(dealAnalyses);
    const atRiskDeals = identifyAtRiskDeals(dealAnalyses, threshold);
    const velocitySummary = calculateVelocitySummary(dealAnalyses, stageMetrics);
    
    const analysis = {
      dealAnalyses: includeRawData ? dealAnalyses : [],
      stageMetrics,
      conversions,
      atRiskDeals,
      velocitySummary,
      generatedAt: new Date().toISOString(),
      dealCount: deals.length
    };
    
    return analysis;
    
  } catch (error) {
    throw new Error(`Pipeline analysis failed: ${error.message}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const thresholdArg = args.find(arg => arg.startsWith('--threshold='));
  const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1]) : 7;
  
  try {
    const analysis = await analyzePipeline({ threshold, includeRawData: jsonOutput });
    
    if (jsonOutput) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      const reportText = generateReport(analysis);
      console.log(reportText);
      
      // Save to file
      const filename = await saveReport(reportText);
      console.log(`\n📁 Report saved to: ${filename}`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for module usage
module.exports = { analyzePipeline, generateReport, saveReport };