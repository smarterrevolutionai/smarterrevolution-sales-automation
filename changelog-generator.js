#!/usr/bin/env node
/**
 * changelog-generator.js
 * Reads git commits from all 4 repos and POSTs them to the Command Center changelog API.
 * Run manually: node /opt/smarty-projects/changelog-generator.js
 * Cron (daily at 6am UTC): 0 6 * * * /usr/bin/node /opt/smarty-projects/changelog-generator.js >> /opt/smarty-projects/logs/changelog.log 2>&1
 */

const { execSync } = require('child_process');
const http = require('http');

const API_URL = 'http://localhost:3001/api/changelog';
const API_KEY = 'process.env.COMMAND_CENTER_API_KEY';
const COMMITS_PER_REPO = 30;

const REPOS = [
  { dir: '/opt/smarter-crm',              system: 'CRM',            tags: ['git-commit', 'crm'] },
  { dir: '/opt/openclaw-command-center',  system: 'COMMAND_CENTER', tags: ['git-commit', 'command-center'] },
  { dir: '/opt/smarterrevolutionai-site', system: 'WEBSITE',        tags: ['git-commit', 'website'] },
  { dir: '/opt/smarter-pm',              system: 'PM_APP',          tags: ['git-commit', 'pm-app'] },
];

// Map conventional commit prefix → {category, impact}
function parseCommit(message) {
  const rules = [
    { re: /^feat(\(.+\))?!?:\s*/i,     category: 'FEATURE',     impact: 'MAJOR' },
    { re: /^fix(\(.+\))?!?:\s*/i,      category: 'FIX',         impact: 'PATCH' },
    { re: /^security(\(.+\))?!?:\s*/i, category: 'SECURITY',    impact: 'MINOR' },
    { re: /^perf(\(.+\))?!?:\s*/i,     category: 'PERFORMANCE', impact: 'MINOR' },
    { re: /^refactor(\(.+\))?!?:\s*/i, category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^deploy(\(.+\))?!?:\s*/i,   category: 'DEPLOYMENT',  impact: 'MINOR' },
    { re: /^chore(\(.+\))?!?:\s*/i,    category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^docs(\(.+\))?!?:\s*/i,     category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^style(\(.+\))?!?:\s*/i,    category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^test(\(.+\))?!?:\s*/i,     category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^ci(\(.+\))?!?:\s*/i,       category: 'DEPLOYMENT',  impact: 'PATCH' },
    { re: /^build(\(.+\))?!?:\s*/i,    category: 'DEPLOYMENT',  impact: 'PATCH' },
    { re: /^add[\s:]/i,                category: 'FEATURE',     impact: 'MINOR' },
    { re: /^update[\s:]/i,             category: 'ENHANCEMENT', impact: 'PATCH' },
    { re: /^initial commit/i,          category: 'DEPLOYMENT',  impact: 'MAJOR' },
  ];
  for (const r of rules) {
    if (r.re.test(message)) {
      return {
        category: r.category,
        impact: r.impact,
        clean: message.replace(r.re, '').trim() || message,
      };
    }
  }
  return { category: 'ENHANCEMENT', impact: 'MINOR', clean: message };
}

function getGitLog(dir, n) {
  try {
    const raw = execSync(
      `git -C "${dir}" log --format="%H|||%s|||%an|||%ai" -n ${n}`,
      { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      const [hash, message, author, date] = line.split('|||');
      return { hash: (hash||'').trim(), message: (message||'').trim(), author: (author||'Unknown').trim(), date: (date||'').trim() };
    }).filter(c => c.hash.length === 40);
  } catch (err) {
    console.error(`  ⚠️  git log failed for ${dir}: ${err.message}`);
    return [];
  }
}

function httpGet(url, headers) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ statusCode: res.statusCode }); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`\n===== Changelog Generator — ${ts} =====`);

  // Fetch existing entries to deduplicate by git hash (stored in version field)
  console.log('\n🔎 Fetching existing entries...');
  const existing = await httpGet(`${API_URL}?limit=500`, { 'x-api-key': API_KEY });
  const knownHashes = new Set();
  if (existing && existing.entries) {
    for (const e of existing.entries) {
      if (e.version && e.version.length === 40) knownHashes.add(e.version);
    }
  }
  console.log(`   Known git hashes: ${knownHashes.size}`);

  const newEntries = [];

  for (const repo of REPOS) {
    console.log(`\n📦 ${repo.system} (${repo.dir})`);
    const commits = getGitLog(repo.dir, COMMITS_PER_REPO);
    console.log(`   Found ${commits.length} commits`);

    let added = 0, skipped = 0;
    for (const commit of commits) {
      if (knownHashes.has(commit.hash)) { skipped++; continue; }
      const { category, impact, clean } = parseCommit(commit.message);
      newEntries.push({
        date: new Date(commit.date).toISOString(),
        system: repo.system,
        category,
        title: clean,
        description: null,
        tags: [...repo.tags],
        impact,
        version: commit.hash,  // git hash — used for deduplication
        metadata: {
          gitHash: commit.hash,
          author: commit.author,
          originalMessage: commit.message,
        },
      });
      added++;
    }
    console.log(`   New: ${added} | Already synced: ${skipped}`);
  }

  if (newEntries.length === 0) {
    console.log('\n✅ Nothing new to add — changelog is up to date');
    return;
  }

  console.log(`\n📤 Posting ${newEntries.length} new entries...`);
  const BATCH = 20;
  let totalCreated = 0;
  for (let i = 0; i < newEntries.length; i += BATCH) {
    const batch = newEntries.slice(i, i + BATCH);
    try {
      const result = await httpPost(API_URL, batch, { 'x-api-key': API_KEY });
      const n = result.created || 0;
      totalCreated += n;
      console.log(`   Batch ${Math.floor(i/BATCH)+1}: ${n} created`);
    } catch (err) {
      console.error(`   Batch ${Math.floor(i/BATCH)+1} failed:`, err.message);
    }
  }

  console.log(`\n✅ Done — ${totalCreated} new entries added`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
