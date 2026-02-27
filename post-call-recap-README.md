# Post-Discovery Call Automation Script

Generates professional recap emails and proposal outlines after Wolf completes discovery calls.

## Location
```bash
/opt/smarty-projects/post-call-recap.js
```

## Features
✅ Fetches deal and contact info from CRM  
✅ Looks for existing call prep briefs  
✅ Generates professional recap emails  
✅ Creates detailed proposal outlines  
✅ Saves to organized date-stamped folders  
✅ Handles missing data gracefully  
✅ CLI and module interfaces  

## Usage

### Command Line Interface
```bash
# By deal ID
node post-call-recap.js --deal-id="cml9zk5zr000bkjj40su9h7f0"

# By company name  
node post-call-recap.js --company="Comefri USA"
```

### Module Interface
```javascript
const { PostCallRecapGenerator } = require('./post-call-recap.js');
const generator = new PostCallRecapGenerator();
const result = await generator.generateRecap('deal-id-or-company');
```

## Output Structure
```
/opt/smarty-projects/post-call/
├── company-slug-2026-02-13/
│   ├── recap-email.md
│   └── proposal-outline.md
```

## Generated Content

### Recap Email
- Personalized thank you message
- Summary of discussion points
- Pricing tier recommendation  
- Clear next steps and CTA
- Professional signature

### Proposal Outline
- Executive summary
- Company overview
- Challenges identified
- Proposed solution details
- Implementation timeline
- Investment breakdown

## Pricing Logic
- 1-25 employees → Starter ($2,597/mo)
- 26-100 employees → Growth ($4,997/mo)  
- 101-500 employees → Enterprise ($9,997/mo)
- 500+ employees → Custom ($19,997+/mo)

## CRM Integration
- Authenticates with Smarter CRM automatically
- Fetches deal, contact, and activity data
- Cross-references call prep briefs
- Handles missing data gracefully

## Test Results
✅ Successfully tested with Comefri USA deal  
✅ Successfully tested with Byronpowersports deal  
✅ Module interface working  
✅ File generation working  
✅ Authentication working  

Created: 2026-02-13 by Smarty AI