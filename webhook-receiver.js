#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { handleWarmReply } = require("./warm-reply-handler");

const PORT = 3005;
const WEBHOOK_LOGS_DIR = "/opt/smarty-projects/webhook-logs";
const AUTO_PIPELINE_SCRIPT = "/opt/smarty-projects/auto-pipeline.js";

// Positive sentiment keywords
const POSITIVE_KEYWORDS = [
  "sure", "yes", "interested", "ok", "sounds good", "tell me more",
  "lets talk", "let\x27s talk", "absolutely", "definitely", "perfect", "great",
  "love it", "love this", "when can we start", "how much", "pricing",
  "schedule a call", "book a meeting", "demo"
];

// Negative sentiment keywords — if ANY of these match, it is NOT hot
const NEGATIVE_KEYWORDS = [
  "unsubscribe", "remove me", "not interested", "stop emailing",
  "opt out", "take me off", "do not contact", "no thanks",
  "no thank you", "not for us", "not a fit", "wrong person",
  "please remove", "stop sending", "leave me alone"
];

const SERVER_START_TIME = Date.now();

// Dedup: track recently processed emails to prevent duplicate deals from webhook retries
const RECENT_PROCESSED = new Map(); // email -> timestamp
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isDuplicate(email) {
  const now = Date.now();
  for (const [key, ts] of RECENT_PROCESSED) {
    if (now - ts > DEDUP_WINDOW_MS) RECENT_PROCESSED.delete(key);
  }
  if (RECENT_PROCESSED.has(email)) {
    return true;
  }
  RECENT_PROCESSED.set(email, now);
  return false;
}


function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...(data && { data }) };
  console.log(JSON.stringify(logEntry));
}

// Check sentiment: negative keywords override positive
function classifySentiment(text) {
  if (!text) return "NEUTRAL";
  const lowerText = text.toLowerCase();
  
  // Check negative FIRST — these always win
  const isNegative = NEGATIVE_KEYWORDS.some(kw => lowerText.includes(kw));
  if (isNegative) return "NEGATIVE";
  
  // Then check positive
  const isPositive = POSITIVE_KEYWORDS.some(kw => lowerText.includes(kw));
  if (isPositive) return "HOT";
  
  return "NEUTRAL";
}

function saveToLog(webhookData) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const logFile = path.join(WEBHOOK_LOGS_DIR, "webhook-" + today + ".json");
    const logEntry = { timestamp: new Date().toISOString(), ...webhookData };
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n");
    log("info", "Webhook event saved to daily log", { logFile });
  } catch (error) {
    log("error", "Failed to save webhook to log file", { error: error.message });
  }
}

// Trigger auto-pipeline with CLI args (not stdin) - IMPROVED VERSION
function triggerAutoPipeline(leadData) {
  try {
    if (!fs.existsSync(AUTO_PIPELINE_SCRIPT)) {
      log("warning", "Auto-pipeline script not found", { script: AUTO_PIPELINE_SCRIPT });
      return;
    }

    const fullName = ((leadData.first_name || "") + " " + (leadData.last_name || "")).trim();
    const replySnippet = (leadData.snippet || leadData.text_body || "Warm reply").substring(0, 200);
    
    log("info", "Triggering IMPROVED auto-pipeline for HOT lead", {
      email: leadData.from_email,
      name: fullName,
      company: leadData.company_name,
      campaign: leadData.campaign_name || leadData.camp_id
    });

    const args = [
      AUTO_PIPELINE_SCRIPT,
      "--email=" + leadData.from_email,
      "--name=" + fullName,
      "--company=" + (leadData.company_name || "Unknown"),
      "--reply-text=" + replySnippet
    ];
    
    // Add campaign information - IMPROVEMENT
    if (leadData.campaign_name) args.push("--campaign-name=" + leadData.campaign_name);
    if (leadData.camp_id) args.push("--campaign-id=" + leadData.camp_id);
    if (leadData.phone_number) args.push("--phone=" + leadData.phone_number);
    if (leadData.job_title) args.push("--title=" + leadData.job_title);

    const child = spawn("node", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: "/opt/smarty-projects"
    });

    child.stdout.on("data", (data) => {
      log("info", "Auto-pipeline output", { output: data.toString().trim() });
    });
    child.stderr.on("data", (data) => {
      log("error", "Auto-pipeline error", { error: data.toString().trim() });
    });
    child.on("close", (code) => {
      log("info", "Auto-pipeline completed", { exitCode: code });
    });
  } catch (error) {
    log("error", "Failed to trigger auto-pipeline", { error: error.message });
  }
}

// Trigger the full CRM automation via warm-reply-handler
async function triggerWarmReplyHandler(webhookData) {
  try {
    const firstName = webhookData.first_name || "";
    const lastName = webhookData.last_name || "";
    const email = webhookData.from_email || "";
    const company = webhookData.company_name || "";
    const replyContent = webhookData.text_body || webhookData.snippet || "";
    const campaignId = webhookData.campaign_id || webhookData.campaign_name || "";

    if (!email) {
      log("warning", "Skipping warm-reply-handler: no email in webhook");
      return;
    }

    log("info", "🚀 Triggering warm-reply-handler for HOT lead", { email, firstName, company });

    const lead = {
      email,
      firstName,
      lastName,
      company,
      replyContent,
      campaignId,
      messageId: webhookData.message_id || null,
      replyToMessageId: webhookData.reply_to || webhookData.references || null,
      references: webhookData.references || null,
      sourceThreadId: webhookData.source_thread_id || null,
      sourceSubject: webhookData.subject || null,
    };
    const summary = await handleWarmReply(lead);

    log("info", "✅ Warm-reply-handler completed", {
      contactId: summary.contactId,
      success: summary.success,
      steps: summary.steps,
      errors: summary.errors,
      elapsed_ms: summary.elapsed_ms
    });
  } catch (error) {
    log("error", "Warm-reply-handler threw an error", { error: error.message });
  }
}


// Only truly required: event type, who replied, and what they said
function validateWebhookPayload(data) {
  const requiredFields = ["webhook_event", "from_email", "first_name", "last_name"];
  const missingFields = requiredFields.filter(field => !data[field]);
  if (missingFields.length > 0) return { valid: false, missing: missingFields };
  // Need at least snippet OR text_body
  if (!data.snippet && !data.text_body) {
    return { valid: false, missing: ["snippet or text_body"] };
  }
  return { valid: true };
}

function handleWebhook(req, res) {
  let body = "";
  req.on("data", chunk => { body += chunk.toString(); });
  req.on("end", () => {
    try {
      const webhookData = JSON.parse(body);
      const validation = validateWebhookPayload(webhookData);
      if (!validation.valid) {
        log("warning", "Invalid webhook payload - missing fields", {
          missing: validation.missing,
          received: Object.keys(webhookData)
        });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid payload", missing_fields: validation.missing }));
        return;
      }

      log("info", "Received PlusVibe webhook", {
        event_type: webhookData.webhook_event,
        lead_email: webhookData.from_email,
        lead_name: webhookData.first_name + " " + webhookData.last_name,
        company: webhookData.company_name || "N/A",
        campaign: webhookData.campaign_name || "N/A",
        snippet: (webhookData.snippet || "").substring(0, 100)
      });

      const replyText = webhookData.text_body || webhookData.snippet || "";
      const sentiment = classifySentiment(replyText);

      if (sentiment === "HOT") {
        if (isDuplicate(webhookData.from_email)) {
          log("info", "⏭️ Duplicate webhook for same email within 10min window — skipping", {
            email: webhookData.from_email
          });
          saveToLog({ ...webhookData, sentiment, skipped: "duplicate", processed_at: new Date().toISOString() });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "success", message: "Duplicate skipped", sentiment }));
          return;
        }
        log("info", "🔥 HOT LEAD DETECTED", {
          email: webhookData.from_email,
          company: webhookData.company_name,
          snippet: webhookData.snippet,
          campaign: webhookData.campaign_name
        });
        // IMPROVED pipeline trigger (includes campaign data)
        triggerAutoPipeline(webhookData);
        // Full CRM automation: contact, deal, activity, Gmail draft, SMS
        triggerWarmReplyHandler(webhookData);
      } else if (sentiment === "NEGATIVE") {
        log("info", "❌ Negative reply — no action taken", {
          email: webhookData.from_email,
          company: webhookData.company_name,
          snippet: webhookData.snippet
        });
      } else {
        log("info", "➖ Neutral reply — logged only", {
          email: webhookData.from_email,
          company: webhookData.company_name,
          snippet: webhookData.snippet
        });
      }

      saveToLog({ ...webhookData, sentiment, processed_at: new Date().toISOString() });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", message: "Webhook processed", sentiment }));
    } catch (error) {
      log("error", "Failed to process webhook", { error: error.message });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
}

function handleHealth(req, res) {
  const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", uptime, timestamp: new Date().toISOString(), version: "1.2.0" }));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  log("info", "Incoming request", { method: req.method, url: req.url });

  if (req.method === "POST" && req.url === "/webhook/plusvibe") {
    handleWebhook(req, res);
  } else if (req.method === "GET" && req.url === "/webhook/health") {
    handleHealth(req, res);
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

function startServer(port) {
  server.listen(port, "0.0.0.0", () => {
    log("info", "🚀 PlusVibe webhook receiver IMPROVED started", { port, pid: process.pid });
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE" && port === 3005) {
      log("warning", "Port 3005 in use, trying 3006");
      startServer(3006);
    } else {
      log("error", "Failed to start server", { error: err.message });
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });

if (!fs.existsSync(WEBHOOK_LOGS_DIR)) fs.mkdirSync(WEBHOOK_LOGS_DIR, { recursive: true });
startServer(PORT);