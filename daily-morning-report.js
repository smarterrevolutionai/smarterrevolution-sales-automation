#!/usr/bin/env node

// Daily Morning Report for Smarter Revolution
// Pulls PlusVibe campaign stats, warm leads, and system health

const PLUSVIBE_API_KEY = "process.env.PLUSVIBE_API_KEY";
const WORKSPACE_ID = "692307182213832a0e2cf618";
const BASE_URL = "https://api.plusvibe.ai/api/v1";

async function safeFetch(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return response;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

async function getCampaignStats() {
    try {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        const url = `${BASE_URL}/analytics/campaign/stats?workspace_id=${WORKSPACE_ID}&start_date=${yesterday}&end_date=${today}`;
        const response = await safeFetch(url, { headers: { "x-api-key": PLUSVIBE_API_KEY } });
        const data = await response.json();

        // API returns an array of campaign objects
        let totalSent = 0, totalBounced = 0, totalReplied = 0, totalPositive = 0;
        if (Array.isArray(data)) {
            for (const c of data) {
                totalSent += c.sent_count || 0;
                totalBounced += c.bounced_count || 0;
                totalReplied += c.replied_count || 0;
                totalPositive += c.positive_reply_count || 0;
            }
        }
        const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : "0.0";
        return { sent: totalSent, bounced: totalBounced, bounceRate, replied: totalReplied, positive: totalPositive, ok: true };
    } catch (error) {
        return { sent: "Error", bounced: "Error", bounceRate: "Error", replied: "Error", positive: "Error", ok: false };
    }
}

async function getWarmLeads() {
    try {
        const url = `${BASE_URL}/unibox/emails?workspace_id=${WORKSPACE_ID}&label=INTERESTED`;
        const response = await safeFetch(url, { headers: { "x-api-key": PLUSVIBE_API_KEY } });
        const data = await response.json();
        
        // API returns { data: [...] }
        const items = Array.isArray(data) ? data : (data.data || []);
        const leads = items
            .filter(e => e.direction === "IN" && e.from_address_email !== "mark@smarterrevolution.com")
            .map(e => ({
                email: e.from_address_email || e.lead || "?",
                subject: (e.subject || "").substring(0, 50),
                date: (e.timestamp_created || "").substring(0, 10),
                unread: e.is_unread === 1
            }));
        return { count: leads.length, leads, ok: true };
    } catch (error) {
        return { count: 0, leads: [], ok: false };
    }
}

async function checkSystemHealth() {
    const checks = {};
    // Website
    try { const r = await safeFetch("https://smarterrevolutionai.com"); checks.website = r.status === 200 ? "✅" : "❌"; }
    catch { checks.website = "❌"; }
    // CRM
    try { const r = await safeFetch("http://localhost:3000"); checks.crm = r.status < 500 ? "✅" : "❌"; }
    catch { checks.crm = "❌"; }
    // Twilio
    try { const r = await safeFetch("https://status.twilio.com"); checks.twilio = r.status === 200 ? "✅" : "❌"; }
    catch { checks.twilio = "❌"; }
    // PlusVibe
    try { const r = await safeFetch(`${BASE_URL}/analytics/campaign/stats?workspace_id=${WORKSPACE_ID}&start_date=2026-02-13&end_date=2026-02-13`, { headers: { "x-api-key": PLUSVIBE_API_KEY } }); checks.plusvibe = r.ok ? "✅" : "❌"; }
    catch { checks.plusvibe = "❌"; }
    return checks;
}

async function main() {
    const [stats, leads, health] = await Promise.all([getCampaignStats(), getWarmLeads(), checkSystemHealth()]);

    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
    const timeStr = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

    let leadLines = "";
    if (leads.count > 0) {
        leadLines = leads.leads.map(l => `  - ${l.email} (${l.date})${l.unread ? " 🔴 UNREAD" : ""}`).join("\n");
    } else {
        leadLines = "  (none right now)";
    }

    const report = `📊 Smarter Revolution Daily Report - ${dateStr}

CAMPAIGNS (Last 24h):
  Sent: ${stats.sent} | Bounced: ${stats.bounced} (${stats.bounceRate}%) | Replied: ${stats.replied} | Positive: ${stats.positive}

WARM LEADS (INTERESTED):
  ${leads.count} leads in Unibox
${leadLines}

SYSTEM HEALTH:
  Website: ${health.website}  CRM: ${health.crm}  Twilio: ${health.twilio}  PlusVibe: ${health.plusvibe}

Generated: ${timeStr} ET`;

    console.log(report);
}

main().catch(e => { console.error("Report failed:", e.message); process.exit(1); });
