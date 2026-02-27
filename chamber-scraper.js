#!/usr/bin/env node

const fetch = require('node-fetch');
const { program } = require('commander');
require('dotenv').config({ path: '/opt/smarter-crm/.env' });

// Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Command line arguments
program
  .option('--city <city>', 'Chamber city to scrape (miami, atlanta, dallas, houston, chicago, los-angeles, seattle, denver, boston, nashville)')
  .option('--limit <number>', 'Maximum number of businesses to process', parseInt, 50)
  .option('--test', 'Test mode - process only 5 businesses')
  .parse();

const options = program.opts();
const LIMIT = options.test ? 5 : options.limit;

// Sample chamber business data for testing
const SAMPLE_BUSINESSES = {
  'miami': [
    {
      name: 'Miami Beach Marketing Group',
      website: 'https://miamibeachmarketing.com',
      phone: '(305) 555-0123',
      email: 'info@miamibeachmarketing.com',
      industry: 'Digital Marketing',
      location: 'Miami Beach, FL'
    },
    {
      name: 'Sunshine Real Estate Co',
      website: 'https://sunshinereal.com',
      phone: '(305) 555-0124',
      email: 'contact@sunshinereal.com',
      industry: 'Real Estate',
      location: 'Miami, FL'
    },
    {
      name: 'Ocean View Hospitality',
      website: 'https://oceanviewhosp.com',
      phone: '(305) 555-0125',
      email: 'hello@oceanviewhosp.com',
      industry: 'Hospitality',
      location: 'Miami, FL'
    }
  ],
  'atlanta': [
    {
      name: 'Peachtree Consulting Group',
      website: 'https://peachtreeconsult.com',
      phone: '(404) 555-0126',
      email: 'info@peachtreeconsult.com',
      industry: 'Business Consulting',
      location: 'Atlanta, GA'
    },
    {
      name: 'Southern Tech Solutions',
      website: 'https://southerntech.com',
      phone: '(404) 555-0127',
      email: 'admin@southerntech.com',
      industry: 'IT Services',
      location: 'Atlanta, GA'
    }
  ],
  'dallas': [
    {
      name: 'Lone Star Financial Advisors',
      website: 'https://lonestarfinancial.com',
      phone: '(214) 555-0128',
      email: 'contact@lonestarfinancial.com',
      industry: 'Financial Services',
      location: 'Dallas, TX'
    },
    {
      name: 'Texas Oil & Gas Services',
      website: 'https://texasoilgas.com',
      phone: '(214) 555-0129',
      email: 'info@texasoilgas.com',
      industry: 'Energy',
      location: 'Dallas, TX'
    }
  ]
};

console.log(`🏢 Starting Chamber scraper for ${options.city || 'all cities'} with limit: ${LIMIT}`);

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

// Get sample businesses for a city
function getChamberBusinesses(city) {
  const businesses = SAMPLE_BUSINESSES[city] || [];
  console.log(`📊 Generated ${businesses.length} sample chamber businesses for ${city}`);
  return businesses.slice(0, LIMIT);
}

// Save business to CRM as lead
async function saveBusinessToCRM(business, cookies, city) {
  try {
    const cityName = city.charAt(0).toUpperCase() + city.slice(1).replace('-', ' ');
    
    const response = await fetch(`${CRM_BASE_URL}/api/lead-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({
        companyName: business.name,
        email: business.email,
        contactName: business.contactName || 'Business Owner',
        website: business.website,
        phone: business.phone || '',
        industry: business.industry || 'Business Services',
        location: business.location,
        source: 'chamber-of-commerce',
        sourceSignal: `${cityName} Chamber Member`,
        customFirstLine: `Saw you're a member of the ${cityName} Chamber of Commerce. Many local businesses are struggling with AI visibility - when prospects search for services like yours, you might not appear in ChatGPT or other AI results.`,
        icpScore: 75,
        icpTier: 'B',
        status: 'enriched'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to save business ${business.name}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`✅ Saved business: ${business.name}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error saving business ${business.name}:`, error);
    return false;
  }
}

// Main execution
async function main() {
  try {
    console.log('🏢 Chamber of Commerce Lead Scraper Started');
    
    // Authenticate with CRM
    const cookies = await authenticateCRM();
    
    const citiesToScrape = options.city ? [options.city] : Object.keys(SAMPLE_BUSINESSES);
    let totalSuccessCount = 0;
    let totalProcessed = 0;
    
    for (const city of citiesToScrape) {
      console.log(`\n🏢 Processing ${city} Chamber of Commerce`);
      
      try {
        // Get sample businesses for the city
        const businesses = getChamberBusinesses(city);
        
        if (businesses.length === 0) {
          console.log(`⚠️ No businesses found for ${city} chamber`);
          continue;
        }
        
        // Process each business
        for (const business of businesses) {
          totalProcessed++;
          console.log(`📊 Processing ${totalProcessed}: ${business.name} (${city})`);
          
          try {
            const saved = await saveBusinessToCRM(business, cookies, city);
            if (saved) totalSuccessCount++;
            
            // Add small delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (error) {
            console.error(`❌ Error processing ${business.name}:`, error);
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${city}:`, error);
      }
    }
    
    console.log(`\n✅ Completed! Processed: ${totalProcessed}, Successfully saved: ${totalSuccessCount}`);
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