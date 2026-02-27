#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Post-Discovery Call Automation Script
 * Generates professional recap emails and proposal outlines
 */

// Smarter Revolution service tiers
const SERVICE_TIERS = {
  starter: {
    name: "Starter",
    price: "$2,597/mo",
    employees: "1-25",
    description: "AI Operations foundation package for small teams"
  },
  growth: {
    name: "Growth", 
    price: "$4,997/mo",
    employees: "26-100",
    description: "Comprehensive AI Operations for growing companies"
  },
  enterprise: {
    name: "Enterprise",
    price: "$9,997/mo", 
    employees: "101-500",
    description: "Full-scale AI transformation for large organizations"
  },
  custom: {
    name: "Custom",
    price: "$19,997+/mo",
    employees: "500+",
    description: "Enterprise-grade AI Operations tailored to your scale"
  }
};

// Additional services
const ADDITIONAL_SERVICES = {
  video: "Guided Video Production: AI-assisted video content creation",
  knowledge: "Guided Knowledge Hub: Internal knowledge management with AI", 
  audit: "AI Visibility Audit: Free assessment (lead magnet)",
  workshop: "AI Strategy Workshop: Paid deep-dive session"
};

class PostCallRecapGenerator {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionCookie = null;
    this.briefsPath = '/opt/smarty-projects/call-briefs';
    this.outputPath = '/opt/smarty-projects/post-call';
  }

  // Make HTTP requests
  makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (this.sessionCookie) {
        options.headers.Cookie = `sr_session=${this.sessionCookie}`;
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({ data: parsed, headers: res.headers, status: res.statusCode });
          } catch (e) {
            resolve({ data: responseData, headers: res.headers, status: res.statusCode });
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

  // Authenticate with CRM
  async authenticate() {
    try {
      const response = await this.makeRequest('POST', '/api/auth/login', {
        username: 'admin',
        password: 'WorkSmarter2025!'
      });

      if (response.data.success) {
        // Extract session cookie from Set-Cookie header
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
          const sessionMatch = setCookie[0].match(/sr_session=([^;]+)/);
          if (sessionMatch) {
            this.sessionCookie = sessionMatch[1];
            console.log('✅ Authenticated with CRM');
            return true;
          }
        }
      }
      
      throw new Error('Failed to authenticate');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      return false;
    }
  }

  // Get deal by ID or search by company name
  async getDeal(dealIdOrCompany) {
    try {
      // First try as deal ID
      if (dealIdOrCompany.length > 10) {
        const response = await this.makeRequest('GET', `/api/deals/${dealIdOrCompany}`);
        if (response.status === 200 && response.data.data) {
          return response.data.data;
        }
      }

      // Try searching by company name
      const searchResponse = await this.makeRequest('GET', '/api/deals');
      if (searchResponse.status === 200 && searchResponse.data.data) {
        const deals = searchResponse.data.data;
        const foundDeal = deals.find(deal => 
          deal.contact.company.toLowerCase().includes(dealIdOrCompany.toLowerCase()) ||
          deal.name.toLowerCase().includes(dealIdOrCompany.toLowerCase())
        );
        
        if (foundDeal) {
          return foundDeal;
        }
      }

      throw new Error(`Deal not found: ${dealIdOrCompany}`);
    } catch (error) {
      console.error('❌ Failed to get deal:', error.message);
      return null;
    }
  }

  // Get activities for a deal
  async getActivities(dealId) {
    try {
      const response = await this.makeRequest('GET', `/api/activities?dealId=${dealId}`);
      if (response.status === 200 && response.data.data) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to get activities:', error.message);
      return [];
    }
  }

  // Find call prep brief
  findCallPrepBrief(companySlug) {
    try {
      if (!fs.existsSync(this.briefsPath)) {
        return null;
      }

      const files = fs.readdirSync(this.briefsPath);
      const briefFile = files.find(file => 
        file.toLowerCase().includes(companySlug.toLowerCase()) && file.endsWith('.md')
      );

      if (briefFile) {
        const briefPath = path.join(this.briefsPath, briefFile);
        return fs.readFileSync(briefPath, 'utf8');
      }

      return null;
    } catch (error) {
      console.warn('⚠️ Could not read call prep brief:', error.message);
      return null;
    }
  }

  // Create company slug
  createSlug(companyName) {
    return companyName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }

  // Get pricing recommendation based on company size
  getPricingRecommendation(companySize = null) {
    if (!companySize) return SERVICE_TIERS.starter;
    
    const size = parseInt(companySize);
    if (size <= 25) return SERVICE_TIERS.starter;
    if (size <= 100) return SERVICE_TIERS.growth;
    if (size <= 500) return SERVICE_TIERS.enterprise;
    return SERVICE_TIERS.custom;
  }

  // Extract pain points from brief content
  extractPainPoints(briefContent) {
    if (!briefContent) return ['operational efficiency', 'manual processes'];
    
    const painPointsSection = briefContent.match(/## Pain Points to Explore\n(.*?)(?=\n## |$)/s);
    if (painPointsSection) {
      const points = painPointsSection[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim());
      
      return points.length > 0 ? points : ['operational efficiency', 'manual processes'];
    }
    
    return ['operational efficiency', 'manual processes'];
  }

  // Generate recap bullets from activities
  generateRecapBullets(activities, briefContent) {
    const bullets = [];
    
    // Add from activities
    activities.forEach(activity => {
      if (activity.type === 'call' && activity.body) {
        bullets.push(`• ${activity.body}`);
      }
    });

    // Add from brief if no activities
    if (bullets.length === 0) {
      bullets.push('• Discussed your current operational challenges and AI readiness');
      bullets.push('• Explored opportunities for process automation and efficiency gains');
      bullets.push('• Reviewed potential ROI and implementation timeline');
    }

    return bullets.join('\n');
  }

  // Generate proposal outline
  generateProposalOutline(deal, painPoints, tier, briefContent) {
    const companyName = deal.contact.company;
    const date = new Date().toISOString().split('T')[0];
    
    return `# Proposal Outline: ${companyName} AI Operations Implementation

**Date:** ${date}
**Contact:** ${deal.contact.firstName} ${deal.contact.lastName}
**Deal Value:** ${deal.currency} ${deal.value.toLocaleString()}

## Executive Summary

Transform ${companyName}'s operations with our proven AI Operations as a Service platform.

## Company Overview

- **Company:** ${companyName}
- **Contact:** ${deal.contact.firstName} ${deal.contact.lastName} (${deal.contact.email})
- **Industry:** ${briefContent ? 'See call prep brief' : 'To be determined'}
- **Current Stage:** ${deal.stage.name}

## Challenges Identified

Based on our discovery call, ${companyName} is facing:
${painPoints.map(pain => `- ${pain}`).join('\n')}

## Proposed Solution: ${tier.name} Plan

**${tier.name} - ${tier.price}**
- Perfect for companies with ${tier.employees} employees
- ${tier.description}

### Key Benefits:
- Automated workflow optimization
- AI-powered decision support
- Process efficiency improvements  
- Scalable implementation approach
- Ongoing optimization and support

### Implementation Timeline:
- **Week 1-2:** Assessment and setup
- **Week 3-4:** Core system deployment
- **Week 5-6:** Team training and adoption
- **Week 7-8:** Full rollout and optimization

## Additional Services Available:

${Object.values(ADDITIONAL_SERVICES).map(service => `- ${service}`).join('\n')}

## Investment

- **Monthly Subscription:** ${tier.price}
- **Implementation:** Included
- **Training:** Included
- **Ongoing Support:** Included

## Next Steps

1. Review and approve proposal
2. Schedule implementation kickoff call
3. Begin 30-day pilot program
4. Full rollout based on pilot results

---

*This proposal is valid for 30 days. Pricing subject to final scope confirmation.*`;
  }

  // Generate recap email
  generateRecapEmail(deal, painPoints, tier, activities, briefContent) {
    const firstName = deal.contact.firstName || 'there';
    const companyName = deal.contact.company;
    const painPointsText = painPoints.slice(0, 2).join(' and ');
    const recapBullets = this.generateRecapBullets(activities, briefContent);
    
    // Calculate proposal date (5 business days from now)
    const proposalDate = new Date();
    proposalDate.setDate(proposalDate.getDate() + 7);
    const proposalDateStr = proposalDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `Subject: Great Connecting Today, ${firstName} — Next Steps for ${companyName}

Hi ${firstName},

Thanks for taking the time to chat today. It was great learning about ${companyName} and the challenges you're facing with ${painPointsText}.

Here's a quick recap of what we discussed:
${recapBullets}

Based on our conversation, I think the ${tier.name} plan would be the best fit for ${companyName}. Here's what that looks like:

**${tier.name} Plan - ${tier.price}**
${tier.description}

This tier is designed for companies with ${tier.employees} employees and includes:
- Complete AI Operations setup and deployment
- Ongoing optimization and support  
- Team training and adoption assistance
- Scalable growth as your needs expand

Next Steps:
1. I'll send over a detailed proposal by ${proposalDateStr}
2. We can schedule a follow-up to walk through it together

Looking forward to helping ${companyName} work smarter.

Best,
Henry Alouf
Smarter Revolution

---
Reply to this email or call me at (555) 123-4567
Visit us: https://smarterrevolutionai.com`;
  }

  // Save files to organized directory
  saveFiles(deal, recapEmail, proposalOutline) {
    try {
      const companySlug = this.createSlug(deal.contact.company);
      const date = new Date().toISOString().split('T')[0];
      const outputDir = path.join(this.outputPath, `${companySlug}-${date}`);

      // Create directory if it doesn't exist
      if (!fs.existsSync(this.outputPath)) {
        fs.mkdirSync(this.outputPath, { recursive: true });
      }
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Save recap email
      const emailPath = path.join(outputDir, 'recap-email.md');
      fs.writeFileSync(emailPath, recapEmail);

      // Save proposal outline  
      const proposalPath = path.join(outputDir, 'proposal-outline.md');
      fs.writeFileSync(proposalPath, proposalOutline);

      console.log(`✅ Files saved to: ${outputDir}`);
      console.log(`   📧 recap-email.md`);
      console.log(`   📋 proposal-outline.md`);
      
      return outputDir;
    } catch (error) {
      console.error('❌ Failed to save files:', error.message);
      return null;
    }
  }

  // Main generation function
  async generateRecap(dealIdOrCompany) {
    try {
      console.log('🚀 Starting post-call recap generation...');
      
      // Authenticate
      if (!(await this.authenticate())) {
        return null;
      }

      // Get deal
      console.log(`🔍 Looking up deal: ${dealIdOrCompany}`);
      const deal = await this.getDeal(dealIdOrCompany);
      if (!deal) {
        return null;
      }

      console.log(`✅ Found deal: ${deal.name} (${deal.contact.company})`);

      // Get activities
      console.log('📋 Fetching activities...');
      const activities = await this.getActivities(deal.id);
      
      // Find call prep brief
      const companySlug = this.createSlug(deal.contact.company);
      console.log('📄 Looking for call prep brief...');
      const briefContent = this.findCallPrepBrief(companySlug);
      
      if (briefContent) {
        console.log('✅ Found call prep brief');
      } else {
        console.log('⚠️ No call prep brief found - using defaults');
      }

      // Extract data
      const painPoints = this.extractPainPoints(briefContent);
      const tier = this.getPricingRecommendation();
      
      console.log('✍️ Generating recap email...');
      const recapEmail = this.generateRecapEmail(deal, painPoints, tier, activities, briefContent);
      
      console.log('📝 Generating proposal outline...');
      const proposalOutline = this.generateProposalOutline(deal, painPoints, tier, briefContent);
      
      // Save files
      console.log('💾 Saving files...');
      const outputDir = this.saveFiles(deal, recapEmail, proposalOutline);
      
      if (outputDir) {
        console.log('\n🎉 Post-call recap generation completed successfully!');
        return {
          deal,
          outputDir,
          files: {
            email: path.join(outputDir, 'recap-email.md'),
            proposal: path.join(outputDir, 'proposal-outline.md')
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Generation failed:', error.message);
      return null;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  let dealIdOrCompany = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--deal-id' && args[i + 1]) {
      dealIdOrCompany = args[i + 1];
      break;
    } else if (args[i] === '--company' && args[i + 1]) {
      dealIdOrCompany = args[i + 1];
      break;
    }
  }

  if (!dealIdOrCompany) {
    console.log(`
📧 Post-Discovery Call Recap Generator

Usage:
  node post-call-recap.js --deal-id="abc123"
  node post-call-recap.js --company="Byron Outdoor Superstore"

Examples:
  node post-call-recap.js --deal-id="cml9zk5zr000bkjj40su9h7f0"
  node post-call-recap.js --company="Comefri USA"

The script will:
✅ Fetch deal and contact info from CRM
✅ Look for call prep brief  
✅ Generate professional recap email
✅ Create proposal outline
✅ Save both to organized folders
`);
    process.exit(1);
  }

  const generator = new PostCallRecapGenerator();
  const result = await generator.generateRecap(dealIdOrCompany);
  
  if (result) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Module export for programmatic use
if (require.main === module) {
  main();
} else {
  module.exports = { PostCallRecapGenerator };
}