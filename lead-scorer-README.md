# Lead Quality Scorer

**Location:** `/opt/smarty-projects/lead-scorer.js`

## Overview
Scores and filters leads for Smarter Revolution campaigns based on multiple quality signals. Takes a CSV of leads and outputs a scored CSV with summary statistics.

## Usage

### Basic scoring (all leads):
```bash
node lead-scorer.js --input=leads.csv --output=scored.csv
```

### Filtered scoring (only leads above threshold):
```bash
node lead-scorer.js --input=leads.csv --output=filtered.csv --min-score=60
```

## Input CSV Format
Required columns: `email, firstName, lastName, company, title, phone, website, industry, employees, city, state, country, linkedin`

## Scoring Criteria (Max 100 points)

1. **Company Size (0-20 pts):**
   - 50-500 employees = 20 (sweet spot)
   - 25-49 = 15
   - 501-1000 = 12
   - 10-24 = 8
   - 1000+ = 5
   - Unknown/1-9 = 0

2. **Title/Role (0-20 pts):**
   - C-suite (CEO, CTO, COO, CFO, CMO) = 20
   - VP = 18
   - Director = 15
   - Manager = 10
   - Other = 5

3. **Industry Fit (0-15 pts):**
   - High-fit: Manufacturing, Professional Services, Healthcare, Construction, Financial Services, Real Estate, Logistics = 15
   - Medium-fit: Retail, Education, Technology, Legal = 10
   - Low-fit: Government, Non-profit = 5

4. **Email Quality (0-15 pts):**
   - Custom domain (not gmail/yahoo/hotmail/outlook) = 10
   - Not role-based email (not info@, sales@, admin@, support@) = 5

5. **Website Present (0-10 pts):**
   - Has website = 10
   - No website = 0

6. **Location (0-10 pts):**
   - US = 10
   - Canada/UK/Australia = 7
   - Other English-speaking = 5
   - Other = 2

7. **Data Completeness (0-10 pts):**
   - Has phone = 3
   - Has title = 3
   - Has company name = 2
   - Has location = 2

## Output
- **icpScore:** Total quality score (0-100)
- **scoreBreakdown:** Detailed breakdown (e.g., "CS:20|T:20|I:15|E:15|W:10|L:10|D:10")
- **tier:** Letter grade (A=80+, B=60-79, C=40-59, D=below 40)
- **Summary:** Console output with tier distribution, average score, and top 10 leads

## Test Results
Tested with 10 sample leads:
- Average score: 80.9
- 6 A-tier leads (80+)
- 3 B-tier leads (60-79)
- 1 C-tier lead (40-59)
- 0 D-tier leads (<40)

Perfect lead (John Doe) scored 100 points with optimal company size (150 employees), C-suite title (CEO), high-fit industry (Manufacturing), custom domain email, website, US location, and complete data.

## Files
- Script: `/opt/smarty-projects/lead-scorer.js`
- Test data: `/opt/smarty-projects/test-leads.csv`
- Test output: `~/scored-test.csv`, `~/filtered-test.csv`