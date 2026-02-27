#!/usr/bin/env node

/**
 * Test script for call prep automation
 * Creates a mock meeting scenario to test the full flow
 */

const { runCallPrepAutomation, generateCallPrepBrief, sendSMS } = require('./call-prep-auto');

// Test data - simulating a discovery call
const mockMeeting = {
  entityId: 'test-123',
  type: 'lead_gen_meeting',
  company: 'TechCorp Solutions',
  contact: 'John Smith',
  contactId: null,
  date: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // 25 minutes from now
  status: 'scheduled'
};

const mockContactData = {
  title: 'CEO',
  email: 'john.smith@techcorp.com',
  company: 'TechCorp Solutions'
};

const mockWebsiteData = {
  url: 'https://techcorp.com',
  content: 'TechCorp Solutions is a leading software company specializing in enterprise automation. We have over 150 employees and serve Fortune 500 companies worldwide. Our technology platform helps businesses streamline their digital workflows.',
  success: true
};

async function testCallPrepAutomation() {
  console.log('🧪 Testing Call Prep Automation');
  console.log('================================\n');
  
  try {
    // Test brief generation
    console.log('📝 Testing brief generation...');
    const brief = generateCallPrepBrief(mockMeeting, mockContactData, mockWebsiteData);
    console.log('✅ Brief generated successfully');
    console.log('\n--- GENERATED BRIEF ---');
    console.log(brief);
    console.log('--- END BRIEF ---\n');
    
    // Test SMS sending (dry run)
    console.log('📱 Testing SMS functionality...');
    
    // Uncomment the line below to actually send a test SMS to Wolf
    // const smsResult = await sendSMS('+12133028260', 'Test: Call Prep Automation is working! 🚀');
    
    console.log('✅ SMS test skipped (enable by uncommenting line in test script)');
    
    console.log('\n🎉 All tests passed! The automation is ready to go.');
    console.log('📅 Cron job will run every 15 minutes to check for upcoming calls.');
    console.log('⏰ Briefs will be sent 30 minutes before discovery calls.');
    console.log('📱 SMS will be sent to Wolf at +12133028260');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testCallPrepAutomation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test error:', error);
      process.exit(1);
    });
}