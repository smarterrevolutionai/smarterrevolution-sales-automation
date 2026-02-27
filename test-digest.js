#!/usr/bin/env node

// Test script to send a short digest to Mark only

const { sendSMS } = require('./warm-lead-digest.js');

async function testDigest() {
  const shortMessage = `🌅 WARM LEAD DIGEST TEST - Feb 15

📧 INTERESTED EMAILS: 0 new
🔥 ACTIVE PIPELINE: 9 deals ($59,982)
⏰ FOLLOW-UP NEEDED: 0
🚨 STALE DEALS: 0

Test from OpenClaw warm-lead-digest system ✅`;

  console.log('📱 Testing digest SMS to Mark...\n');
  console.log(shortMessage);
  console.log('\nSending...');
  
  const result = await sendSMS('+13107405587', shortMessage, true);
  
  if (result.success) {
    console.log('✅ Test message sent successfully!');
  } else {
    console.log('❌ Test failed:', result.error);
  }
}

testDigest();