#!/usr/bin/env node

const { URL } = require('url');
const fs = require('fs');

/**
 * Auto AI Visibility Audit Script
 * Analyzes websites for AI-readiness and generates personalized findings
 */

// Configuration
const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_REDIRECTS = 5;

/**
 * Fetches a URL with timeout and redirect handling
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ...options.headers
      }
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Strips HTML tags and returns clean text
 */
function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
}

/**
 * Normalizes URL to ensure it has a protocol
 */
function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

/**
 * Analyzes HTML content for various AI-readiness signals
 */
function analyzeWebsite(html, url, loadTimeMs) {
  const htmlLower = html.toLowerCase();
  const textContent = stripHtmlTags(html).toLowerCase();
  
  const analysis = {
    loadTimeMs,
    signals: {}
  };

  // 1. Chatbot detection
  const chatbotIndicators = [
    'intercom', 'drift', 'zendesk', 'tawk', 'livechat', 'hubspot',
    'crisp', 'freshchat', 'tidio', 'usercom', 'liveperson',
    'chat-widget', 'chatbot', 'chat-bubble', 'messenger-widget'
  ];
  analysis.signals.hasChatbot = chatbotIndicators.some(indicator => 
    htmlLower.includes(indicator)
  );

  // 2. Knowledge base / FAQ detection
  const kbIndicators = [
    'faq', 'frequently asked', 'knowledge base', 'help center',
    'support center', 'documentation', 'help desk', 'kb/'
  ];
  analysis.signals.hasKnowledgeBase = kbIndicators.some(indicator =>
    htmlLower.includes(indicator) || textContent.includes(indicator)
  );

  // 3. Blog detection
  const blogIndicators = ['/blog', 'blog/', 'news/', 'articles/', 'insights/'];
  analysis.signals.hasBlog = blogIndicators.some(indicator =>
    htmlLower.includes(indicator)
  );

  // 4. Video content detection
  const videoIndicators = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'wistia.com',
    '<video', 'video-player', 'embed-responsive'
  ];
  analysis.signals.hasVideo = videoIndicators.some(indicator =>
    htmlLower.includes(indicator)
  );

  // 5. Forms detection
  const formIndicators = [
    '<form', 'contact-form', 'lead-form', 'newsletter',
    'subscribe', 'input type="email"', 'input type="text"'
  ];
  analysis.signals.hasForms = formIndicators.some(indicator =>
    htmlLower.includes(indicator)
  );

  // 6. Scheduling/booking detection
  const schedulingIndicators = [
    'calendly', 'acuity', 'appointlet', 'hubspot meetings',
    'book a call', 'schedule', 'appointment', 'meeting'
  ];
  analysis.signals.hasScheduling = schedulingIndicators.some(indicator =>
    htmlLower.includes(indicator) || textContent.includes(indicator)
  );

  // 7. Mobile responsiveness
  analysis.signals.isMobileResponsive = htmlLower.includes('viewport') &&
    htmlLower.includes('device-width');

  // 8. Social media links
  const socialIndicators = [
    'linkedin.com', 'twitter.com', 'x.com', 'facebook.com',
    'instagram.com', 'youtube.com/channel', 'tiktok.com'
  ];
  analysis.signals.hasSocialMedia = socialIndicators.some(indicator =>
    htmlLower.includes(indicator)
  );

  // 9. E-commerce detection
  const ecommerceIndicators = [
    'shopify', 'woocommerce', 'cart', 'add to cart', 'checkout',
    'product', 'price', '$', 'buy now', 'shop', 'store'
  ];
  analysis.signals.isEcommerce = ecommerceIndicators.some(indicator =>
    htmlLower.includes(indicator) || textContent.includes(indicator)
  );

  // 10. Page load performance (basic assessment)
  if (loadTimeMs > 3000) {
    analysis.signals.slowLoading = true;
  }

  return analysis;
}

/**
 * Generates personalized findings based on analysis
 */
function generateFindings(analysis, company, website) {
  const findings = [];
  const signals = analysis.signals;

  // Customer Support Finding
  if (!signals.hasChatbot) {
    findings.push({
      area: "Customer Support",
      observation: "No AI chatbot detected on your website",
      impact: "Visitors with questions after hours have no way to get instant answers, potentially losing leads",
      recommendation: "An AI-powered chat assistant could handle 70% of common questions 24/7, freeing your team for complex inquiries"
    });
  }

  // Knowledge Management Finding
  if (!signals.hasKnowledgeBase) {
    findings.push({
      area: "Knowledge Management", 
      observation: "No visible FAQ or knowledge base section found",
      impact: "Customers can't self-serve answers, increasing support ticket volume",
      recommendation: "AI can help organize and surface your existing knowledge, making it searchable and accessible"
    });
  }

  // Content Strategy Finding
  if (!signals.hasBlog) {
    findings.push({
      area: "Content Strategy",
      observation: "No blog or content section detected",
      impact: "Missing opportunities for organic search traffic and thought leadership",
      recommendation: "AI can help generate consistent, SEO-optimized content that positions your expertise and drives traffic"
    });
  }

  // Lead Generation Finding
  if (!signals.hasForms && !signals.hasScheduling) {
    findings.push({
      area: "Lead Generation",
      observation: "Limited lead capture mechanisms found on homepage",
      impact: "Visitors may leave without providing contact information",
      recommendation: "AI-powered lead scoring and smart forms can increase conversion rates by personalizing the capture experience"
    });
  }

  // Performance Finding
  if (signals.slowLoading) {
    findings.push({
      area: "User Experience",
      observation: `Website loads slowly (${analysis.loadTimeMs}ms)`,
      impact: "Slow loading times increase bounce rates and hurt search rankings",
      recommendation: "AI can optimize images, predict user needs, and pre-load content to improve performance"
    });
  }

  // Mobile Experience Finding
  if (!signals.isMobileResponsive) {
    findings.push({
      area: "Mobile Experience",
      observation: "Mobile responsiveness indicators not detected",
      impact: "Poor mobile experience affects 60%+ of website visitors",
      recommendation: "AI can help optimize mobile experiences and personalize content based on device capabilities"
    });
  }

  // E-commerce Finding
  if (signals.isEcommerce) {
    findings.push({
      area: "E-commerce Intelligence",
      observation: "E-commerce functionality detected",
      impact: "Product recommendations and inventory management could be more intelligent",
      recommendation: "AI can provide personalized product recommendations and predict demand to optimize inventory"
    });
  }

  // Social Media Finding
  if (!signals.hasSocialMedia) {
    findings.push({
      area: "Social Media Integration",
      observation: "Limited social media presence visible on website",
      impact: "Missing opportunities for social proof and community building",
      recommendation: "AI can help automate social content creation and identify optimal posting times for engagement"
    });
  }

  // Return top 3-5 most impactful findings
  return findings.slice(0, Math.min(5, findings.length));
}

/**
 * Generates summary and snippets for email use
 */
function generateEmailContent(findings, company, website) {
  const findingCount = findings.length;
  
  const summary = `Based on our quick analysis of ${website}, we identified ${findingCount} areas where AI could have immediate impact on ${company}'s digital presence. ${findings.map(f => f.area).join(', ')} all present opportunities for AI enhancement that could improve customer experience and operational efficiency.`;

  const emailSnippet = `We ran a quick AI readiness scan on ${website} and found ${findingCount} immediate opportunities. ${findings[0]?.area} stood out - ${findings[0]?.observation.toLowerCase()}. Would you like to see the full analysis?`;

  const htmlSnippet = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px; border-radius: 8px;">
      <h3 style="color: #333; margin-bottom: 15px;">🤖 AI Readiness Scan: ${company}</h3>
      <p style="color: #666; margin-bottom: 15px;">We identified <strong>${findingCount} opportunities</strong> where AI could enhance your digital presence:</p>
      <ul style="color: #555; margin-bottom: 15px;">
        ${findings.slice(0, 3).map(f => `<li><strong>${f.area}:</strong> ${f.observation}</li>`).join('')}
      </ul>
      <p style="color: #666; font-size: 14px;">Want the full analysis with specific recommendations? Let's chat!</p>
    </div>
  `;

  return { summary, emailSnippet, htmlSnippet };
}

/**
 * Main audit function
 */
async function runAudit(url, company) {
  const startTime = Date.now();
  const normalizedUrl = normalizeUrl(url);
  const domain = new URL(normalizedUrl).hostname.replace('www.', '');

  try {
    // Fetch the website
    const response = await fetchWithTimeout(normalizedUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const loadTimeMs = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Analyze the website
    const analysis = analyzeWebsite(html, normalizedUrl, loadTimeMs);
    
    // Generate findings
    const findings = generateFindings(analysis, company, domain);
    
    // Generate email content
    const emailContent = generateEmailContent(findings, company, domain);

    return {
      company,
      website: domain,
      loadTimeMs: analysis.loadTimeMs,
      findings,
      summary: emailContent.summary,
      emailSnippet: emailContent.emailSnippet,
      htmlSnippet: emailContent.htmlSnippet,
      signals: analysis.signals,
      timestamp: new Date().toISOString(),
      success: true
    };

  } catch (error) {
    // Handle errors gracefully
    const loadTimeMs = Date.now() - startTime;
    
    return {
      company,
      website: domain,
      loadTimeMs,
      findings: [{
        area: "Website Accessibility",
        observation: `Unable to analyze website: ${error.message}`,
        impact: "Cannot assess current AI readiness without website access",
        recommendation: "Ensure website is accessible and responsive, then run AI readiness assessment"
      }],
      summary: `We attempted to analyze ${domain} but encountered technical difficulties. Once the website is accessible, we can provide a comprehensive AI readiness assessment for ${company}.`,
      emailSnippet: `We tried to analyze ${domain} but ran into some technical issues. Once your site is accessible, we'd love to show you the AI opportunities we typically find.`,
      htmlSnippet: `
        <div style="font-family: Arial, sans-serif; background: #fff3cd; padding: 20px; border-radius: 8px; border: 1px solid #ffeaa7;">
          <h3 style="color: #856404; margin-bottom: 15px;">⚠️ Analysis Note: ${company}</h3>
          <p style="color: #856404;">We encountered a technical issue while analyzing ${domain}. Once your website is accessible, we can provide a comprehensive AI readiness report.</p>
        </div>
      `,
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * CLI Interface
 */
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let url = '';
  let company = '';

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      url = arg.split('=')[1].replace(/['"]/g, '');
    } else if (arg.startsWith('--company=')) {
      company = arg.split('=')[1].replace(/['"]/g, '');
    }
  }

  if (!url || !company) {
    console.error('Usage: node auto-audit.js --url="https://example.com" --company="Company Name"');
    process.exit(1);
  }

  // Run the audit
  runAudit(url, company)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('Audit failed:', error.message);
      process.exit(1);
    });
}

// Export for module use
module.exports = { runAudit };