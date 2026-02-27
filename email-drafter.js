#!/usr/bin/env node

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Command line argument parsing
function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {};
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.split('=');
            const paramName = key.replace('--', '');
            parsed[paramName] = value ? value.replace(/^["']|["']$/g, '') : true;
        }
    }
    
    return parsed;
}

// Simple domain extraction from email
function extractDomain(email) {
    const match = email.match(/@(.+)$/);
    return match ? match[1] : null;
}

// Fetch company website content using curl (basic scraping)
async function fetchCompanyInfo(domain) {
    if (!domain) return null;
    
    try {
        // Try common website patterns
        const urls = [
            `https://${domain}`,
            `https://www.${domain}`,
            `http://${domain}`,
            `http://www.${domain}`
        ];
        
        for (const url of urls) {
            try {
                console.log(`🔍 Attempting to fetch: ${url}`);
                const result = execSync(`curl -s -L --max-time 10 --user-agent "Mozilla/5.0 (compatible; SmartRevBot/1.0)" "${url}" | head -c 5000`, 
                    { encoding: 'utf8', timeout: 15000 });
                
                if (result && result.length > 100) {
                    // Extract basic info from HTML
                    const title = result.match(/<title[^>]*>([^<]+)<\/title>/i);
                    const description = result.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
                    
                    return {
                        url,
                        title: title ? title[1].trim() : null,
                        description: description ? description[1].trim() : null,
                        content: result.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000)
                    };
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    } catch (error) {
        console.log(`⚠️  Could not fetch company info for ${domain}: ${error.message}`);
        return null;
    }
}

// Generate smart fallback response based on available data
function generateSmartFallback(email, reply, company, industry, companyInfo) {
    const replyLower = reply.toLowerCase();
    
    // Analyze the reply sentiment and content
    const isPositive = replyLower.includes('interested') || replyLower.includes('sounds good') || 
                      replyLower.includes('tell me more') || replyLower.includes('sure') || 
                      replyLower.includes('yes') || replyLower.includes('sounds interesting');
    
    const mentionsCost = replyLower.includes('cost') || replyLower.includes('price') || 
                        replyLower.includes('expensive') || replyLower.includes('budget');
    
    const mentionsTime = replyLower.includes('time') || replyLower.includes('schedule') || 
                        replyLower.includes('when') || replyLower.includes('quickly');
    
    const askingQuestions = replyLower.includes('how') || replyLower.includes('what') || 
                           replyLower.includes('who') || replyLower.includes('where');
    
    // Extract company context
    const companyContext = companyInfo ? {
        name: companyInfo.title || company || 'your company',
        industry: industry || (companyInfo.description ? extractIndustryHint(companyInfo.description) : 'your industry'),
        hasWebsite: true
    } : {
        name: company || 'your company',
        industry: industry || 'your industry',
        hasWebsite: false
    };
    
    // Build personalized response
    let response = 'Hi there,\n\n';
    
    // Opening based on their reply
    if (isPositive) {
        response += `Great to hear you're interested! `;
    } else if (askingQuestions) {
        response += `Thanks for the questions. `;
    } else {
        response += `Thanks for getting back to me. `;
    }
    
    // Company-specific context
    if (companyContext.hasWebsite && companyInfo) {
        response += `I took a quick look at ${companyContext.name.replace(/\s*-.*$/, '')} and can see you're `;
        
        if (companyInfo.description) {
            const desc = companyInfo.description.toLowerCase();
            if (desc.includes('manufacturer') || desc.includes('manufacturing')) {
                response += `in manufacturing, which is perfect for AI automation. `;
            } else if (desc.includes('service') || desc.includes('consulting')) {
                response += `service-focused, which means AI can really amplify your team's capabilities. `;
            } else if (desc.includes('tech') || desc.includes('software')) {
                response += `already tech-savvy, so you'll appreciate how AI can streamline operations. `;
            } else {
                response += `doing interesting work in ${companyContext.industry}. `;
            }
        } else {
            response += `in ${companyContext.industry}, which is a great fit for AI transformation. `;
        }
    } else {
        response += `I'd love to show you how other companies in ${companyContext.industry} are using AI to boost their operations without replacing their teams. `;
    }
    
    // Address specific concerns mentioned
    if (mentionsCost) {
        response += `The ROI on AI implementation is typically 3-5x within the first year, and we help you identify the highest-impact areas first.\n\n`;
    } else if (mentionsTime) {
        response += `Most clients start seeing results within 30-60 days, and we handle all the technical setup.\n\n`;
    } else {
        response += `\n`;
    }
    
    // CTA based on their engagement level
    if (isPositive && askingQuestions) {
        response += `I think a quick call would be the best way to answer your questions and show you exactly what's possible. I have some time this week: https://smarterrevolutionai.com/book\n\n`;
        response += `Or if you'd prefer to see a concrete example first, our AI Visibility Audit shows you exactly where AI can make the biggest impact in your business: https://smarterrevolutionai.com/ai-visibility-audit`;
    } else if (isPositive) {
        response += `Would you be interested in our free AI Visibility Audit? It shows you exactly where AI can make the biggest impact at ${companyContext.name.replace(/\s*-.*$/, '')} specifically: https://smarterrevolutionai.com/ai-visibility-audit\n\n`;
        response += `Or if you'd prefer to jump straight into a conversation, I have some time this week for a discovery call: https://smarterrevolutionai.com/book`;
    } else {
        response += `Here are two ways we can help you explore this:\n\n`;
        response += `1. Free AI Visibility Audit: https://smarterrevolutionai.com/ai-visibility-audit\n`;
        response += `2. Quick discovery call: https://smarterrevolutionai.com/book\n\n`;
        response += `Either way works, happy to help!`;
    }
    
    response += `\n\nBest,\nHenry Alouf\nSmarter Revolution`;
    
    return response;
}

// Extract industry hints from company description
function extractIndustryHint(description) {
    const desc = description.toLowerCase();
    if (desc.includes('manufacturer') || desc.includes('manufacturing')) return 'manufacturing';
    if (desc.includes('software') || desc.includes('tech')) return 'technology';
    if (desc.includes('service') || desc.includes('consulting')) return 'services';
    if (desc.includes('retail') || desc.includes('store')) return 'retail';
    if (desc.includes('healthcare') || desc.includes('medical')) return 'healthcare';
    if (desc.includes('finance') || desc.includes('bank')) return 'financial services';
    if (desc.includes('education') || desc.includes('school')) return 'education';
    if (desc.includes('logistics') || desc.includes('transport')) return 'logistics';
    return 'your industry';
}

// Make API call to Command Center OpenRouter endpoint
async function generateResponse(email, reply, company, industry, companyInfo) {
    const prompt = `You are Henry Alouf from Smarter Revolution, an AI transformation consultancy. A warm lead has replied to your outreach. Generate a personalized response draft.

LEAD INFO:
- Email: ${email}
- Company: ${company || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Their Reply: "${reply}"

COMPANY RESEARCH:
${companyInfo ? `
- Website: ${companyInfo.url}
- Title: ${companyInfo.title || 'N/A'}
- Description: ${companyInfo.description || 'N/A'}
- Content Preview: ${companyInfo.content || 'N/A'}
` : '- No website information available'}

WRITING RULES (CRITICAL):
- NO em dashes (—) anywhere. Use commas or periods instead.
- NO corporate jargon: avoid "leverage", "utilize", "in today's landscape"
- Conversational tone, short paragraphs
- Respond directly to what they said
- Keep it natural and human

REQUIRED ELEMENTS:
- Always include at least one of these links:
  * AI Visibility Audit: https://smarterrevolutionai.com/ai-visibility-audit
  * Book Discovery Call: https://smarterrevolutionai.com/book
- Sign as "Henry Alouf, Smarter Revolution"

CONTEXT: Smarter Revolution helps mid-market companies ($10M-$250M revenue) transform with AI without replacing their teams. We offer Guided Video Production and Guided Knowledge Hub solutions.

Generate a warm, personalized response that addresses their specific reply and moves the conversation forward.`;

    const payload = {
        model: "deepseek/deepseek-chat",
        messages: [
            {
                role: "user",
                content: prompt
            }
        ],
        max_tokens: 800,
        temperature: 0.7
    };

    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/api/llm',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(responseData);
                    if (response.choices && response.choices[0]) {
                        resolve(response.choices[0].message.content);
                    } else {
                        reject(new Error('Invalid API response format'));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse API response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`API request failed: ${error.message}`));
        });

        req.write(data);
        req.end();
    });
}

// Main function
async function main() {
    const args = parseArgs();
    
    // Validate required arguments
    if (!args.email || !args.reply) {
        console.error(`
❌ Missing required arguments

Usage: node email-drafter.js --email="joe@company.com" --reply="Sounds interesting, tell me more" [--company="Acme Corp"] [--industry="Manufacturing"]

Required:
  --email      Lead's email address
  --reply      Their reply text

Optional:
  --company    Company name
  --industry   Industry type
`);
        process.exit(1);
    }

    console.log('🤖 AI Email Response Drafter');
    console.log('================================');
    console.log(`📧 Email: ${args.email}`);
    console.log(`💬 Reply: "${args.reply}"`);
    console.log(`🏢 Company: ${args.company || 'Unknown'}`);
    console.log(`🏭 Industry: ${args.industry || 'Unknown'}`);
    console.log('');

    // Extract domain and fetch company info
    const domain = extractDomain(args.email);
    let companyInfo = null;
    
    if (domain && !domain.includes('gmail.com') && !domain.includes('yahoo.com') && !domain.includes('outlook.com')) {
        console.log('🔍 Researching company...');
        companyInfo = await fetchCompanyInfo(domain);
        
        if (companyInfo) {
            console.log(`✅ Found company info: ${companyInfo.title || companyInfo.url}`);
        } else {
            console.log('⚠️  Could not fetch company website');
        }
    } else {
        console.log('⚠️  Skipping company research (personal email domain)');
    }

    // Generate response
    console.log('');
    console.log('🧠 Generating personalized response...');
    
    try {
        const response = await generateResponse(
            args.email,
            args.reply,
            args.company,
            args.industry,
            companyInfo
        );

        console.log('');
        console.log('📝 DRAFT RESPONSE:');
        console.log('==================');
        console.log('');
        console.log(response);
        console.log('');
        console.log('✅ Draft ready for review!');
        
    } catch (error) {
        console.error(`❌ API failed: ${error.message}`);
        console.log('📝 Generating smart fallback...');
        
        const fallbackResponse = generateSmartFallback(
            args.email,
            args.reply,
            args.company,
            args.industry,
            companyInfo
        );
        
        console.log('');
        console.log('📝 SMART RESPONSE (Template-based):');
        console.log('=================================');
        console.log('');
        console.log(fallbackResponse);
        console.log('');
        console.log('✅ Draft ready for review!');
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error(`❌ Script failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { generateResponse, fetchCompanyInfo, parseArgs };