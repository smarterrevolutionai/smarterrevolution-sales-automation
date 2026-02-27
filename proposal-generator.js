#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { Command } = require('commander');

// Configuration
const BRANDING = {
  colors: {
    red: '#DC2626',
    black: '#000000', 
    gold: '#F59E0B'
  },
  company: 'Smarter Revolution',
  tagline: 'AI doesn\'t replace your team—it gives them superpowers.'
};

const PACKAGES = {
  'Starter': { price: '$2,597/mo', employees: '1-25 employees', features: ['AI-powered automation', 'Basic reporting', 'Email support', 'Starter templates'] },
  'Growth': { price: '$4,997/mo', employees: '26-100 employees', features: ['Everything in Starter', 'Advanced analytics', 'Priority support', 'Custom workflows', 'Team collaboration'] },
  'Enterprise': { price: '$9,997/mo', employees: '101-500 employees', features: ['Everything in Growth', 'Dedicated success manager', 'Custom integrations', 'Advanced security', 'Training & onboarding'] },
  'Custom': { price: '$19,997+/mo', employees: '500+ employees', features: ['Everything in Enterprise', 'White-label options', 'Custom development', '24/7 premium support', 'Executive reporting'] }
};

const CASE_STUDIES = [
  {
    industry: 'Manufacturing',
    company: 'TechCorp Industries',
    challenge: 'Manual inventory management and slow reporting cycles',
    solution: 'Automated inventory tracking with AI-powered demand forecasting',
    results: '73% reduction in inventory costs, 5x faster reporting'
  },
  {
    industry: 'Healthcare',
    company: 'MedFlow Systems',
    challenge: 'Patient data entry consuming 40% of staff time',
    solution: 'AI-assisted patient intake and automated record management',
    results: '60% time savings, 95% accuracy improvement'
  },
  {
    industry: 'Financial Services',
    company: 'Capital Partners',
    challenge: 'Risk assessment taking weeks per client',
    solution: 'AI-powered risk modeling and automated compliance checks',
    results: '90% faster assessments, 45% better risk prediction'
  }
];

function generateHTML(data) {
  const selectedPackage = PACKAGES[data.package];
  const customPrice = data.customPrice || selectedPackage.price;
  
  // Select relevant case study based on pain points or default to first
  let relevantCaseStudy = CASE_STUDIES[0];
  if (data.painPoints.toLowerCase().includes('inventory') || data.painPoints.toLowerCase().includes('manufacturing')) {
    relevantCaseStudy = CASE_STUDIES[0];
  } else if (data.painPoints.toLowerCase().includes('patient') || data.painPoints.toLowerCase().includes('healthcare')) {
    relevantCaseStudy = CASE_STUDIES[1];
  } else if (data.painPoints.toLowerCase().includes('financial') || data.painPoints.toLowerCase().includes('risk')) {
    relevantCaseStudy = CASE_STUDIES[2];
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Proposal for ${data.company}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: ${BRANDING.colors.black};
        }
        
        .page {
            width: 8.5in;
            min-height: 11in;
            margin: 0 auto;
            padding: 1in;
            page-break-after: always;
        }
        
        .cover-page {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            background: linear-gradient(135deg, ${BRANDING.colors.red} 0%, ${BRANDING.colors.black} 100%);
            color: white;
        }
        
        .logo {
            font-size: 48px;
            font-weight: bold;
            margin-bottom: 20px;
            color: ${BRANDING.colors.gold};
        }
        
        .tagline {
            font-size: 18px;
            margin-bottom: 60px;
            font-style: italic;
        }
        
        .proposal-title {
            font-size: 36px;
            margin-bottom: 30px;
            font-weight: bold;
        }
        
        .client-info {
            font-size: 24px;
            margin-bottom: 40px;
        }
        
        .date {
            font-size: 16px;
            opacity: 0.8;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section h2 {
            color: ${BRANDING.colors.red};
            font-size: 24px;
            margin-bottom: 20px;
            border-bottom: 2px solid ${BRANDING.colors.gold};
            padding-bottom: 10px;
        }
        
        .section h3 {
            color: ${BRANDING.colors.black};
            font-size: 18px;
            margin-bottom: 15px;
        }
        
        .pricing-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        .pricing-table th,
        .pricing-table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        .pricing-table th {
            background-color: ${BRANDING.colors.red};
            color: white;
            font-weight: bold;
        }
        
        .pricing-table .highlight {
            background-color: ${BRANDING.colors.gold};
            font-weight: bold;
        }
        
        .timeline {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        
        .timeline-item {
            text-align: center;
            flex: 1;
            padding: 15px;
            margin: 0 10px;
            border: 2px solid ${BRANDING.colors.gold};
            border-radius: 10px;
        }
        
        .timeline-item h4 {
            color: ${BRANDING.colors.red};
            margin-bottom: 10px;
        }
        
        .case-study {
            background-color: #f8f9fa;
            padding: 20px;
            border-left: 4px solid ${BRANDING.colors.gold};
            margin: 20px 0;
        }
        
        .signature-section {
            margin-top: 60px;
            border: 2px solid ${BRANDING.colors.red};
            padding: 30px;
            border-radius: 10px;
        }
        
        .signature-boxes {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
        }
        
        .signature-box {
            width: 45%;
            border-bottom: 2px solid ${BRANDING.colors.black};
            padding-bottom: 10px;
            margin-top: 40px;
        }
        
        .terms {
            font-size: 12px;
            margin-top: 20px;
            line-height: 1.4;
        }
        
        .contact-info {
            background-color: ${BRANDING.colors.red};
            color: white;
            padding: 20px;
            text-align: center;
            margin-top: 40px;
        }
        
        .features-list {
            list-style: none;
            padding-left: 0;
        }
        
        .features-list li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
        }
        
        .features-list li:before {
            content: "✓";
            color: ${BRANDING.colors.gold};
            font-weight: bold;
            position: absolute;
            left: 0;
        }
    </style>
</head>
<body>
    <!-- Cover Page -->
    <div class="page cover-page">
        <div class="logo">${BRANDING.company}</div>
        <div class="tagline">${BRANDING.tagline}</div>
        <div class="proposal-title">PROPOSAL</div>
        <div class="client-info">
            Prepared for<br>
            <strong>${data.company}</strong><br>
            ${data.contact}
        </div>
        <div class="date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>

    <!-- Executive Summary -->
    <div class="page">
        <div class="section">
            <h2>Executive Summary</h2>
            <p>Dear ${data.contact},</p>
            <br>
            <p>Thank you for considering ${BRANDING.company} as your AI transformation partner. Based on our discussions, we understand that ${data.company} is currently facing challenges with <strong>${data.painPoints}</strong>.</p>
            <br>
            <p>Our ${data.package} package is specifically designed to address these pain points by leveraging cutting-edge AI technology to automate processes, enhance productivity, and provide actionable insights.</p>
            <br>
            <p>This proposal outlines our recommended approach to transform your operations, expected outcomes, and investment required to achieve your goals.</p>
        </div>

        <div class="section">
            <h2>Your Current Challenges</h2>
            <p>From our analysis, ${data.company} is experiencing:</p>
            <ul style="margin: 15px 0; padding-left: 30px;">
                ${data.painPoints.split(',').map(point => `<li>${point.trim()}</li>`).join('')}
            </ul>
            <p>These challenges are common in your industry and are exactly what ${BRANDING.company} was built to solve.</p>
        </div>

        <div class="section">
            <h2>Our Solution Approach</h2>
            <h3>Phase 1: Discovery & Planning (Weeks 1-2)</h3>
            <ul style="margin: 10px 0; padding-left: 30px;">
                <li>Comprehensive workflow analysis</li>
                <li>AI opportunity identification</li>
                <li>Custom implementation roadmap</li>
            </ul>

            <h3>Phase 2: Implementation (Weeks 3-8)</h3>
            <ul style="margin: 10px 0; padding-left: 30px;">
                <li>AI system deployment</li>
                <li>Process automation setup</li>
                <li>Team training and onboarding</li>
            </ul>

            <h3>Phase 3: Optimization (Weeks 9-12)</h3>
            <ul style="margin: 10px 0; padding-left: 30px;">
                <li>Performance monitoring</li>
                <li>Continuous improvement</li>
                <li>ROI measurement and reporting</li>
            </ul>
        </div>
    </div>

    <!-- Pricing & Package Details -->
    <div class="page">
        <div class="section">
            <h2>Recommended Package: ${data.package}</h2>
            <table class="pricing-table">
                <tr>
                    <th>Package</th>
                    <th>Price</th>
                    <th>Team Size</th>
                    <th>Key Features</th>
                </tr>
                <tr ${data.package === 'Starter' ? 'class="highlight"' : ''}>
                    <td>Starter</td>
                    <td>${data.package === 'Starter' && data.customPrice ? data.customPrice : PACKAGES['Starter'].price}</td>
                    <td>${PACKAGES['Starter'].employees}</td>
                    <td>${PACKAGES['Starter'].features.slice(0, 2).join(', ')}</td>
                </tr>
                <tr ${data.package === 'Growth' ? 'class="highlight"' : ''}>
                    <td>Growth</td>
                    <td>${data.package === 'Growth' && data.customPrice ? data.customPrice : PACKAGES['Growth'].price}</td>
                    <td>${PACKAGES['Growth'].employees}</td>
                    <td>${PACKAGES['Growth'].features.slice(0, 2).join(', ')}</td>
                </tr>
                <tr ${data.package === 'Enterprise' ? 'class="highlight"' : ''}>
                    <td>Enterprise</td>
                    <td>${data.package === 'Enterprise' && data.customPrice ? data.customPrice : PACKAGES['Enterprise'].price}</td>
                    <td>${PACKAGES['Enterprise'].employees}</td>
                    <td>${PACKAGES['Enterprise'].features.slice(0, 2).join(', ')}</td>
                </tr>
                <tr ${data.package === 'Custom' ? 'class="highlight"' : ''}>
                    <td>Custom</td>
                    <td>${data.package === 'Custom' && data.customPrice ? data.customPrice : PACKAGES['Custom'].price}</td>
                    <td>${PACKAGES['Custom'].employees}</td>
                    <td>${PACKAGES['Custom'].features.slice(0, 2).join(', ')}</td>
                </tr>
            </table>

            <h3>${data.package} Package Features:</h3>
            <ul class="features-list">
                ${selectedPackage.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>
        </div>

        <div class="section">
            <h2>Implementation Timeline</h2>
            <div class="timeline">
                <div class="timeline-item">
                    <h4>Week 1-2</h4>
                    <p>Discovery & Analysis</p>
                </div>
                <div class="timeline-item">
                    <h4>Week 3-6</h4>
                    <p>System Setup</p>
                </div>
                <div class="timeline-item">
                    <h4>Week 7-10</h4>
                    <p>Training & Launch</p>
                </div>
                <div class="timeline-item">
                    <h4>Week 11-12</h4>
                    <p>Optimization</p>
                </div>
            </div>
            <p style="margin-top: 20px;"><strong>Estimated Timeline:</strong> ${data.timeline || '12 weeks from contract signing'}</p>
        </div>
    </div>

    <!-- Case Study -->
    <div class="page">
        <div class="section">
            <h2>Success Story: Similar Challenge Solved</h2>
            <div class="case-study">
                <h3>${relevantCaseStudy.company} - ${relevantCaseStudy.industry}</h3>
                <p><strong>Challenge:</strong> ${relevantCaseStudy.challenge}</p>
                <br>
                <p><strong>Our Solution:</strong> ${relevantCaseStudy.solution}</p>
                <br>
                <p><strong>Results:</strong> ${relevantCaseStudy.results}</p>
            </div>
            <p>Like ${relevantCaseStudy.company}, ${data.company} can expect significant improvements in efficiency, accuracy, and cost savings through our AI-powered solutions.</p>
        </div>

        <div class="section">
            <h2>Expected Outcomes for ${data.company}</h2>
            <ul style="margin: 15px 0; padding-left: 30px;">
                <li><strong>50-70% reduction</strong> in manual processing time</li>
                <li><strong>85%+ improvement</strong> in data accuracy</li>
                <li><strong>3-5x faster</strong> reporting and insights</li>
                <li><strong>25-40% cost savings</strong> through automation</li>
                <li><strong>Real-time visibility</strong> into operations</li>
            </ul>
        </div>

        <div class="section">
            <h2>Why Choose ${BRANDING.company}?</h2>
            <ul style="margin: 15px 0; padding-left: 30px;">
                <li><strong>Proven Track Record:</strong> 200+ successful AI implementations</li>
                <li><strong>Industry Expertise:</strong> Deep understanding of your sector</li>
                <li><strong>Rapid Deployment:</strong> Go live in 12 weeks or less</li>
                <li><strong>Ongoing Support:</strong> 24/7 technical support and optimization</li>
                <li><strong>ROI Guarantee:</strong> Measurable results within 6 months</li>
            </ul>
        </div>
    </div>

    <!-- Terms & Signature -->
    <div class="page">
        <div class="section">
            <h2>Investment & Terms</h2>
            <table class="pricing-table">
                <tr>
                    <th>Item</th>
                    <th>Details</th>
                </tr>
                <tr>
                    <td>Monthly Subscription</td>
                    <td>${customPrice}</td>
                </tr>
                <tr>
                    <td>Setup Fee</td>
                    <td>Included</td>
                </tr>
                <tr>
                    <td>Contract Term</td>
                    <td>12 months minimum</td>
                </tr>
                <tr>
                    <td>Payment Terms</td>
                    <td>Monthly, in advance</td>
                </tr>
            </table>
        </div>

        <div class="section">
            <h2>Terms & Conditions</h2>
            <div class="terms">
                <p><strong>1. Service Commitment:</strong> ${BRANDING.company} will provide the agreed-upon AI solutions and support services as outlined in this proposal.</p>
                <br>
                <p><strong>2. Implementation:</strong> Project timeline begins upon contract signature and initial payment. Client cooperation required for timely delivery.</p>
                <br>
                <p><strong>3. Payment:</strong> Monthly fees are due in advance. Setup and onboarding included in first month's payment.</p>
                <br>
                <p><strong>4. Support:</strong> Ongoing technical support and system optimization included in monthly subscription.</p>
                <br>
                <p><strong>5. Data Security:</strong> All client data handled according to industry-standard security protocols and compliance requirements.</p>
            </div>
        </div>

        <div class="signature-section">
            <h2 style="text-align: center; margin-bottom: 30px;">Agreement</h2>
            <p>By signing below, both parties agree to the terms outlined in this proposal:</p>
            
            <div class="signature-boxes">
                <div class="signature-box">
                    <strong>Client Signature</strong><br>
                    ${data.contact}<br>
                    ${data.company}
                </div>
                <div class="signature-box">
                    <strong>Smarter Revolution</strong><br>
                    Henry Holtzman<br>
                    Founder & CEO
                </div>
            </div>
            
            <p style="text-align: center; margin-top: 20px;">Date: _________________</p>
        </div>

        <div class="contact-info">
            <h3>Ready to Get Started?</h3>
            <p>Contact us today to begin your AI transformation</p>
            <p><strong>Email:</strong> hello@smarterrevolution.com</p>
            <p><strong>Phone:</strong> (555) 123-4567</p>
            <p><strong>Web:</strong> smarterrevolution.com</p>
        </div>
    </div>
</body>
</html>
  `;
}

async function generateProposal(options) {
  console.log('🚀 Generating proposal for', options.company);
  
  const data = {
    company: options.company,
    contact: options.contact,
    email: options.email,
    package: options.package,
    customPrice: options.customPrice,
    painPoints: options.painPoints,
    timeline: options.timeline
  };

  try {
    // Generate HTML content
    const htmlContent = generateHTML(data);
    
    // Launch puppeteer
    console.log('📄 Generating PDF...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `proposal_${options.company.replace(/\s+/g, '_').toLowerCase()}_${timestamp}.pdf`;
    
    await page.pdf({
      path: filename,
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });

    await browser.close();
    
    console.log('✅ PDF generated:', filename);
    
    // Optionally email the proposal
    if (options.email && options.sendEmail) {
      console.log(`📧 Email functionality not implemented yet. Would send to: ${options.email}`);
      // TODO: Implement email sending via nodemailer or similar
    }
    
    return filename;
    
  } catch (error) {
    console.error('❌ Error generating proposal:', error);
    throw error;
  }
}

// CLI Setup
const program = new Command();

program
  .name('proposal-generator')
  .description('Generate branded proposal PDFs for Smarter Revolution')
  .version('1.0.0')
  .requiredOption('-c, --company <name>', 'Company name')
  .requiredOption('-n, --contact <name>', 'Contact person name')
  .requiredOption('-e, --email <email>', 'Contact email address')
  .requiredOption('-p, --package <package>', 'Package type (Starter/Growth/Enterprise/Custom)')
  .option('--custom-price <price>', 'Custom pricing (optional)')
  .requiredOption('--pain-points <points>', 'Specific pain points discussed')
  .option('-t, --timeline <timeline>', 'Project timeline', '12 weeks')
  .option('-s, --send-email', 'Send proposal via email', false)
  .action(async (options) => {
    try {
      // Validate package
      if (!PACKAGES[options.package]) {
        console.error('❌ Invalid package. Must be one of: Starter, Growth, Enterprise, Custom');
        process.exit(1);
      }
      
      const filename = await generateProposal(options);
      console.log(`\n🎉 Proposal generated successfully: ${filename}`);
      
    } catch (error) {
      console.error('❌ Failed to generate proposal:', error.message);
      process.exit(1);
    }
  });

// Handle no arguments
if (process.argv.length === 2) {
  program.help();
}

program.parse();