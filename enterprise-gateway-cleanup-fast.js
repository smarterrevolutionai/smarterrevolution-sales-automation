const fs = require('fs');
const dns = require('dns');
const { promisify } = require('util');

const resolveMx = promisify(dns.resolveMx);

// Enterprise gateway patterns
const gatewayPatterns = {
  proofpoint: ['pphosted.com', 'proofpoint'],
  mimecast: ['mimecast.com'],
  barracuda: ['barracuda', 'ess.barracuda'],
  cisco: ['iphmx.com', 'ironport'],
  fortinet: ['fortimail'],
  gosecure: ['gosecure'],
  sophos: ['sophos'],
  trendmicro: ['trendmicro'],
  fireeye: ['fireeye'],
  symantec: ['messagelabs', 'symantec'],
  spamhero: ['spamhero'],
  appriver: ['appriver']
};

// Results storage
const results = {
  timestamp: new Date().toISOString(),
  total_other_domains: 0,
  total_enterprise_gateway_domains: 0,
  by_gateway: {},
  gateway_domain_map: {}
};

// Initialize gateway arrays
Object.keys(gatewayPatterns).forEach(gateway => {
  results.by_gateway[gateway] = [];
});

let processedCount = 0;
let errorCount = 0;

function classifyMxRecord(mxRecords) {
  if (!mxRecords || mxRecords.length === 0) return null;
  
  const mxHosts = mxRecords.map(mx => mx.exchange.toLowerCase());
  const allMxText = mxHosts.join(' ').toLowerCase();
  
  for (const [gatewayType, patterns] of Object.entries(gatewayPatterns)) {
    for (const pattern of patterns) {
      if (allMxText.includes(pattern.toLowerCase())) {
        return gatewayType;
      }
    }
  }
  return null;
}

async function lookupDomainMx(domain) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('DNS lookup timeout'));
    }, 3000); // Reduced timeout for faster processing
    
    resolveMx(domain)
      .then(result => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function processDomainBatch(domains) {
  const promises = domains.map(async (domain) => {
    try {
      const mxRecords = await lookupDomainMx(domain);
      const gatewayType = classifyMxRecord(mxRecords);
      
      processedCount++;
      
      return { domain, gatewayType, mxRecords, success: true };
    } catch (error) {
      errorCount++;
      return { domain, gatewayType: null, error: error.message, success: false };
    }
  });
  
  return Promise.all(promises);
}

function savePartialResults() {
  // Save current results
  const outputPath = '/opt/smarty-projects/parked-leads/enterprise-gateway-domains-partial.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  // Save progress report
  const reportPath = '/opt/smarty-projects/parked-leads/enterprise-gateway-progress.txt';
  let reportContent = `Enterprise Gateway Analysis - Progress Report\n`;
  reportContent += `Generated: ${new Date().toISOString()}\n`;
  reportContent += `==========================================\n\n`;
  reportContent += `PROGRESS:\n`;
  reportContent += `- Processed: ${processedCount} / ${results.total_other_domains} domains (${((processedCount/results.total_other_domains)*100).toFixed(2)}%)\n`;
  reportContent += `- Errors: ${errorCount}\n`;
  reportContent += `- Enterprise gateways found: ${results.total_enterprise_gateway_domains}\n\n`;
  
  reportContent += `CURRENT BREAKDOWN:\n`;
  for (const [gateway, domains] of Object.entries(results.by_gateway)) {
    if (domains.length > 0) {
      reportContent += `- ${gateway.toUpperCase()}: ${domains.length} domains\n`;
    }
  }
  
  fs.writeFileSync(reportPath, reportContent);
}

async function main() {
  console.log('Starting FAST enterprise gateway domain classification...');
  
  // Read domain-ESP map file
  const mapFilePath = '/opt/smarty-projects/parked-leads/domain-esp-map.txt';
  const mapContent = fs.readFileSync(mapFilePath, 'utf8');
  
  // Extract OTHER domains
  const otherDomains = [];
  const lines = mapContent.split('\n');
  
  for (const line of lines) {
    if (line.trim() && line.endsWith(' OTHER')) {
      const domain = line.split(' ')[0];
      otherDomains.push(domain);
    }
  }
  
  results.total_other_domains = otherDomains.length;
  console.log(`Found ${results.total_other_domains} OTHER domains to process`);
  
  // Process in larger batches with higher concurrency for faster processing
  const batchSize = 200; // Increased from 50
  const delay = 1000; // Reduced delay
  
  for (let i = 0; i < otherDomains.length; i += batchSize) {
    const batch = otherDomains.slice(i, i + batchSize);
    const batchNum = Math.floor(i/batchSize) + 1;
    const totalBatches = Math.ceil(otherDomains.length/batchSize);
    
    console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} domains)`);
    
    const batchResults = await processDomainBatch(batch);
    
    // Process results
    for (const result of batchResults) {
      if (result.gatewayType) {
        results.by_gateway[result.gatewayType].push(result.domain);
        results.gateway_domain_map[result.domain] = result.gatewayType;
        results.total_enterprise_gateway_domains++;
      }
    }
    
    // Save partial results every 10 batches
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      console.log(`Saving partial results... (Processed: ${processedCount}, Errors: ${errorCount}, Gateways: ${results.total_enterprise_gateway_domains})`);
      savePartialResults();
    }
    
    // Status update
    if (processedCount % 1000 === 0 || batchNum === totalBatches) {
      console.log(`Progress: ${processedCount}/${results.total_other_domains} domains (${((processedCount/results.total_other_domains)*100).toFixed(1)}%)`);
      console.log(`Enterprise gateways found: ${results.total_enterprise_gateway_domains}`);
      console.log(`Error rate: ${((errorCount/processedCount)*100).toFixed(2)}%`);
    }
    
    // Delay between batches (except last)
    if (i + batchSize < otherDomains.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`\n=== PROCESSING COMPLETE ===`);
  console.log(`Total OTHER domains processed: ${results.total_other_domains}`);
  console.log(`Total enterprise gateway domains found: ${results.total_enterprise_gateway_domains}`);
  console.log(`Errors encountered: ${errorCount}`);
  
  // Print summary by gateway type
  console.log(`\n=== ENTERPRISE GATEWAYS SUMMARY ===`);
  for (const [gateway, domains] of Object.entries(results.by_gateway)) {
    if (domains.length > 0) {
      console.log(`${gateway.toUpperCase()}: ${domains.length} domains`);
    }
  }
  
  // Save final results
  const outputPath = '/opt/smarty-projects/parked-leads/enterprise-gateway-domains.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nFinal results saved to: ${outputPath}`);
  
  // Generate summary report
  const reportPath = '/opt/smarty-projects/parked-leads/enterprise-gateway-report.txt';
  let reportContent = `Enterprise Gateway Domain Analysis Report\n`;
  reportContent += `Generated: ${results.timestamp}\n`;
  reportContent += `=====================================\n\n`;
  reportContent += `SUMMARY:\n`;
  reportContent += `- Total OTHER domains analyzed: ${results.total_other_domains}\n`;
  reportContent += `- Enterprise gateway domains found: ${results.total_enterprise_gateway_domains}\n`;
  reportContent += `- Percentage behind enterprise gateways: ${((results.total_enterprise_gateway_domains / results.total_other_domains) * 100).toFixed(2)}%\n`;
  reportContent += `- Processing errors: ${errorCount}\n`;
  reportContent += `- Error rate: ${((errorCount / processedCount) * 100).toFixed(2)}%\n\n`;
  
  reportContent += `BREAKDOWN BY GATEWAY TYPE:\n`;
  for (const [gateway, domains] of Object.entries(results.by_gateway)) {
    if (domains.length > 0) {
      reportContent += `- ${gateway.toUpperCase()}: ${domains.length} domains\n`;
    }
  }
  
  reportContent += `\nRECOMMENDATION:\n`;
  reportContent += `${results.total_enterprise_gateway_domains} domains should be moved from active PlusVibe campaigns\n`;
  reportContent += `to the parked leads list to improve bounce rates.\n\n`;
  
  reportContent += `IMPACT ESTIMATE:\n`;
  const currentBounceRate = 5.2;
  const otherDomainsPercent = (results.total_other_domains / 47896) * 100;
  reportContent += `- OTHER domains represent ${otherDomainsPercent.toFixed(1)}% of total domain list\n`;
  reportContent += `- Removing ${results.total_enterprise_gateway_domains} enterprise gateway domains should significantly reduce bounce rate\n`;
  
  fs.writeFileSync(reportPath, reportContent);
  console.log(`Summary report saved to: ${reportPath}`);
  
  // Create updated domain-ESP map
  console.log(`\nCreating updated domain-ESP map...`);
  const originalLines = fs.readFileSync(mapFilePath, 'utf8').split('\n');
  const updatedLines = [];
  
  for (const line of originalLines) {
    if (!line.trim()) continue;
    
    const [domain, espType] = line.split(' ');
    if (results.gateway_domain_map[domain]) {
      // Reclassify as enterprise gateway
      const gatewayType = results.gateway_domain_map[domain].toUpperCase();
      updatedLines.push(`${domain} ENTERPRISE_${gatewayType}`);
    } else {
      // Keep original classification
      updatedLines.push(line);
    }
  }
  
  const updatedMapPath = '/opt/smarty-projects/parked-leads/domain-esp-map-v2.txt';
  fs.writeFileSync(updatedMapPath, updatedLines.join('\n') + '\n');
  console.log(`Updated domain-ESP map saved to: ${updatedMapPath}`);
  
  console.log(`\n=== ALL FILES READY FOR PLUSVIBE CLEANUP ===`);
}

main().catch(console.error);