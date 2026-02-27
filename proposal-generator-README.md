# Proposal Generator

Professional proposal generator for Smarter Revolution that creates branded PDF proposals from deal details.

## Features

- **Professional PDF Generation**: Multi-page proposals with Smarter Revolution branding
- **Dynamic Content**: Personalized based on company details and pain points
- **Multiple Packages**: Support for Starter, Growth, Enterprise, and Custom packages
- **Smart Case Studies**: Automatically selects relevant case studies based on pain points
- **CLI Interface**: Easy command-line operation

## Installation

The proposal generator is deployed on the VPS at `/opt/smarty-projects/proposal-generator.js`.

Dependencies:
- Node.js 16+
- puppeteer (for PDF generation)
- commander (for CLI interface)

## Usage

```bash
node proposal-generator.js [options]
```

### Required Parameters

- `--company <name>` - Company name
- `--contact <name>` - Contact person name
- `--email <email>` - Contact email address
- `--package <package>` - Package type (Starter/Growth/Enterprise/Custom)
- `--pain-points <points>` - Specific pain points discussed

### Optional Parameters

- `--custom-price <price>` - Custom pricing (overrides package default)
- `--timeline <timeline>` - Project timeline (default: "12 weeks")
- `--send-email` - Send proposal via email (not yet implemented)

## Examples

### Growth Package
```bash
node proposal-generator.js \
  --company="Acme Corp" \
  --contact="John Smith" \
  --email="john@acme.com" \
  --package="Growth" \
  --pain-points="Manual data entry, slow reporting"
```

### Enterprise with Custom Pricing
```bash
node proposal-generator.js \
  --company="TechCorp Manufacturing" \
  --contact="Sarah Johnson" \
  --email="sarah@techcorp.com" \
  --package="Enterprise" \
  --pain-points="Inventory management chaos, manual reporting taking 2 days" \
  --timeline="8 weeks" \
  --custom-price="$8,500/mo"
```

### Custom Package
```bash
node proposal-generator.js \
  --company="MegaCorp Financial" \
  --contact="Robert Chen" \
  --email="robert@megacorp.com" \
  --package="Custom" \
  --pain-points="Risk assessment bottlenecks, compliance reporting delays" \
  --timeline="16 weeks" \
  --custom-price="$25,000/mo"
```

## Generated Proposal Sections

1. **Cover Page** - Branded cover with company logo and tagline
2. **Executive Summary** - Personalized based on pain points
3. **Current Challenges** - Analysis of their specific issues
4. **Solution Approach** - 3-phase implementation plan
5. **Pricing & Package Details** - Comprehensive pricing table
6. **Implementation Timeline** - Visual timeline with milestones
7. **Case Study** - Relevant success story based on pain points
8. **Expected Outcomes** - Specific benefits and ROI projections
9. **Terms & Signature** - Contract terms and signature section

## Branding

- **Colors**: Red (#DC2626), Black (#000000), Gold (#F59E0B)
- **Company**: Smarter Revolution
- **Tagline**: "AI doesn't replace your team—it gives them superpowers."

## Package Pricing

| Package | Price | Team Size | Key Features |
|---------|-------|-----------|--------------|
| Starter | $2,597/mo | 1-25 employees | AI automation, Basic reporting |
| Growth | $4,997/mo | 26-100 employees | Advanced analytics, Priority support |
| Enterprise | $9,997/mo | 101-500 employees | Dedicated manager, Custom integrations |
| Custom | $19,997+/mo | 500+ employees | White-label, Custom development |

## Case Studies

The system automatically selects relevant case studies based on pain points mentioned:

- **Manufacturing/Inventory**: TechCorp Industries case study
- **Healthcare/Patient**: MedFlow Systems case study
- **Financial/Risk**: Capital Partners case study

## Output

- PDF files are saved as: `proposal_[company_name]_[date].pdf`
- Files are approximately 60KB each
- Professional multi-page layout with consistent branding

## Deployment

Located at: `/opt/smarty-projects/proposal-generator.js` on VPS (72.62.252.232)

To update:
```bash
scp -i ~/.ssh/id_ed25519_vps -P 2222 proposal-generator.js smarty@72.62.252.232:/opt/smarty-projects/
```

## Future Enhancements

- Email integration for automatic sending
- Additional case studies
- Custom branding options
- Integration with CRM system
- Digital signature workflow