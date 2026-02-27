#!/usr/bin/env node

/**
 * Auto CRM Pipeline Creation Script - IMPROVED VERSION
 * Creates contacts, companies, deals, and activities from warm leads
 * Usage: node auto-pipeline.js --email="john@company.com" --name="John Smith" --company="Acme Corp" --reply-text="Sure, interested"
 * Or import: const { createPipelineDeal } = require('./auto-pipeline.js')
 */

const { parse } = require('url');

// CRM API Configuration
const CRM_BASE_URL = 'http://localhost:3000';
const CRM_CREDENTIALS = {
  username: 'admin',
  password: 'WorkSmarter2025!'
};

// Command Center API for notifications
const COMMAND_CENTER_URL = 'http://localhost:3001';
const COMMAND_CENTER_API_KEY = 'process.env.COMMAND_CENTER_API_KEY';

class CRMPipelineClient {
  constructor() {
    this.sessionCookie = null;
  }

  async authenticate() {
    try {
      console.log('🔐 Authenticating with CRM...');
      const response = await fetch(`${CRM_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(CRM_CREDENTIALS),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      // Extract session cookie
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        const sessionMatch = setCookieHeader.match(/sr_session=([^;]+)/);
        if (sessionMatch) {
          this.sessionCookie = sessionMatch[1];
          console.log('✅ Authentication successful');
          return true;
        }
      }

      throw new Error('Failed to extract session cookie from response');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      return false;
    }
  }

  async makeRequest(endpoint, options = {}) {
    if (!this.sessionCookie) {
      const authSuccess = await this.authenticate();
      if (!authSuccess) {
        throw new Error('Failed to authenticate with CRM');
      }
    }

    const url = `${CRM_BASE_URL}${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sr_session=${this.sessionCookie}`,
        ...options.headers,
      },
    };

    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${endpoint}`);
    }

    return response.json();
  }

  async checkExistingContact(email) {
    try {
      console.log(`🔍 Checking for existing contact: ${email}`);
      // Use the contacts API with email filter
      const response = await this.makeRequest(`/api/contacts?email=${encodeURIComponent(email)}`);
      
      if (response.data && response.data.length > 0) {
        const existingContact = response.data.find(c => 
          c.email && c.email.toLowerCase() === email.toLowerCase()
        );
        
        if (existingContact) {
          console.log(`✅ Found existing contact: ${existingContact.firstName} ${existingContact.lastName} (ID: ${existingContact.id})`);
          return existingContact;
        }
      }
      
      console.log('ℹ️ No existing contact found');
      return null;
    } catch (error) {
      console.error('⚠️ Error checking existing contact:', error.message);
      return null;
    }
  }

  async updateContactWithNote(contactId, note) {
    try {
      console.log(`📝 Adding note to existing contact (ID: ${contactId})`);
      
      // Add activity/note to existing contact
      await this.makeRequest('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          subject: 'New PlusVibe Warm Reply',
          body: note,
          contactId: contactId,
        }),
      });

      console.log('✅ Note added to existing contact');
      return true;
    } catch (error) {
      console.error('❌ Error updating contact with note:', error.message);
      return false;
    }
  }

  async createContact(contactData) {
    try {
      console.log(`👤 Creating new contact: ${contactData.firstName} ${contactData.lastName}`);
      
      const contact = await this.makeRequest('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          firstName: contactData.firstName,
          lastName: contactData.lastName,
          email: contactData.email,
          phone: contactData.phone || '',
          company: contactData.company || '',
          title: contactData.title || '',
          status: 'warm',
          source: 'PlusVibe Cold Email',
        }),
      });

      console.log(`✅ Contact created with ID: ${contact.data ? contact.data.id : contact.id}`);
      return contact.data || contact;
    } catch (error) {
      console.error('❌ Error creating contact:', error.message);
      throw error;
    }
  }

  async checkOrCreateCompany(companyName) {
    if (!companyName) return null;

    try {
      console.log(`🏢 Checking/creating company: ${companyName}`);
      
      // Try to find existing company
      try {
        const response = await this.makeRequest(`/api/companies?search=${encodeURIComponent(companyName)}`);
        if (response.companies && response.companies.length > 0) {
          const existingCompany = response.companies.find(c => 
            c.name && c.name.toLowerCase() === companyName.toLowerCase()
          );
          if (existingCompany) {
            console.log(`✅ Found existing company: ${existingCompany.name} (ID: ${existingCompany.id})`);
            return existingCompany;
          }
        }
      } catch (searchError) {
        console.log('ℹ️ Company search failed, proceeding to create new company');
      }

      // Create new company
      const company = await this.makeRequest('/api/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: companyName,
          website: '',
          industry: '',
          size: '',
        }),
      });

      console.log(`✅ Company created with ID: ${company.data ? company.data.id : company.id}`);
      return company.data || company;
    } catch (error) {
      console.error('⚠️ Error handling company:', error.message);
      return null;
    }
  }

  async getPipelineStages() {
    try {
      console.log('📊 Fetching pipeline stages...');
      const response = await this.makeRequest('/api/pipeline/stages');
      
      const stages = response.data || response.stages || response;
      if (!stages || stages.length === 0) {
        throw new Error('No pipeline stages found');
      }

      // Find the first stage of the first/default pipeline (don't hardcode stage ID)
      const firstStage = stages.find(stage => 
        stage.position === 1 || stage.order === 1
      ) || stages[0];

      console.log(`✅ Using pipeline stage: ${firstStage.name} (ID: ${firstStage.id})`);
      return firstStage;
    } catch (error) {
      console.error('❌ Error fetching pipeline stages:', error.message);
      throw error;
    }
  }

  async createDeal(dealData) {
    try {
      console.log(`💼 Creating deal: ${dealData.name}`);
      
      const deal = await this.makeRequest('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          name: dealData.name,
          value: dealData.value || 0,
          stageId: dealData.stageId,
          contactId: dealData.contactId,
          description: dealData.description || '',
          source: dealData.source || 'PlusVibe Cold Email', // Add source field
        }),
      });

      console.log(`✅ Deal created with ID: ${deal.data ? deal.data.id : deal.id}`);
      return deal.data || deal;
    } catch (error) {
      console.error('❌ Error creating deal:', error.message);
      throw error;
    }
  }

  async createActivity(activityData) {
    try {
      console.log(`📝 Creating activity: ${activityData.subject}`);
      
      const activity = await this.makeRequest('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'email',
          subject: activityData.subject,
          body: activityData.body,
          contactId: activityData.contactId,
          dealId: activityData.dealId,
        }),
      });

      console.log(`✅ Activity created with ID: ${activity.data ? activity.data.id : activity.id}`);
      return activity.data || activity;
    } catch (error) {
      console.error('❌ Error creating activity:', error.message);
      throw error;
    }
  }

  async sendWhatsAppAlert(contactData, dealData) {
    try {
      console.log(`📱 Sending WhatsApp alert for ${contactData.firstName} ${contactData.lastName}`);
      
      const alertData = {
        type: 'ALERT',
        description: `🔥 Warm reply from ${contactData.firstName} ${contactData.lastName} at ${contactData.company || 'Unknown Company'} — deal created in CRM`,
        metadata: {
          email: contactData.email,
          company: contactData.company,
          dealId: dealData.id,
          contactId: contactData.id
        }
      };

      const response = await fetch(`${COMMAND_CENTER_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': COMMAND_CENTER_API_KEY
        },
        body: JSON.stringify(alertData)
      });

      if (response.ok) {
        console.log('✅ WhatsApp alert sent successfully');
        return true;
      } else {
        console.log(`⚠️ WhatsApp alert failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending WhatsApp alert:', error.message);
      return false;
    }
  }
}

async function createPipelineDeal(leadData) {
  const {
    email,
    name,
    company: companyName,
    replyText,
    phone,
    title,
    campaignId,
    campaignName
  } = leadData;

  if (!email || !name) {
    throw new Error('Email and name are required');
  }

  const client = new CRMPipelineClient();
  
  try {
    // Parse name into first and last name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    console.log(`🚀 Starting IMPROVED pipeline creation for: ${name} (${email})`);

    // Step 1: Check if contact already exists
    let contact = await client.checkExistingContact(email);
    let isNewContact = false;

    if (contact) {
      // DEDUPLICATION: Contact exists, add a note instead of creating duplicate
      await client.updateContactWithNote(contact.id, 
        `New warm reply received: "${replyText || 'Interested'}" from campaign: ${campaignName || campaignId || 'Unknown'}`
      );
      console.log(`✅ Updated existing contact with new reply`);
    } else {
      // Create new contact
      contact = await client.createContact({
        firstName,
        lastName,
        email,
        phone,
        company: companyName,
        title,
      });
      isNewContact = true;
    }

    // Step 2: Check/create company
    const company = await client.checkOrCreateCompany(companyName);

    // Step 3: Get pipeline stage (don't hardcode)
    const pipelineStage = await client.getPipelineStages();

    // Step 4: Create deal with RICHER DATA
    const dealName = `${companyName || 'Unknown Company'} - Discovery Call`; // Proper format
    const deal = await client.createDeal({
      name: dealName,
      value: 0,
      stageId: pipelineStage.id,
      contactId: contact.id,
      source: 'PlusVibe Cold Email', // Add source field
      description: `Warm lead from PlusVibe Cold Email${campaignName ? ` (Campaign: ${campaignName})` : ''}. Contact replied: "${replyText || 'Interested'}"`,
    });

    // Step 5: Log activity with ACTUAL REPLY TEXT
    await client.createActivity({
      subject: `Warm Reply Received - ${name}`,
      body: `Contact ${name} from ${companyName || 'Unknown Company'} replied to our PlusVibe cold email:\n\nReply: "${replyText || 'Interested'}"\n\nCampaign: ${campaignName || campaignId || 'Unknown'}\n\nLead automatically added to pipeline via PlusVibe integration.`,
      contactId: contact.id,
      dealId: deal.id,
    });

    // Step 6: Send WhatsApp alert to Mark via Command Center
    await client.sendWhatsAppAlert({
      firstName,
      lastName: lastName || '',
      email,
      company: companyName,
      id: contact.id
    }, deal);

    const result = {
      success: true,
      contact,
      company,
      deal,
      isNewContact,
      message: `Successfully ${isNewContact ? 'created' : 'updated'} pipeline for ${name} at ${companyName || 'Unknown Company'}`,
    };

    console.log('🎉 IMPROVED Pipeline creation completed successfully!');
    return result;

  } catch (error) {
    console.error('💥 Pipeline creation failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// CLI Interface
function parseCliArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
      
      switch (key) {
        case 'email':
          parsed.email = value;
          break;
        case 'name':
          parsed.name = value;
          break;
        case 'company':
          parsed.company = value;
          break;
        case 'reply-text':
          parsed.replyText = value;
          break;
        case 'phone':
          parsed.phone = value;
          break;
        case 'title':
          parsed.title = value;
          break;
        case 'campaign-name':
          parsed.campaignName = value;
          break;
        case 'campaign-id':
          parsed.campaignId = value;
          break;
      }
    }
  }

  return parsed;
}

// Main CLI execution
async function main() {
  if (require.main === module) {
    const args = parseCliArgs();
    
    if (!args.email || !args.name) {
      console.error('❌ Missing required arguments');
      console.log('Usage: node auto-pipeline.js --email="john@company.com" --name="John Smith" --company="Acme Corp" --reply-text="Sure, interested" --campaign-name="Tech Campaign"');
      process.exit(1);
    }

    console.log('🔥 Auto CRM Pipeline Creator (IMPROVED) Starting...');
    console.log('Arguments:', args);
    
    const result = await createPipelineDeal(args);
    
    if (result.success) {
      console.log('\n📊 Result Summary:');
      console.log(`Contact: ${result.contact.firstName} ${result.contact.lastName} (ID: ${result.contact.id}) - ${result.isNewContact ? 'CREATED' : 'UPDATED'}`);
      if (result.company) {
        console.log(`Company: ${result.company.name} (ID: ${result.company.id})`);
      }
      console.log(`Deal: ${result.deal.name} (ID: ${result.deal.id})`);
      process.exit(0);
    } else {
      console.error('\n💥 Pipeline creation failed:', result.error);
      process.exit(1);
    }
  }
}

// Export for module usage
module.exports = {
  createPipelineDeal,
  CRMPipelineClient,
};

// Run main if executed directly
main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});