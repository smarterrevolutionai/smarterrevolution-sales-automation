#!/usr/bin/env node
/**
 * Lead Quality Scorer
 * Scores and filters leads for Smarter Revolution campaigns
 * Usage: node lead-scorer.js --input=leads.csv --output=scored.csv [--min-score=60]
 */

const fs = require('fs');
const path = require('path');

// Command line argument parsing
function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.split('=');
            args[key.substring(2)] = value;
        }
    });
    return args;
}

// CSV Parser - handles quoted fields and commas within quotes
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const row = parseCSVLine(lines[i]);
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            data.push(obj);
        }
    }
    
    return { headers, data };
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

// Convert back to CSV format
function toCSV(headers, data) {
    const escapeCSV = (value) => {
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    };
    
    const lines = [headers.map(escapeCSV).join(',')];
    data.forEach(row => {
        lines.push(headers.map(header => escapeCSV(row[header] || '')).join(','));
    });
    
    return lines.join('\n');
}

// Scoring functions
function scoreCompanySize(employees) {
    if (!employees || employees === '') return 0;
    
    const empCount = parseInt(employees);
    if (isNaN(empCount)) return 0;
    
    if (empCount >= 50 && empCount <= 500) return 20;    // Sweet spot
    if (empCount >= 25 && empCount <= 49) return 15;
    if (empCount >= 501 && empCount <= 1000) return 12;
    if (empCount >= 10 && empCount <= 24) return 8;
    if (empCount > 1000) return 5;
    
    return 0; // 1-9 employees or unknown
}

function scoreTitle(title) {
    if (!title || title === '') return 5;
    
    const titleLower = title.toLowerCase();
    
    // C-suite
    if (titleLower.includes('ceo') || titleLower.includes('cto') || 
        titleLower.includes('coo') || titleLower.includes('cfo') || 
        titleLower.includes('cmo') || titleLower.includes('chief')) {
        return 20;
    }
    
    // VP
    if (titleLower.includes('vp') || titleLower.includes('vice president')) {
        return 18;
    }
    
    // Director
    if (titleLower.includes('director')) {
        return 15;
    }
    
    // Manager
    if (titleLower.includes('manager')) {
        return 10;
    }
    
    return 5; // Other
}

function scoreIndustry(industry) {
    if (!industry || industry === '') return 0;
    
    const industryLower = industry.toLowerCase();
    
    // High-fit industries (15 pts)
    const highFit = ['manufacturing', 'professional services', 'healthcare', 
                     'construction', 'financial services', 'real estate', 'logistics'];
    
    // Medium-fit industries (10 pts)
    const mediumFit = ['retail', 'education', 'technology', 'legal'];
    
    // Low-fit industries (5 pts)
    const lowFit = ['government', 'non-profit'];
    
    for (const fit of highFit) {
        if (industryLower.includes(fit)) return 15;
    }
    
    for (const fit of mediumFit) {
        if (industryLower.includes(fit)) return 10;
    }
    
    for (const fit of lowFit) {
        if (industryLower.includes(fit)) return 5;
    }
    
    return 5; // Default for unmatched industries
}

function scoreEmailQuality(email) {
    if (!email || email === '') return 0;
    
    let score = 0;
    const emailLower = email.toLowerCase();
    
    // Check for custom domain (not common webmail providers)
    const commonProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    const domain = email.split('@')[1];
    
    if (domain && !commonProviders.includes(domain.toLowerCase())) {
        score += 10;
    }
    
    // Check for non-role-based email
    const roleEmails = ['info@', 'sales@', 'admin@', 'support@'];
    const isRoleEmail = roleEmails.some(role => emailLower.startsWith(role));
    
    if (!isRoleEmail) {
        score += 5;
    }
    
    return score;
}

function scoreWebsite(website) {
    return (website && website.trim() !== '') ? 10 : 0;
}

function scoreLocation(country) {
    if (!country || country === '') return 2;
    
    const countryLower = country.toLowerCase();
    
    if (countryLower.includes('us') || countryLower.includes('united states') || 
        countryLower.includes('usa') || countryLower.includes('america')) {
        return 10;
    }
    
    if (countryLower.includes('canada') || countryLower.includes('uk') || 
        countryLower.includes('united kingdom') || countryLower.includes('australia')) {
        return 7;
    }
    
    // Other English-speaking countries
    if (countryLower.includes('ireland') || countryLower.includes('new zealand') ||
        countryLower.includes('south africa')) {
        return 5;
    }
    
    return 2; // Other countries
}

function scoreDataCompleteness(lead) {
    let score = 0;
    
    if (lead.phone && lead.phone.trim() !== '') score += 3;
    if (lead.title && lead.title.trim() !== '') score += 3;
    if (lead.company && lead.company.trim() !== '') score += 2;
    if ((lead.city && lead.city.trim() !== '') || 
        (lead.state && lead.state.trim() !== '') || 
        (lead.country && lead.country.trim() !== '')) {
        score += 2;
    }
    
    return score;
}

function getTier(score) {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'D';
}

function scoreLead(lead) {
    const scores = {
        companySize: scoreCompanySize(lead.employees),
        title: scoreTitle(lead.title),
        industry: scoreIndustry(lead.industry),
        emailQuality: scoreEmailQuality(lead.email),
        website: scoreWebsite(lead.website),
        location: scoreLocation(lead.country),
        dataCompleteness: scoreDataCompleteness(lead)
    };
    
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    const scoreBreakdown = `CS:${scores.companySize}|T:${scores.title}|I:${scores.industry}|E:${scores.emailQuality}|W:${scores.website}|L:${scores.location}|D:${scores.dataCompleteness}`;
    
    return {
        icpScore: totalScore,
        scoreBreakdown: scoreBreakdown,
        tier: getTier(totalScore)
    };
}

// Main execution
function main() {
    const args = parseArgs();
    
    if (!args.input || !args.output) {
        console.log('Usage: node lead-scorer.js --input=leads.csv --output=scored.csv [--min-score=60]');
        process.exit(1);
    }
    
    // Read input CSV
    if (!fs.existsSync(args.input)) {
        console.error(`Input file not found: ${args.input}`);
        process.exit(1);
    }
    
    const csvText = fs.readFileSync(args.input, 'utf8');
    const { headers, data } = parseCSV(csvText);
    
    console.log(`Processing ${data.length} leads...`);
    
    // Score all leads
    const scoredLeads = data.map(lead => {
        const scores = scoreLead(lead);
        return { ...lead, ...scores };
    });
    
    // Filter by min score if specified
    const minScore = args['min-score'] ? parseInt(args['min-score']) : 0;
    const filteredLeads = scoredLeads.filter(lead => lead.icpScore >= minScore);
    
    // Add new headers
    const outputHeaders = [...headers, 'icpScore', 'scoreBreakdown', 'tier'];
    
    // Generate output CSV
    const outputCSV = toCSV(outputHeaders, filteredLeads);
    fs.writeFileSync(args.output, outputCSV);
    
    // Generate summary stats
    const totalLeads = data.length;
    const processedLeads = filteredLeads.length;
    
    const tierCounts = { A: 0, B: 0, C: 0, D: 0 };
    let totalScore = 0;
    
    scoredLeads.forEach(lead => {
        tierCounts[lead.tier]++;
        totalScore += lead.icpScore;
    });
    
    const avgScore = totalScore / scoredLeads.length;
    
    // Top 10 leads
    const top10 = [...scoredLeads]
        .sort((a, b) => b.icpScore - a.icpScore)
        .slice(0, 10);
    
    // Print summary
    console.log('\n=== LEAD SCORING SUMMARY ===');
    console.log(`Total leads processed: ${totalLeads}`);
    console.log(`Leads in output (min score ${minScore}): ${processedLeads}`);
    console.log(`Average score: ${avgScore.toFixed(1)}`);
    console.log('\nTier Distribution:');
    console.log(`  A-tier (80+): ${tierCounts.A}`);
    console.log(`  B-tier (60-79): ${tierCounts.B}`);
    console.log(`  C-tier (40-59): ${tierCounts.C}`);
    console.log(`  D-tier (<40): ${tierCounts.D}`);
    
    console.log('\nTop 10 leads by score:');
    top10.forEach((lead, i) => {
        console.log(`  ${i+1}. ${lead.firstName} ${lead.lastName} (${lead.company}) - Score: ${lead.icpScore} (${lead.tier})`);
    });
    
    console.log(`\nOutput written to: ${args.output}`);
}

if (require.main === module) {
    main();
}

module.exports = { scoreLead, parseCSV, toCSV };