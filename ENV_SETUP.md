# Environment Variables Setup

This repository requires the following environment variables to be set:

## API Keys & Credentials

```bash
# PlusVibe Cold Email Platform
PLUSVIBE_API_KEY=your_plusvibe_api_key_here

# Twilio SMS/Phone Services  
TWILIO_SID=your_twilio_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here

# CRM Integration
CRM_API_KEY=your_crm_api_key_here

# Command Center Integration
COMMAND_CENTER_API_KEY=your_command_center_api_key_here

# Email Verification (Reoon)
REOON_API_KEY=your_reoon_api_key_here

# Web Scraping (Firecrawl)
FIRECRAWL_API_KEY=your_firecrawl_api_key_here

# AI Models (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## Setup Instructions

1. Copy `.env.example` to `.env`
2. Fill in your actual API keys and credentials
3. Never commit `.env` files to version control
4. For production deployment, set these environment variables in your hosting platform

## Security Note

All API keys and secrets have been removed from this repository and replaced with environment variable references for security compliance.