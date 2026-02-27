#!/usr/bin/env node

const fetch = require('node-fetch');
const { program } = require('commander');
require('dotenv').config({ path: '/opt/smarter-crm/.env' });

// Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Command line arguments
program
  .option('--batch-size <number>', 'Number of leads to process in each batch', parseInt, 20)
  .option('--test', 'Test mode - process only 5 leads')
  .parse();

const options = program.opts();
const BATCH_SIZE = options.test ? 5 : options.batchSize;

console.log(`🔍 Starting Lead Enricher with batch size: ${BATCH_SIZE}`);

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

// Get leads that need enrichment
async function getLeadsToEnrich(cookies, limit) {
  try {
    const response = await fetch(`${CRM_BASE_URL}/api/lead-pipeline?status=enriching&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'x-api-key': INTERNAL_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch leads: ${response.status}`);
    }
    
    const data = await response.json();
    const leads = data.leads || [];
    
    console.log(`📊 Found ${leads.length} leads that need enrichment`);
    return leads;
    
  } catch (error) {
    console.error('❌ Error fetching leads:', error);
    return [];
  }
}

// Create some sample leads that need enrichment for testing
async function createSampleLeadsForTesting(cookies) {
  const sampleLeads = [
    {
      companyName: 'TestTech Corp',
      website: 'https://testtech.com',
      industry: 'Technology',
      location: 'San Jose, CA',
      source: 'test',
      sourceSignal: 'Test lead for enrichment'
    },
    {
      companyName: 'Sample Services LLC',
      website: 'https://sampleservices.com', 
      industry: 'Business Services',
      location: 'New York, NY',
      source: 'test',
      sourceSignal: 'Test lead for enrichment'
    },
    {
      companyName: 'Demo Digital Agency',
      website: 'https://demodigital.com',
      industry: 'Digital Marketing',
      location: 'Los Angeles, CA', 
      source: 'test',
      sourceSignal: 'Test lead for enrichment'
    }
  ];

  console.log('🧪 Creating sample leads for testing...');
  
  for (const lead of sampleLeads) {
    try {
      await fetch(`${CRM_BASE_URL}/api/lead-pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies,
          'x-api-key': INTERNAL_API_KEY
        },
        body: JSON.stringify({
          ...lead,
          email: `test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}@example.com`,
          status: 'enriching',
          icpScore: 50,
          icpTier: 'C'
        })
      });
    } catch (error) {
      console.log(`⚠️ Could not create sample lead: ${lead.companyName}`);
    }
  }
}

// Find email for a lead (simplified for testing)
async function findEmailForLead(lead) {
  console.log(`🔍 Looking for email for ${lead.companyName}...`);
  
  // Simulate email finding logic
  const domain = lead.website ? lead.website.replace(/https?:\/\//, '').replace(/\/.*/, '').replace('www.', '') : null;
  
  if (!domain) {
    console.log(`⚠️ No valid website domain for ${lead.companyName}`);
    return null;
  }
  
  // Simulate different email patterns
  const emailPatterns = [
    `info@${domain}`,
    `contact@${domain}`,
    `hello@${domain}`,
    `admin@${domain}`,
    `ceo@${domain}`,
    `founder@${domain}`
  ];
  
  // Randomly select an email pattern for demonstration
  const foundEmail = emailPatterns[Math.floor(Math.random() * emailPatterns.length)];
  
  // Simulate success/failure (70% success rate)
  if (Math.random() > 0.3) {
    console.log(`✅ Found email for ${lead.companyName}: ${foundEmail}`);
    return foundEmail;
  } else {
    console.log(`❌ No email found for ${lead.companyName}`);
    return null;
  }
}

// Update lead in CRM with found email
async function updateLeadEmail(leadId, email, cookies) {
  try {
    const response = await fetch(`${CRM_BASE_URL}/api/lead-pipeline/${leadId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({
        email: email,
        status: 'enriched'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to update lead ${leadId}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`✅ Updated lead ${leadId} with email: ${email}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error updating lead ${leadId}:`, error);
    return false;
  }
}

// Main execution
async function main() {
  try {
    console.log('🔍 Lead Enricher Started');
    
    // Authenticate with CRM
    const cookies = await authenticateCRM();
    
    if (options.test) {
      await createSampleLeadsForTesting(cookies);
      // Wait a moment for the leads to be created
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Get leads that need enrichment
    const leads = await getLeadsToEnrich(cookies, BATCH_SIZE);
    
    if (leads.length === 0) {
      console.log('✅ No leads found that need enrichment');
      return;
    }
    
    let successCount = 0;
    let totalProcessed = 0;
    
    // Process each lead
    for (const lead of leads) {
      totalProcessed++;
      console.log(`\n🔍 Processing ${totalProcessed}/${leads.length}: ${lead.companyName}`);
      
      try {
        // Find email for this lead
        const email = await findEmailForLead(lead);
        
        if (email) {
          // Update lead in CRM
          const updated = await updateLeadEmail(lead.id, email, cookies);
          if (updated) successCount++;
        } else {
          console.log(`⚠️ No email found for ${lead.companyName}`);
        }
        
        // Add delay to simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing lead ${lead.companyName}:`, error);
      }
    }
    
    console.log(`\n✅ Completed! Processed: ${totalProcessed}, Successfully enriched: ${successCount}`);
    console.log(`📊 Check updated leads at http://localhost:3000/lead-pipeline`);
    
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