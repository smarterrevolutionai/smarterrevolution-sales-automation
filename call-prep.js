#!/usr/bin/env node

/**
 * Call Prep Brief Generator for Smarter Revolution
 * 
 * Usage: node call-prep.js --company="Acme Corp" --contact="John Smith" --email="john@acme.com" --title="CEO"
 * 
 * Generates comprehensive pre-call briefs by researching company websites and CRM data
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

// Command line argument parsing
function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        const [key, value] = arg.split('=');
        args[key.replace('--', '')] = value?.replace(/^["']|["']$/g, '');
    });
    return args;
}

// Generate company slug for filename
function generateSlug(company) {
    return company.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Make HTTP request helper
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const requestModule = urlObj.protocol === 'https:' ? https : http;
        
        const req = requestModule.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// Fetch company website content
async function fetchWebsiteContent(company) {
    try {
        // Generate possible domains more intelligently
        const possibleDomains = [
            `${generateSlug(company)}.com`,
            `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            `${company.toLowerCase().replace(/\s+/g, '')}.com`,
            // Handle "Name Inc" format -> "name.com"
            `${company.toLowerCase().replace(/\s+(inc|llc|corp|ltd|co)\s*$/i, '').replace(/[^a-z0-9]/g, '')}.com`,
            // Handle "A. B. Name" format -> "abname.com" 
            `${company.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '')}.com`,
            // For Sam O. Hirota Inc -> samhirota.com
            `${company.toLowerCase().replace(/\s+[a-z]\.\s+/g, '').replace(/\s+(inc|llc|corp|ltd|co)\s*$/i, '').replace(/[^a-z0-9]/g, '')}.com`
        ];
        
        for (const domain of possibleDomains) {
            try {
                console.log(`Trying domain: ${domain}`);
                const response = await makeRequest(`https://${domain}`);
                
                if (response.status === 200) {
                    const content = stripHtml(response.data);
                    return {
                        url: `https://${domain}`,
                        content: content.substring(0, 2000), // Limit content
                        success: true
                    };
                }
            } catch (err) {
                console.log(`Failed to fetch ${domain}: ${err.message}`);
                continue;
            }
        }
        
        return {
            url: null,
            content: null,
            success: false,
            error: 'Could not determine company website'
        };
        
    } catch (error) {
        return {
            url: null,
            content: null,
            success: false,
            error: error.message
        };
    }
}

// Strip HTML tags and extract readable text
function stripHtml(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
}

// Authenticate with CRM and get session cookie
async function authenticateCRM() {
    try {
        const response = await makeRequest('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'WorkSmarter2025!'
            })
        });
        
        if (response.status === 200) {
            const setCookie = response.headers['set-cookie'];
            if (setCookie) {
                const sessionCookie = setCookie.find(cookie => cookie.includes('sr_session'));
                if (sessionCookie) {
                    return sessionCookie.split(';')[0];
                }
            }
        }
        return null;
    } catch (error) {
        console.log(`CRM auth failed: ${error.message}`);
        return null;
    }
}

// Fetch CRM data
async function fetchCRMData(contact, email, sessionCookie) {
    const crmData = { contact: null, company: null };
    
    if (!sessionCookie) {
        return crmData;
    }
    
    try {
        // Search for contact by email
        if (email) {
            const contactResponse = await makeRequest(`http://localhost:3000/api/contacts?search=${encodeURIComponent(email)}`, {
                headers: { 'Cookie': sessionCookie }
            });
            
            if (contactResponse.status === 200) {
                const contactData = JSON.parse(contactResponse.data);
                if (contactData && contactData.length > 0) {
                    crmData.contact = contactData[0];
                }
            }
        }
        
        // Search for company
        const companyResponse = await makeRequest(`http://localhost:3000/api/companies?search=${encodeURIComponent(contact.company)}`, {
            headers: { 'Cookie': sessionCookie }
        });
        
        if (companyResponse.status === 200) {
            const companyData = JSON.parse(companyResponse.data);
            if (companyData && companyData.length > 0) {
                crmData.company = companyData[0];
            }
        }
        
    } catch (error) {
        console.log(`CRM fetch failed: ${error.message}`);
    }
    
    return crmData;
}

// Analyze content for AI readiness signals
function analyzeAIReadiness(websiteContent, crmData) {
    const signals = [];
    const content = websiteContent || '';
    
    // Tech stack indicators
    const techKeywords = ['api', 'automation', 'digital', 'software', 'platform', 'technology', 'data', 'analytics', 'cloud', 'saas'];
    const foundTech = techKeywords.filter(keyword => content.toLowerCase().includes(keyword));
    if (foundTech.length > 0) {
        signals.push(`Tech mentions: ${foundTech.join(', ')}`);
    }
    
    // Digital presence assessment
    if (content.includes('digital transformation') || content.includes('digitization')) {
        signals.push('Already discussing digital transformation');
    }
    
    // Automation opportunities
    const processKeywords = ['manual', 'process', 'workflow', 'efficiency', 'streamline'];
    const foundProcess = processKeywords.filter(keyword => content.toLowerCase().includes(keyword));
    if (foundProcess.length > 0) {
        signals.push(`Process optimization focus: ${foundProcess.join(', ')}`);
    }
    
    return signals.length > 0 ? signals : ['Limited digital presence detected - good opportunity for AI introduction'];
}

// Generate pain points based on industry and role
function generatePainPoints(industry, title, size) {
    const painPoints = [];
    
    // Industry-specific challenges
    const industryPains = {
        'technology': ['Scaling tech teams', 'Managing technical debt', 'Staying competitive'],
        'healthcare': ['Regulatory compliance', 'Patient data management', 'Operational efficiency'],
        'manufacturing': ['Supply chain optimization', 'Quality control', 'Inventory management'],
        'retail': ['Customer experience', 'Inventory management', 'Omnichannel integration'],
        'financial': ['Regulatory compliance', 'Risk management', 'Customer experience'],
        'default': ['Manual processes', 'Data silos', 'Operational inefficiencies']
    };
    
    const detectedIndustry = Object.keys(industryPains).find(ind => 
        industry.toLowerCase().includes(ind)
    ) || 'default';
    
    painPoints.push(...industryPains[detectedIndustry]);
    
    // Size-specific challenges
    if (size && size.includes('50-200')) {
        painPoints.push('Growing pains - scaling operations', 'Need for better systems and processes');
    } else if (size && size.includes('200-500')) {
        painPoints.push('Coordination across departments', 'Need for standardized processes');
    }
    
    // Role-specific challenges
    const rolePains = {
        'ceo': ['Strategic decision making', 'Competitive advantage', 'ROI measurement'],
        'cto': ['Technology roadmap', 'Team productivity', 'Technical scalability'],
        'coo': ['Operational efficiency', 'Process optimization', 'Cost reduction'],
        'vp': ['Department coordination', 'Performance metrics', 'Resource allocation']
    };
    
    const detectedRole = Object.keys(rolePains).find(role => 
        title.toLowerCase().includes(role)
    );
    
    if (detectedRole) {
        painPoints.push(...rolePains[detectedRole]);
    }
    
    return [...new Set(painPoints)]; // Remove duplicates
}

// Generate Smarter Revolution solutions
function generateSolutions(industry, size, painPoints) {
    const solutions = [];
    
    // Core services
    solutions.push('AI Visibility Audit (free) - perfect starting point to assess current state');
    solutions.push('AI Strategy Workshop - develop roadmap aligned with business goals');
    
    // Product recommendations
    if (painPoints.some(p => p.includes('knowledge') || p.includes('training'))) {
        solutions.push('Guided Knowledge Hub - centralize and AI-enhance institutional knowledge');
    }
    
    if (painPoints.some(p => p.includes('content') || p.includes('marketing'))) {
        solutions.push('Guided Video Production - scale content creation with AI assistance');
    }
    
    // Size-appropriate recommendations
    if (size && (size.includes('50-200') || size.includes('200-500'))) {
        solutions.push('Implementation Support - hands-on guidance during AI transformation');
    }
    
    return solutions;
}

// Generate conversation starters
function generateConversationStarters(contact, company, industry) {
    const starters = [
        `I've been researching ${company} and I'm curious - what's your biggest operational challenge right now?`,
        `As ${contact.title} at ${company}, what keeps you up at night when it comes to scaling your operations?`,
        `I noticed ${company} is in ${industry} - how are you currently handling [specific industry process]?`
    ];
    
    const talkingPoints = [
        'Our "AI doesn\'t replace your team - it gives them superpowers" philosophy',
        'Success stories from similar companies in your industry',
        'The ROI timeline for AI transformation projects'
    ];
    
    return { questions: starters, talkingPoints };
}

// Generate the brief
function generateBrief(contact, websiteData, crmData) {
    const date = new Date().toISOString().split('T')[0];
    const industry = websiteData.content ? extractIndustry(websiteData.content) : 'Not determined';
    const size = crmData.company?.employees || 'Not determined';
    
    const aiReadiness = analyzeAIReadiness(websiteData.content, crmData);
    const painPoints = generatePainPoints(industry, contact.title, size);
    const solutions = generateSolutions(industry, size, painPoints);
    const conversation = generateConversationStarters(contact, contact.company, industry);
    
    return `# Discovery Call Prep: ${contact.company}
Date: ${date}
Contact: ${contact.name}, ${contact.title}

## Company Overview
- Industry: ${industry}
- Size (employees): ${size}
- Revenue estimate: ${crmData.company?.revenue || 'Not available'}
- Website: ${websiteData.url || 'Not found'}
- Location: ${crmData.company?.location || 'Not available'}

## What They Do
${websiteData.content ? extractBusinessSummary(websiteData.content) : 'Business summary not available - website could not be accessed.'}

## AI Readiness Signals
${aiReadiness.map(signal => `- ${signal}`).join('\n')}

## Pain Points to Explore
${painPoints.map(point => `- ${point}`).join('\n')}

## Our Relevant Solutions
${solutions.map(solution => `- ${solution}`).join('\n')}

## Conversation Starters
${conversation.questions.map(q => `- ${q}`).join('\n')}

### Key Talking Points
${conversation.talkingPoints.map(point => `- ${point}`).join('\n')}

## Red Flags / Notes
${generateRedFlags(websiteData, crmData)}

---
*Generated by Smarter Revolution Call Prep Tool - ${new Date().toISOString()}*
`;
}

// Extract industry from website content
function extractIndustry(content) {
    const industryKeywords = {
        'Technology/Software': ['software', 'technology', 'tech', 'app', 'platform', 'saas', 'api'],
        'Healthcare': ['health', 'medical', 'hospital', 'patient', 'healthcare'],
        'Manufacturing': ['manufacturing', 'production', 'factory', 'industrial'],
        'Retail/E-commerce': ['retail', 'store', 'shop', 'ecommerce', 'marketplace'],
        'Financial Services': ['financial', 'bank', 'investment', 'insurance', 'fintech'],
        'Consulting': ['consulting', 'advisory', 'strategy', 'consultant']
    };
    
    const lowerContent = content.toLowerCase();
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
        if (keywords.some(keyword => lowerContent.includes(keyword))) {
            return industry;
        }
    }
    return 'General Business';
}

// Extract business summary
function extractBusinessSummary(content) {
    // Look for common patterns in website content
    const sentences = content.split('.').map(s => s.trim()).filter(s => s.length > 20);
    
    // Find sentences that might describe what the company does
    const descriptiveSentences = sentences.filter(sentence => {
        const lower = sentence.toLowerCase();
        return lower.includes('we') || lower.includes('our') || lower.includes('company') ||
               lower.includes('provide') || lower.includes('offer') || lower.includes('specialize');
    });
    
    if (descriptiveSentences.length > 0) {
        return descriptiveSentences.slice(0, 2).join('. ') + '.';
    }
    
    // Fallback to first few sentences
    return sentences.slice(0, 2).join('. ') + '.';
}

// Generate red flags
function generateRedFlags(websiteData, crmData) {
    const flags = [];
    
    if (!websiteData.success) {
        flags.push('⚠️ Could not access company website - may indicate limited digital presence');
    }
    
    if (crmData.contact && crmData.contact.lastContact) {
        flags.push(`📧 Previous contact recorded: ${crmData.contact.lastContact}`);
    }
    
    if (websiteData.content && websiteData.content.includes('under construction')) {
        flags.push('🚧 Website appears to be under construction');
    }
    
    if (flags.length === 0) {
        flags.push('✅ No obvious red flags detected');
    }
    
    return flags.join('\n');
}

// Main execution
async function main() {
    const args = parseArgs();
    
    if (!args.company || !args.contact || !args.email || !args.title) {
        console.error('Usage: node call-prep.js --company="Company Name" --contact="Contact Name" --email="email@example.com" --title="Job Title"');
        process.exit(1);
    }
    
    console.log('🔍 Generating call prep brief...');
    console.log(`Company: ${args.company}`);
    console.log(`Contact: ${args.contact} (${args.title})`);
    console.log(`Email: ${args.email}`);
    console.log();
    
    const contact = {
        name: args.contact,
        title: args.title,
        email: args.email,
        company: args.company
    };
    
    // Fetch website data
    console.log('🌐 Fetching company website...');
    const websiteData = await fetchWebsiteContent(args.company);
    if (websiteData.success) {
        console.log(`✅ Website found: ${websiteData.url}`);
    } else {
        console.log(`❌ Website not accessible: ${websiteData.error}`);
    }
    
    // Authenticate with CRM
    console.log('🔐 Authenticating with CRM...');
    const sessionCookie = await authenticateCRM();
    if (sessionCookie) {
        console.log('✅ CRM authentication successful');
    } else {
        console.log('❌ CRM authentication failed');
    }
    
    // Fetch CRM data
    console.log('📊 Checking CRM for existing data...');
    const crmData = await fetchCRMData(contact, args.email, sessionCookie);
    if (crmData.contact || crmData.company) {
        console.log('✅ Found CRM data');
    } else {
        console.log('ℹ️ No existing CRM data found');
    }
    
    // Generate the brief
    console.log('📝 Generating brief...');
    const brief = generateBrief(contact, websiteData, crmData);
    
    // Create output directory
    const outputDir = '/opt/smarty-projects/call-briefs';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`📁 Created directory: ${outputDir}`);
    }
    
    // Save to file
    const slug = generateSlug(args.company);
    const date = new Date().toISOString().split('T')[0];
    const filename = `${slug}-${date}.md`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, brief);
    console.log(`💾 Brief saved to: ${filepath}`);
    
    // Output to stdout
    console.log('\n' + '='.repeat(80));
    console.log(brief);
    console.log('='.repeat(80));
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection:', reason);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    generateBrief,
    fetchWebsiteContent,
    authenticateCRM,
    fetchCRMData
};