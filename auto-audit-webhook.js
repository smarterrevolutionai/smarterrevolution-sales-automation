#!/usr/bin/env node

/**
 * AI Visibility Audit Automation - Webhook Version
 * 
 * Runs as a webhook server to receive assessment submissions directly from smarterrevolutionai.com
 * When a submission comes in, automatically:
 * 1. Extracts company name and website 
 * 2. Runs AI visibility checks (ChatGPT/Claude, search results, website analysis)
 * 3. Generates personalized PDF report
 * 4. Emails report to prospect
 * 5. Creates/updates CRM contact and deal
 * 
 * Usage: node auto-audit-webhook.js
 * Runs on port 3333 by default
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const querystring = require('querystring');

// Configuration
const PORT = process.env.PORT || 3333;
const CRM_API = 'http://localhost:3001'; // Command Center API
const CRM_API_KEY = 'process.env.CRM_API_KEY';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Email configuration
const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

class AIVisibilityAuditWebhook {
  constructor() {
    this.browser = null;
    this.mailer = EMAIL_CONFIG.auth.user ? nodemailer.createTransporter(EMAIL_CONFIG) : null;
    this.server = null;
  }

  async init() {
    console.log('🚀 Starting AI Visibility Audit Webhook Server...');
    
    // Initialize browser
    this.browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Setup server
    this.server = http.createServer(this.handleRequest.bind(this));
    
    console.log('✅ Webhook server initialized');
  }

  async handleRequest(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    if (req.method === 'POST' && url.pathname === '/webhook/assessment') {
      await this.handleAssessmentWebhook(req, res);
    } else if (req.method === 'GET' && url.pathname === '/health') {
      this.handleHealthCheck(req, res);
    } else if (req.method === 'GET' && url.pathname === '/') {
      this.handleStatus(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  async handleAssessmentWebhook(req, res) {
    try {
      console.log('\n📥 Received assessment submission webhook');
      
      // Parse request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const assessmentData = JSON.parse(body);
          console.log(`🎯 Processing assessment for ${assessmentData.companyName}`);
          
          // Process in background
          this.processAssessment(assessmentData).catch(error => {
            console.error(`❌ Failed to process assessment for ${assessmentData.companyName}:`, error.message);
          });
          
          // Respond immediately
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Assessment received, AI audit processing started' 
          }));
          
        } catch (error) {
          console.error('❌ Error parsing assessment data:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON data' }));
        }
      });
      
    } catch (error) {
      console.error('❌ Error handling assessment webhook:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  handleHealthCheck(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'AI Visibility Audit Webhook',
      timestamp: new Date().toISOString()
    }));
  }

  handleStatus(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>AI Visibility Audit Webhook</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px;">
          <h1>🤖 AI Visibility Audit Automation</h1>
          <p><strong>Status:</strong> Active and running</p>
          <p><strong>Port:</strong> ${PORT}</p>
          <p><strong>Webhook Endpoint:</strong> <code>POST /webhook/assessment</code></p>
          <p><strong>Health Check:</strong> <a href="/health">GET /health</a></p>
          
          <h2>How it works:</h2>
          <ol>
            <li>Receives assessment submissions from smarterrevolutionai.com</li>
            <li>Extracts company info and finds their website</li>
            <li>Runs AI visibility checks (ChatGPT/Claude knowledge, search results, website analysis)</li>
            <li>Generates personalized PDF audit report</li>
            <li>Emails report to the prospect</li>
            <li>Updates CRM with audit results</li>
          </ol>
          
          <h2>Configuration:</h2>
          <ul>
            <li><strong>OpenRouter API:</strong> ${OPENROUTER_API_KEY ? '✅ Configured' : '❌ Missing'}</li>
            <li><strong>SMTP Email:</strong> ${this.mailer ? '✅ Configured' : '❌ Missing'}</li>
            <li><strong>Browser:</strong> ${this.browser ? '✅ Ready' : '❌ Not initialized'}</li>
          </ul>
          
          <p><small>Last updated: ${new Date().toISOString()}</small></p>
        </body>
      </html>
    `);
  }

  async processAssessment(assessmentData) {
    console.log(`\n🎯 Processing AI Visibility Audit for ${assessmentData.companyName}`);
    
    // Extract company info
    const companyInfo = {
      name: assessmentData.companyName,
      website: await this.findCompanyWebsite(assessmentData.companyName),
      industry: assessmentData.industry,
      contact: {
        name: assessmentData.name,
        email: assessmentData.email,
        phone: assessmentData.phone
      }
    };

    console.log(`🌐 Company website: ${companyInfo.website || 'Not found'}`);

    // Run AI visibility checks
    const auditResults = await this.runAIVisibilityChecks(companyInfo);
    
    // Generate personalized PDF report
    const reportPath = await this.generatePDFReport(companyInfo, auditResults, assessmentData);
    
    // Email the report (if SMTP is configured)
    if (this.mailer) {
      await this.emailReport(companyInfo, reportPath, auditResults);
    } else {
      console.log('⚠️  SMTP not configured - skipping email');
    }
    
    // Update CRM with audit results
    await this.updateCRMWithAuditResults(assessmentData, auditResults);
    
    console.log(`✅ Completed AI audit for ${assessmentData.companyName}`);
  }

  async findCompanyWebsite(companyName) {
    try {
      console.log(`🔎 Searching for website of ${companyName}...`);
      
      const page = await this.browser.newPage();
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(companyName + ' official website')}`);
      
      // Extract first organic result URL
      const firstLink = await page.$eval('a[href*="http"]:not([href*="google"])', el => el.href);
      await page.close();
      
      return firstLink;
    } catch (error) {
      console.warn(`⚠️  Could not find website for ${companyName}:`, error.message);
      return null;
    }
  }

  async runAIVisibilityChecks(companyInfo) {
    console.log(`🧠 Running AI visibility checks for ${companyInfo.name}...`);
    
    const results = {
      score: 0,
      maxScore: 100,
      checks: {},
      insights: [],
      recommendations: []
    };

    try {
      // 1. Ask AI tools about the company
      const aiKnowledgeCheck = await this.checkAIKnowledge(companyInfo);
      results.checks.aiKnowledge = aiKnowledgeCheck;
      results.score += aiKnowledgeCheck.score;

      // 2. Check AI search results  
      const searchVisibilityCheck = await this.checkSearchVisibility(companyInfo);
      results.checks.searchVisibility = searchVisibilityCheck;
      results.score += searchVisibilityCheck.score;

      // 3. Analyze website for AI-readiness signals
      if (companyInfo.website) {
        const websiteAnalysisCheck = await this.analyzeWebsiteAIReadiness(companyInfo);
        results.checks.websiteAnalysis = websiteAnalysisCheck;
        results.score += websiteAnalysisCheck.score;
      } else {
        results.checks.websiteAnalysis = {
          score: 0,
          maxScore: 30,
          issues: ['No website found'],
          signals: []
        };
      }

      // Calculate final score
      const maxPossible = Object.values(results.checks).reduce((sum, check) => sum + check.maxScore, 0);
      results.percentage = Math.round((results.score / maxPossible) * 100);
      
      // Generate insights and recommendations
      results.insights = await this.generateInsights(companyInfo, results);
      results.recommendations = await this.generateRecommendations(companyInfo, results);
      
      console.log(`📊 AI Visibility Score: ${results.percentage}% (${results.score}/${maxPossible})`);
      
    } catch (error) {
      console.error('❌ Error running AI visibility checks:', error.message);
      // Return default failed results
      results.percentage = 0;
      results.insights = ['Unable to complete AI visibility analysis due to technical error'];
      results.recommendations = ['Please contact support for a manual audit'];
    }
    
    return results;
  }

  async checkAIKnowledge(companyInfo) {
    if (!OPENROUTER_API_KEY) {
      return {
        score: 0,
        maxScore: 35,
        confidence: 'Error',
        knowledge: 'OpenRouter API key not configured',
        issues: ['Cannot check AI knowledge - API key missing']
      };
    }

    try {
      console.log(`🤖 Checking what AI tools know about ${companyInfo.name}...`);
      
      const prompt = `What do you know about the company "${companyInfo.name}"${companyInfo.industry ? ` in the ${companyInfo.industry} industry` : ''}? Please provide:
1. Basic company information (what they do, size, location)
2. Their reputation and market presence  
3. Any notable achievements or news
4. Rate your confidence in this information (High/Medium/Low/None)

If you don't know about this company, please say so clearly.`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        })
      });

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content || 'No response';
      
      // Score based on AI knowledge depth
      let score = 0;
      const lowerResponse = aiResponse.toLowerCase();
      if (lowerResponse.includes('high')) {
        score = 35; // AI has detailed knowledge
      } else if (lowerResponse.includes('medium')) {
        score = 25; // AI has some knowledge
      } else if (lowerResponse.includes('low')) {
        score = 15; // AI has limited knowledge
      } else if (lowerResponse.includes('don\'t know') || lowerResponse.includes('not familiar')) {
        score = 5; // AI doesn't know company
      } else {
        score = 20; // Unclear but some information provided
      }

      return {
        score,
        maxScore: 35,
        confidence: this.extractConfidence(aiResponse),
        knowledge: aiResponse,
        issues: score < 20 ? ['Limited AI knowledge of your company'] : []
      };
      
    } catch (error) {
      console.warn('⚠️  AI knowledge check failed:', error.message);
      return {
        score: 0,
        maxScore: 35,
        confidence: 'Error',
        knowledge: 'Could not check AI knowledge due to error',
        issues: ['Failed to check AI knowledge']
      };
    }
  }

  async checkSearchVisibility(companyInfo) {
    try {
      console.log(`🔍 Checking search visibility for ${companyInfo.name}...`);
      
      const page = await this.browser.newPage();
      let score = 0;
      const checks = [];

      // Search for company name
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(companyInfo.name)}`);
      
      // Check if company appears in top 3 results
      const topResults = await page.$$eval('h3', els => 
        els.slice(0, 3).map(el => el.textContent.toLowerCase())
      );
      
      const companyNameLower = companyInfo.name.toLowerCase();
      const appearsInTop3 = topResults.some(result => 
        result.includes(companyNameLower) || companyNameLower.includes(result.split(' ')[0])
      );
      
      if (appearsInTop3) {
        score += 15;
        checks.push('Appears in top 3 Google results');
      } else {
        checks.push('Does not appear in top 3 Google results');
      }

      // Check knowledge panel
      const hasKnowledgePanel = await page.$('.kp-header') !== null;
      if (hasKnowledgePanel) {
        score += 10;
        checks.push('Has Google Knowledge Panel');
      } else {
        checks.push('No Google Knowledge Panel');
      }

      // Search with "AI" keyword
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(companyInfo.name + ' AI artificial intelligence')}`);
      
      const aiResults = await page.$$eval('h3', els => 
        els.slice(0, 5).map(el => el.textContent.toLowerCase())
      );
      
      const appearsInAISearch = aiResults.some(result => 
        result.includes(companyNameLower)
      );
      
      if (appearsInAISearch) {
        score += 10;
        checks.push('Appears in AI-related search results');
      } else {
        checks.push('Does not appear in AI-related search results');
      }

      await page.close();

      return {
        score,
        maxScore: 35,
        checks,
        issues: score < 20 ? ['Poor search visibility'] : []
      };

    } catch (error) {
      console.warn('⚠️  Search visibility check failed:', error.message);
      return {
        score: 0,
        maxScore: 35,
        checks: ['Error checking search visibility'],
        issues: ['Failed to check search visibility']
      };
    }
  }

  async analyzeWebsiteAIReadiness(companyInfo) {
    try {
      console.log(`🌐 Analyzing website AI-readiness for ${companyInfo.website}...`);
      
      const page = await this.browser.newPage();
      await page.goto(companyInfo.website, { waitUntil: 'networkidle0', timeout: 30000 });
      
      const content = await page.content();
      const text = await page.evaluate(() => document.body.textContent);
      
      await page.close();

      let score = 0;
      const signals = [];
      const issues = [];

      // AI-related keywords
      const aiKeywords = ['artificial intelligence', 'machine learning', 'AI', 'automation', 'digital transformation', 'data analytics', 'smart', 'intelligent'];
      const foundKeywords = aiKeywords.filter(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      score += Math.min(foundKeywords.length * 3, 15);
      if (foundKeywords.length > 0) {
        signals.push(`Contains AI-related keywords: ${foundKeywords.join(', ')}`);
      } else {
        issues.push('No AI-related content found on website');
      }

      // Modern web technologies
      const modernTech = ['react', 'vue', 'angular', 'javascript', 'api'];
      const foundTech = modernTech.filter(tech => 
        content.toLowerCase().includes(tech.toLowerCase())
      );
      
      if (foundTech.length > 0) {
        score += 5;
        signals.push('Uses modern web technologies');
      }

      // Structured data
      const hasStructuredData = content.includes('application/ld+json') || content.includes('schema.org');
      if (hasStructuredData) {
        score += 5;
        signals.push('Has structured data markup');
      } else {
        issues.push('No structured data found');
      }

      // Meta descriptions and SEO
      const hasMetaDescription = content.includes('<meta name="description"');
      if (hasMetaDescription) {
        score += 5;
        signals.push('Has proper meta descriptions');
      } else {
        issues.push('Missing meta descriptions');
      }

      return {
        score,
        maxScore: 30,
        signals,
        issues,
        foundKeywords
      };

    } catch (error) {
      console.warn(`⚠️  Website analysis failed for ${companyInfo.website}:`, error.message);
      return {
        score: 0,
        maxScore: 30,
        signals: [],
        issues: ['Failed to analyze website - site may be down or blocking automated access'],
        foundKeywords: []
      };
    }
  }

  async generateInsights(companyInfo, auditResults) {
    const insights = [];
    
    if (auditResults.checks.aiKnowledge?.score < 15) {
      insights.push(`AI tools have limited knowledge about ${companyInfo.name}, which could impact AI-powered search and recommendations.`);
    }
    
    if (auditResults.checks.searchVisibility?.score < 20) {
      insights.push(`${companyInfo.name} has low visibility in search results, especially for AI-related queries.`);
    }
    
    if (auditResults.checks.websiteAnalysis?.foundKeywords?.length === 0) {
      insights.push(`Your website doesn't mention AI, automation, or digital transformation - missed opportunity to show AI readiness.`);
    }
    
    if (auditResults.percentage < 30) {
      insights.push(`With a ${auditResults.percentage}% AI visibility score, ${companyInfo.name} is essentially invisible to AI-powered tools and searches.`);
    } else if (auditResults.percentage < 60) {
      insights.push(`At ${auditResults.percentage}% AI visibility, ${companyInfo.name} has room for significant improvement in AI discoverability.`);
    } else {
      insights.push(`${companyInfo.name} has good AI visibility at ${auditResults.percentage}%, but there are still opportunities to optimize.`);
    }
    
    return insights;
  }

  async generateRecommendations(companyInfo, auditResults) {
    const recommendations = [];
    
    if (auditResults.checks.aiKnowledge?.score < 20) {
      recommendations.push('Create high-quality content about your company that AI tools can learn from - press releases, case studies, and thought leadership.');
    }
    
    if (auditResults.checks.searchVisibility?.score < 25) {
      recommendations.push('Optimize your website for search engines with proper SEO, structured data, and consistent business information across the web.');
    }
    
    if (auditResults.checks.websiteAnalysis?.foundKeywords?.length < 3) {
      recommendations.push('Add AI and automation-related content to your website to signal your readiness for digital transformation.');
    }
    
    recommendations.push('Implement schema markup and structured data to help AI tools better understand your business.');
    recommendations.push('Create an AI strategy page or section on your website to demonstrate your forward-thinking approach.');
    
    return recommendations;
  }

  async generatePDFReport(companyInfo, auditResults, assessmentData) {
    console.log(`📄 Generating PDF report for ${companyInfo.name}...`);
    
    const reportDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, `ai-visibility-audit-${companyInfo.name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`);
    
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(fs.createWriteStream(reportPath));

    // Title page
    doc.fontSize(24).font('Helvetica-Bold')
       .text('AI Visibility Audit Report', { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(18).font('Helvetica')
       .text(companyInfo.name, { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
       .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });

    doc.addPage();

    // Executive Summary
    doc.fontSize(18).font('Helvetica-Bold')
       .text('Executive Summary');
    
    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
       .text(`${companyInfo.name} has achieved an AI Visibility Score of ${auditResults.percentage}% out of 100.`);

    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
       .text(`Assessment Score: ${assessmentData.percentage || 'N/A'}% AI Readiness (${assessmentData.grade || 'N/A'} grade)`);

    doc.moveDown();
    
    // Score breakdown
    doc.fontSize(16).font('Helvetica-Bold')
       .text('AI Visibility Analysis');
    
    doc.moveDown();
    Object.entries(auditResults.checks).forEach(([checkName, check]) => {
      const displayName = checkName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`${displayName}: ${check.score}/${check.maxScore}`);
      
      if (check.issues && check.issues.length > 0) {
        check.issues.forEach(issue => {
          doc.fontSize(10).font('Helvetica')
             .text(`• ${issue}`, { indent: 20 });
        });
      }
      
      if (check.signals && check.signals.length > 0) {
        check.signals.forEach(signal => {
          doc.fontSize(10).font('Helvetica')
             .text(`✓ ${signal}`, { indent: 20 });
        });
      }
      
      doc.moveDown();
    });

    // Insights
    if (auditResults.insights.length > 0) {
      doc.fontSize(16).font('Helvetica-Bold')
         .text('Key Insights');
      
      doc.moveDown();
      auditResults.insights.forEach((insight, i) => {
        doc.fontSize(12).font('Helvetica')
           .text(`${i + 1}. ${insight}`);
        doc.moveDown();
      });
    }

    // Recommendations
    if (auditResults.recommendations.length > 0) {
      doc.fontSize(16).font('Helvetica-Bold')
         .text('Recommendations');
      
      doc.moveDown();
      auditResults.recommendations.forEach((rec, i) => {
        doc.fontSize(12).font('Helvetica')
           .text(`${i + 1}. ${rec}`);
        doc.moveDown();
      });
    }

    // CTA
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold')
       .text('Next Steps', { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
       .text('Ready to improve your AI visibility and get found by AI-powered tools?', { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold')
       .text('Book a Free Discovery Call', { align: 'center' });
    
    doc.fontSize(12).font('Helvetica')
       .text('smarterrevolutionai.com/book/discovery', { align: 'center' });

    doc.end();
    
    return reportPath;
  }

  async emailReport(companyInfo, reportPath, auditResults) {
    console.log(`📧 Emailing report to ${companyInfo.contact.email}...`);
    
    const mailOptions = {
      from: process.env.SMTP_USER || 'reports@smarterrevolutionai.com',
      to: companyInfo.contact.email,
      subject: `Your AI Visibility Audit Results - ${auditResults.percentage}% Score`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your AI Visibility Audit is Complete</h2>
          
          <p>Hi ${companyInfo.contact.name},</p>
          
          <p>Your AI Visibility Audit for <strong>${companyInfo.name}</strong> is now ready!</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #dc2626; margin: 0 0 10px 0;">AI Visibility Score: ${auditResults.percentage}%</h3>
            <p style="margin: 0; color: #666;">How visible your company is to AI-powered tools and searches</p>
          </div>
          
          <h4>Key Findings:</h4>
          <ul>
            ${auditResults.insights.map(insight => `<li>${insight}</li>`).join('')}
          </ul>
          
          <p>Your complete audit report is attached, including:</p>
          <ul>
            <li>Detailed score breakdown</li>
            <li>AI tool knowledge assessment</li>
            <li>Search visibility analysis</li>
            <li>Website AI-readiness evaluation</li>
            <li>Personalized recommendations</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://smarterrevolutionai.com/book/discovery" style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Book Your Free Discovery Call</a>
          </div>
          
          <p>Questions about your audit? Reply to this email and we'll help clarify any findings.</p>
          
          <p>Best regards,<br>
          The Smarter Revolution AI Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `AI-Visibility-Audit-${companyInfo.name}.pdf`,
          path: reportPath
        }
      ]
    };

    try {
      await this.mailer.sendMail(mailOptions);
      console.log(`✅ Report emailed to ${companyInfo.contact.email}`);
    } catch (error) {
      console.error('❌ Failed to email report:', error.message);
      // Don't throw - email is best effort
    }
  }

  async updateCRMWithAuditResults(assessmentData, auditResults) {
    console.log(`📝 Updating CRM with audit results...`);
    
    try {
      const activityData = {
        type: 'ai_audit_completed',
        title: `AI Visibility Audit Complete - ${auditResults.percentage}% Score`,
        description: `AI Visibility Audit completed for ${assessmentData.companyName}.\n\nScore: ${auditResults.percentage}%\n\nKey Issues:\n${Object.values(auditResults.checks).map(check => check.issues?.join('\n')).filter(Boolean).join('\n')}\n\nRecommendations:\n${auditResults.recommendations.join('\n')}`,
        contactEmail: assessmentData.email,
        companyName: assessmentData.companyName,
        metadata: {
          aiVisibilityScore: auditResults.percentage,
          assessmentScore: assessmentData.percentage,
          auditChecks: auditResults.checks
        }
      };
      
      const response = await fetch(`${CRM_API}/api/activities`, {
        method: 'POST',
        headers: {
          'x-api-key': CRM_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(activityData)
      });

      if (response.ok) {
        console.log('✅ CRM updated with audit results');
      } else {
        console.warn(`⚠️  CRM update failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️  Failed to update CRM:', error.message);
      // Don't throw - CRM update is best-effort
    }
  }

  extractConfidence(aiResponse) {
    const text = aiResponse.toLowerCase();
    if (text.includes('high')) return 'High';
    if (text.includes('medium')) return 'Medium';
    if (text.includes('low')) return 'Low';
    if (text.includes('none') || text.includes('don\'t know')) return 'None';
    return 'Unknown';
  }

  async start() {
    await this.init();
    
    this.server.listen(PORT, () => {
      console.log(`🌐 AI Visibility Audit Webhook Server running on http://localhost:${PORT}`);
      console.log(`📥 Webhook endpoint: POST http://localhost:${PORT}/webhook/assessment`);
      console.log(`❤️  Health check: GET http://localhost:${PORT}/health`);
      console.log(`📊 Status page: GET http://localhost:${PORT}/`);
    });
  }

  async stop() {
    if (this.browser) {
      await this.browser.close();
    }
    if (this.server) {
      this.server.close();
    }
    console.log('🛑 AI Visibility Audit Webhook Server stopped');
  }
}

// Handle process signals
const webhook = new AIVisibilityAuditWebhook();

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await webhook.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await webhook.stop();
  process.exit(0);
});

// Start the webhook server
if (require.main === module) {
  webhook.start().catch(error => {
    console.error('❌ Failed to start webhook server:', error);
    process.exit(1);
  });
}

module.exports = AIVisibilityAuditWebhook;