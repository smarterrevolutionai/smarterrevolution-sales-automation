const fs = require('fs');
const https = require('https');

const API_KEY = 'process.env.PLUSVIBE_API_KEY';
const WS_ID = '692307182213832a0e2cf618';
const WEST = new Set(['AZ','CA','CO','HI','ID','MT','NM','NV','OR','UT','WA','WY','AK']);

const CAMPAIGNS = [
  { east: '6987e237e2259240c66e6013', west: '698b92d56a4ee295b26b7530', csv: 'tech-finance.csv', name: 'Tech & Finance' },
  { east: '6987e238e2259240c66e6014', west: '698b92dc2f024992a17bec3a', csv: 'manufacturing-construction.csv', name: 'Manufacturing' },
  { east: '6987e238e2259240c66e6015', west: '698b92dcf229fa501f77522f', csv: 'healthcare-insurance.csv', name: 'Healthcare' },
  { east: '6987e23945fba752e310c5ed', west: '698b92dd1bbf7e16c9685cb4', csv: 'services-agencies.csv', name: 'Services' },
  { east: '6987e23a7d33011e42278325', west: '698b92de6a4ee295b26b753f', csv: 'retail-hospitality.csv', name: 'Retail' },
  { east: '6987e23be2259240c66e6017', west: '698b92df113e12e2090f528f', csv: 'general-other.csv', name: 'General' }
];

function parseCSV(file) {
  const content = fs.readFileSync(`/opt/smarty-projects/cold-email-leads/campaigns/${file}`, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const leads = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // Simple CSV parse handling quoted fields
    const vals = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => row[h] = vals[idx] || '');
    if (row.email) {
      leads[row.email.toLowerCase()] = row;
    }
  }
  return leads;
}

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.plusvibe.ai/api/v1${path}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  for (const camp of CAMPAIGNS) {
    console.log(`\n=== ${camp.name} ===`);
    
    // Parse CSV and classify
    const csvLeads = parseCSV(camp.csv);
    const westEmails = [];
    const westLeadData = [];
    
    for (const [email, data] of Object.entries(csvLeads)) {
      const state = (data.state || '').toUpperCase().trim();
      if (WEST.has(state)) {
        westEmails.push(email);
        westLeadData.push({
          email: data.email,
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          company_name: data.company_name || '',
          company_website: data.company_website || '',
          phone_number: data.phone_number || '',
          city: data.city || '',
          state: data.state || '',
          job_title: data.job_title || '',
          linkedin_person_url: data.linkedin_person_url || '',

        });
      }
    }
    
    console.log(`CSV: ${Object.keys(csvLeads).length} total, ${westEmails.length} West leads`);
    
    // Add West leads to West campaign in batches of 50
    console.log(`Adding ${westLeadData.length} leads to West campaign ${camp.west}...`);
    let added = 0;
    for (let i = 0; i < westLeadData.length; i += 50) {
      const batch = westLeadData.slice(i, i + 50);
      const result = await apiCall('POST', '/lead/add', {
        workspace_id: WS_ID,
        campaign_id: camp.west,
        leads: batch
      });
      added += batch.length;
      if (result.status === 'success' || result.code === 1) {
        process.stdout.write(`  Added batch ${Math.floor(i/50)+1} (${added}/${westLeadData.length})\r`);
      } else {
        console.log(`  Batch error: ${JSON.stringify(result).substring(0, 200)}`);
      }
      await sleep(250);
    }
    console.log(`\n  ✅ Added ${added} West leads to ${camp.name} (West)`);
    
    // Delete West leads from East campaign in batches
    console.log(`Removing West leads from East campaign ${camp.east}...`);
    let deleted = 0;
    for (let i = 0; i < westEmails.length; i += 100) {
      const batch = westEmails.slice(i, i + 100);
      const result = await apiCall('DELETE', '/lead/delete', {
        workspace_id: WS_ID,
        campaign_id: camp.east,
        delete_list: batch
      });
      deleted += batch.length;
      process.stdout.write(`  Deleted batch ${Math.floor(i/100)+1} (${deleted}/${westEmails.length})\r`);
      await sleep(250);
    }
    console.log(`\n  ✅ Removed ${deleted} West leads from ${camp.name} (East)`);
  }
  
  console.log('\n=== DONE ===');
}

main().catch(console.error);
