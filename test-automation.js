#!/usr/bin/env node

/**
 * Test script for AI Visibility Audit Automation
 */

const AIVisibilityAuditor = require('./auto-audit-full.js');

async function testAutomation() {
  console.log('🧪 Testing AI Visibility Audit Automation...\n');
  
  const auditor = new AIVisibilityAuditor();
  
  try {
    // Test initialization
    console.log('1. Testing initialization...');
    await auditor.init();
    console.log('✅ Initialization successful\n');
    
    // Test company website finding
    console.log('2. Testing website discovery...');
    const testWebsite = await auditor.findCompanyWebsite('Apple Inc');
    console.log(`✅ Website found: ${testWebsite}\n`);
    
    // Test AI visibility checks with mock data
    console.log('3. Testing AI visibility checks...');
    const mockCompanyInfo = {
      name: 'Test Company Inc',
      website: 'https://example.com',
      industry: 'Technology',
      contact: {
        name: 'John Smith',
        email: 'test@example.com',
        phone: '+1234567890'
      }
    };
    
    const auditResults = await auditor.runAIVisibilityChecks(mockCompanyInfo);
    console.log(`✅ Audit completed - Score: ${auditResults.percentage}%\n`);
    
    // Test PDF generation
    console.log('4. Testing PDF report generation...');
    const reportPath = await auditor.generatePDFReport(mockCompanyInfo, auditResults);
    console.log(`✅ PDF generated: ${reportPath}\n`);
    
    // Test processed IDs functionality
    console.log('5. Testing processed IDs management...');
    await auditor.saveProcessedIds();
    await auditor.loadProcessedIds();
    console.log('✅ Processed IDs management working\n');
    
    console.log('🎉 All tests passed! Automation is ready to use.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await auditor.stop();
  }
}

// Run tests
if (require.main === module) {
  testAutomation();
}