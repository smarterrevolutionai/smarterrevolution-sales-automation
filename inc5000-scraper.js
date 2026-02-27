#!/usr/bin/env node

const fetch = require('node-fetch');
const { program } = require('commander');
require('dotenv').config({ path: '/opt/smarter-crm/.env' });

// Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Command line arguments
program
  .option('--limit <number>', 'Maximum number of companies to process', parseInt, 100)
  .option('--min-revenue <number>', 'Minimum revenue filter', parseInt, 1000000)
  .option('--max-revenue <number>', 'Maximum revenue filter', parseInt, 250000000)
  .option('--test', 'Test mode - process only 5 companies')
  .parse();

const options = program.opts();
const LIMIT = options.test ? 5 : options.limit;

console.log(`🚀 Starting Inc 5000 scraper with limit: ${LIMIT}`);

// Authenticate with CRM
async function authenticateCRM() {
  try {
    const response = await fetch(`${CRM_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'WorkSmarter2025!'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`);
    }
    
    const cookies = response.headers.get('set-cookie');
    console.log('✅ CRM authentication successful');
    return cookies;
  } catch (error) {
    console.error('❌ CRM authentication failed:', error);
    throw error;
  }
}

// Generate sample Inc 5000 companies for testing
function generateInc5000Companies() {
  const companies = [
    {
      rank: 1,
      name: 'TechFlow Solutions',
      growth: '5245%',
      revenue: '$45.2M',
      industry: 'Software Development',
      location: 'Austin, TX',
      website: 'https://techflow.com',
      email: 'ceo@techflow.com'
    },
    {
      rank: 2,
      name: 'DataMind Analytics',
      growth: '4892%',
      revenue: '$67.8M',
      industry: 'Data Analytics',
      location: 'Seattle, WA',
      website: 'https://datamind.com',
      email: 'founder@datamind.com'
    },
    {
      rank: 3,
      name: 'CloudCore Enterprises',
      growth: '4321%',
      revenue: '$89.1M',
      industry: 'Cloud Services',
      location: 'San Francisco, CA',
      website: 'https://cloudcore.com',
      email: 'president@cloudcore.com'
    },
    {
      rank: 4,
      name: 'GrowthHack Marketing',
      growth: '3987%',
      revenue: '$23.4M',
      industry: 'Digital Marketing',
      location: 'Miami, FL',
      website: 'https://growthhack.com',
      email: 'ceo@growthhack.com'
    },
    {
      rank: 5,
      name: 'AI Innovations Corp',
      growth: '3654%',
      revenue: '$156.7M',
      industry: 'Artificial Intelligence',
      location: 'Boston, MA',
      website: 'https://aiinnovations.com',
      email: 'info@aiinnovations.com'
    },
    {
      rank: 6,
      name: 'Secure Systems LLC',
      growth: '3401%',
      revenue: '$78.2M',
      industry: 'Cybersecurity',
      location: 'Denver, CO',
      website: 'https://securesystems.com',
      email: 'contact@securesystems.com'
    },
    {
      rank: 7,
      name: 'Mobile First Digital',
      growth: '3289%',
      revenue: '$34.5M',
      industry: 'Mobile App Development',
      location: 'Nashville, TN',
      website: 'https://mobilefirst.com',
      email: 'hello@mobilefirst.com'
    },
    {
      rank: 8,
      name: 'FinTech Dynamics',
      growth: '3156%',
      revenue: '$92.3M',
      industry: 'Financial Technology',
      location: 'Chicago, IL',
      website: 'https://fintechdynamics.com',
      email: 'admin@fintechdynamics.com'
    }
  ];
  
  return companies.slice(0, LIMIT);
}

// Generate AI-personalized first line using simple fallback
async function generatePersonalizedFirstLine(company) {
  const fallbackResponse = {
    customFirstLine: `Noticed ${company.name} hit Inc 5000 rank #${company.rank} with ${company.growth} growth. Despite your impressive success, you might not appear when prospects search for ${company.industry} solutions in ChatGPT or other AI tools they're using daily.`,
    icpScore: 85,
    icpTier: "A",
    sourceSignal: `Inc 5000 #${company.rank} — ${company.growth} growth in ${company.industry}`
  };

  // Try OpenRouter if available, fallback to preset message if not
  if (OPENROUTER_API_KEY) {
    try {
      const prompt = `Company: ${company.name}
Inc 5000 Rank: #${company.rank}
Growth: ${company.growth} 3-year growth
Industry: ${company.industry}
Revenue: ${company.revenue}
Location: ${company.location}

Write ONE personalized cold email opener about AI visibility - their company may not appear in ChatGPT/AI search results despite their impressive growth. Reference their Inc 5000 achievement. 1-2 sentences, conversational, no em dashes, no "leverage".

Output JSON: {"customFirstLine": "...", "icpScore": 85, "icpTier": "A", "sourceSignal": "Inc 5000 #${company.rank} — ${company.growth} growth in ${company.industry}"}`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        
        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // Fallback if JSON parsing fails
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ OpenRouter API failed for ${company.name}, using fallback`);
    }
  }
  
  return fallbackResponse;
}

// Save lead to CRM
async function saveLeadToCRM(lead, cookies) {
  try {
    const response = await fetch(`${CRM_BASE_URL}/api/lead-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({
        companyName: lead.companyName,
        email: lead.contactEmail,
        contactName: lead.contactName || 'Decision Maker',
        website: lead.website,
        phone: lead.phone || '',
        industry: lead.industry,
        revenueRange: lead.revenue,
        location: lead.location,
        source: 'inc5000',
        sourceSignal: lead.sourceSignal,
        customFirstLine: lead.customFirstLine,
        icpScore: lead.icpScore,
        icpTier: lead.icpTier,
        status: 'enriched'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to save lead ${lead.companyName}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`✅ Saved lead: ${lead.companyName}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error saving lead ${lead.companyName}:`, error);
    return false;
  }
}

// Filter companies by revenue
function filterCompanies(companies, minRevenue, maxRevenue) {
  return companies.filter(company => {
    if (!company.revenue) return true;
    
    const revenueStr = company.revenue.replace(/[$,\s]/g, '');
    let revenueValue = 0;
    
    if (revenueStr.includes('M')) {
      revenueValue = parseFloat(revenueStr.replace('M', '')) * 1000000;
    } else if (revenueStr.includes('B')) {
      revenueValue = parseFloat(revenueStr.replace('B', '')) * 1000000000;
    } else {
      revenueValue = parseFloat(revenueStr);
    }
    
    return revenueValue >= minRevenue && revenueValue <= maxRevenue;
  });
}

// Main execution
async function main() {
  try {
    console.log('🚀 Inc 5000 Lead Importer Started');
    
    // Authenticate with CRM
    const cookies = await authenticateCRM();
    
    // Generate sample companies
    let companies = generateInc5000Companies();
    console.log(`📊 Generated ${companies.length} sample Inc 5000 companies`);
    
    // Filter by revenue if specified
    if (options.minRevenue || options.maxRevenue) {
      const filtered = filterCompanies(companies, options.minRevenue, options.maxRevenue);
      console.log(`📊 Filtered ${companies.length} companies to ${filtered.length} based on revenue criteria`);
      companies = filtered;
    }
    
    let successCount = 0;
    let totalProcessed = 0;
    
    // Process each company
    for (const company of companies) {
      totalProcessed++;
      console.log(`\n📊 Processing ${totalProcessed}/${companies.length}: ${company.name}`);
      
      try {
        // Generate personalized first line
        const aiResponse = await generatePersonalizedFirstLine(company);
        
        // Prepare lead data
        const lead = {
          companyName: company.name,
          contactEmail: company.email,
          contactName: 'Decision Maker',
          website: company.website,
          industry: company.industry,
          revenue: company.revenue,
          location: company.location,
          customFirstLine: aiResponse.customFirstLine,
          icpScore: aiResponse.icpScore,
          icpTier: aiResponse.icpTier,
          sourceSignal: aiResponse.sourceSignal
        };
        
        // Save to CRM
        const saved = await saveLeadToCRM(lead, cookies);
        if (saved) successCount++;
        
        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error processing ${company.name}:`, error);
      }
    }
    
    console.log(`\n✅ Completed! Processed: ${totalProcessed}, Successfully saved: ${successCount}`);
    console.log(`📊 Check leads at http://localhost:3000/lead-pipeline`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };