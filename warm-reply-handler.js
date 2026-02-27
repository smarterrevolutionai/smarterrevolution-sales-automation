#!/usr/bin/env node
/**
 * warm-reply-handler.js
 * Called when PlusVibe detects a warm/positive reply.
 * Flow: Create CRM Contact → Create Deal → Log Activity → Draft Henry reply → SMS Wolf + Mark
 */

const https = require('https')
const http = require('http')

const CRM_BASE = 'http://localhost:3000'
const CRM_KEY = 'process.env.CRM_API_KEY'
const TWILIO_SID = 'process.env.TWILIO_SID'
const TWILIO_TOKEN = 'process.env.TWILIO_AUTH_TOKEN'
const TWILIO_FROM = '+18446620687'
const WOLF_PHONE = '+12133028260'
const MARK_PHONE = '+13107405587'
const CALENDLY_URL = 'https://smarterrevolutionai.com/book'

function request(method, urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http
    const data = body ? JSON.stringify(body) : null

    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }

    const req = lib.request(opts, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function crmPost(path, body) {
  return request('POST', `${CRM_BASE}${path}`, body, { 'x-api-key': CRM_KEY })
}

function crmGet(path) {
  return request('GET', `${CRM_BASE}${path}`, null, { 'x-api-key': CRM_KEY })
}

async function sendSms(to, message) {
  const body = new URLSearchParams({
    From: TWILIO_FROM,
    To: to,
    Body: message,
  }).toString()

  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body)
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, data: d }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function handleWarmReply({ email, firstName, lastName, company, replyContent, campaignId, messageId, replyToMessageId, references, sourceThreadId, sourceSubject }) {
  const results = {}
  console.log(`\n🔥 Warm reply handler: ${firstName} ${lastName} <${email}> @ ${company}`)

  // 1. Create/update CRM contact
  try {
    const res = await crmPost('/api/contacts', {
      email,
      firstName,
      lastName,
      company,
      status: 'engaged',
      source: 'cold_outreach',
    })
    results.contact = { status: res.status, id: res.data?.id || res.data?.data?.id }
    console.log(`✅ Contact created/updated: ${results.contact.id} (HTTP ${res.status})`)
  } catch (e) {
    results.contact = { error: e.message }
    console.log(`❌ Contact failed: ${e.message}`)
  }

  const contactId = results.contact?.id

  // 2. Find Discovery stage
  let discoveryStageId = null
  try {
    const stagesRes = await crmGet('/api/pipeline/stages')
    const stages = stagesRes.data?.data || stagesRes.data || []
    const discovery = stages.find(s =>
      s.name?.toLowerCase().includes('discovery') ||
      s.name?.toLowerCase().includes('lead')
    )
    discoveryStageId = discovery?.id
    console.log(`📋 Discovery stage: ${discoveryStageId} (${discovery?.name})`)
  } catch (e) {
    console.log(`⚠️  Could not fetch stages: ${e.message}`)
  }

  // 3. Create Deal
  if (contactId) {
    try {
      const dealBody = {
        name: `${firstName} ${lastName}${company ? ' - ' + company : ''} Discovery`,
        contactId,
        value: 0,
        ...(discoveryStageId ? { stageId: discoveryStageId } : {}),
      }
      const res = await crmPost('/api/deals', dealBody)
      results.deal = { status: res.status, id: res.data?.id || res.data?.data?.id }
      console.log(`✅ Deal created: ${results.deal.id} (HTTP ${res.status})`)
    } catch (e) {
      results.deal = { error: e.message }
      console.log(`❌ Deal failed: ${e.message}`)
    }
  }

  // 4. Log activity
  if (contactId) {
    try {
      const res = await crmPost('/api/activities/log', {
        contactId,
        type: 'email',
        direction: 'inbound',
        subject: 'Warm reply via cold email campaign',
        body: replyContent || '(no content captured)',
        ...(results.deal?.id ? { dealId: results.deal.id } : {}),
      })
      results.activity = { status: res.status }
      console.log(`✅ Activity logged (HTTP ${res.status})`)
    } catch (e) {
      results.activity = { error: e.message }
      console.log(`❌ Activity failed: ${e.message}`)
    }
  }

  // 5. Check prospect status BEFORE creating draft
  let skipDraft = false
  try {
    const statusRes = await request('GET', `${CRM_BASE}/api/prospects/status?email=${encodeURIComponent(email)}`, null, { 'x-service-key': 'sr-deliverables-2026-k8x9m2' })
    if (statusRes.status === 200) {
      const statusData = (typeof statusRes.data === 'object' && statusRes.data) ? statusRes.data : {}
      if (statusData.hasPendingDraft) {
        skipDraft = true
        console.log(`⏭️ Draft already exists for ${email} — skipping`)
        results.draft = { skipped: true, reason: 'draft_already_exists' }
      } else if (statusData.hasMeetingBooked) {
        skipDraft = true
        console.log(`⏭️ Meeting already booked with ${email} — skipping draft`)
        results.draft = { skipped: true, reason: 'meeting_booked' }
      }
    }
  } catch (e) {
    console.log(`⚠️ Could not check prospect status: ${e.message} — proceeding with draft`)
  }

  // 5b. Draft Gmail reply from Henry (only if not already contacted)
  if (!skipDraft) try {
    const emailBody = `Hi ${firstName},

Thanks for getting back to me. I'd love to learn more about what you're working on and see if there's a fit.

Our team helps companies like ${company || 'yours'} use AI to streamline operations and free up your team for higher-value work. The results we've seen have been pretty compelling.

Would you be open to a quick 20-minute call? You can grab time directly here: ${CALENDLY_URL}

Looking forward to connecting.

Best,
Henry Alouf
Smarter Revolution`

    const contextBlock = (replyContent || '') .trim()
    const composedContent = contextBlock
      ? `${emailBody}

---
Previous thread context (from PlusVibe):
${contextBlock}`
      : emailBody

    const threadMessageId = messageId || replyToMessageId || null
    const draftReferences = [references, messageId].filter(Boolean).join(' ').trim() || null
    const normalizedSubject = sourceSubject ? (sourceSubject.startsWith('Re:') ? sourceSubject : ('Re: ' + sourceSubject)) : ('Re: AI for ' + (company || 'your team'))
    const draftPayload = {
      to: email,
      subject: normalizedSubject,
      content: composedContent,
      ...(threadMessageId ? { replyToMessageId: threadMessageId } : {}),
      ...(draftReferences ? { references: draftReferences } : {}),
      ...(sourceThreadId ? { threadId: sourceThreadId } : {}),
    }

    const draftRes = await request('POST', CRM_BASE + '/api/gmail/draft', draftPayload, { 'x-service-key': 'sr-deliverables-2026-k8x9m2' })
    results.draft = { status: draftRes.status }
    console.log(`✅ Gmail draft created (HTTP ${draftRes.status})`)
  } catch (e) {
    results.draft = { error: e.message }
    console.log(`❌ Draft failed: ${e.message}`)
  }

  // 6. SMS Wolf and Mark
  const smsText = `🔥 Warm reply from ${firstName} ${lastName}${company ? ' at ' + company : ''}!\n\nCheck PlusVibe Unibox — Henry draft ready to review.\nCRM deal created.\n\nBook: ${CALENDLY_URL}`

  try {
    const [wolfSms, markSms] = await Promise.all([
      sendSms(WOLF_PHONE, smsText),
      sendSms(MARK_PHONE, smsText),
    ])
    results.sms = {
      wolf: wolfSms.status,
      mark: markSms.status,
    }
    console.log(`✅ SMS sent — Wolf: ${wolfSms.status}, Mark: ${markSms.status}`)
  } catch (e) {
    results.sms = { error: e.message }
    console.log(`❌ SMS failed: ${e.message}`)
  }

  console.log('\n📊 Summary:', JSON.stringify(results, null, 2))
  return results
}

// CLI test mode
if (require.main === module) {
  const testLead = {
    email: process.argv[2] || 'test@example.com',
    firstName: process.argv[3] || 'Test',
    lastName: process.argv[4] || 'User',
    company: process.argv[5] || 'Acme Corp',
    replyContent: 'This looks interesting, tell me more.',
    campaignId: 'test',
  }
  console.log('Running warm reply handler in test mode...')
  handleWarmReply(testLead)
    .then(r => { console.log('\n✅ Done'); process.exit(0) })
    .catch(e => { console.error('Fatal:', e); process.exit(1) })
}

module.exports = { handleWarmReply }
