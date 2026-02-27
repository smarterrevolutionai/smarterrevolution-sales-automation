# Auto AI Visibility Audit Script

## Quick Start

```bash
# CLI Usage
node auto-audit.js --url="https://company-website.com" --company="Company Name"

# Module Usage
const { runAudit } = require("./auto-audit.js");
const result = await runAudit("https://example.com", "Company Name");
```

## What It Analyzes

- ✅ Chatbot presence (Intercom, Drift, Zendesk, etc.)
- ✅ Knowledge base/FAQ sections
- ✅ Website load performance
- ✅ Blog/content sections
- ✅ Video content (YouTube, Vimeo)
- ✅ Forms and lead capture
- ✅ Scheduling/booking tools
- ✅ Mobile responsiveness
- ✅ Social media links
- ✅ E-commerce functionality

## Output

Returns JSON with:
- `findings[]` - 3-5 specific AI opportunities
- `summary` - Overview paragraph
- `emailSnippet` - Short version for email replies
- `htmlSnippet` - Formatted version for email body
- `signals{}` - Raw detection results
- `loadTimeMs` - Performance metric

## Example Output

Successfully analyzed samhirota.com with 3 findings:
1. Customer Support - No AI chatbot detected
2. Content Strategy - No blog section found  
3. E-commerce Intelligence - Could optimize product recommendations

## Error Handling

Gracefully handles:
- Unreachable websites (403, 404, timeouts)
- Slow loading sites (10 second timeout)
- Malformed URLs
- Network issues

Returns partial audit with helpful error messages for follow-up.
