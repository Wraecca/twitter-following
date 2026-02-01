#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, 'twitter_following_list.json');
const HTML_PATH = join(__dirname, 'index.html');

// --- Step 1: Fetch current following from bird CLI ---
console.log('Fetching following list from Twitter...');
let rawFollowing;
try {
  const parsed = JSON.parse(execSync('bird following --all --json', {
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf-8',
    timeout: 300000
  }));
  rawFollowing = Array.isArray(parsed) ? parsed : (parsed.users || []);
} catch (e) {
  console.error('Failed to fetch following list:', e.message);
  process.exit(1);
}
console.log(`Fetched ${rawFollowing.length} accounts from Twitter.`);

// --- Step 2: Load existing data ---
let existing = [];
try {
  existing = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
} catch (e) {
  console.log('No existing JSON found, starting fresh.');
}
const existingMap = new Map(existing.map(a => [a.handle.replace('@', '').toLowerCase(), a]));

// --- Step 3: Build new map from bird data ---
const newMap = new Map();
for (const u of rawFollowing) {
  newMap.set(u.username.toLowerCase(), {
    username: u.username,
    name: u.name || '',
    bio: (u.description || '').replace(/\n/g, ' ').trim(),
  });
}

// --- Step 4: Diff ---
let added = 0, removed = 0, bioUpdated = 0;
const result = [];

// Process accounts in the order bird returns them (newest follows first)
for (const [key, bird] of newMap) {
  const ex = existingMap.get(key);
  if (ex) {
    // Existing account - keep tags, update bio if changed
    const newBio = bird.bio;
    const oldBio = ex.bio || '';
    if (newBio !== oldBio && newBio.length > 0) {
      bioUpdated++;
    }
    result.push({
      handle: '@' + bird.username,
      name: bird.name,
      bio: newBio || oldBio,
      avatar_url: `https://unavatar.io/x/${bird.username}`,
      tags: ex.tags || ['untagged']
    });
  } else {
    // New account - auto-tag
    added++;
    result.push({
      handle: '@' + bird.username,
      name: bird.name,
      bio: bird.bio,
      avatar_url: `https://unavatar.io/x/${bird.username}`,
      tags: autoTag(bird.name, bird.bio)
    });
  }
}

// Count removed
for (const [key] of existingMap) {
  if (!newMap.has(key)) removed++;
}

// --- Step 5: Write JSON ---
writeFileSync(JSON_PATH, JSON.stringify(result, null, 2) + '\n');
console.log(`Written ${result.length} accounts to JSON.`);

// --- Step 6: Generate HTML ---
generateHTML(result);
console.log('Regenerated index.html');

// --- Summary ---
console.log(`\nSync complete: +${added} new, -${removed} removed, ${bioUpdated} bio updates`);
console.log(`Total: ${result.length} accounts`);

// ============ HELPERS ============

function autoTag(name, bio) {
  const text = ((name || '') + ' ' + (bio || '')).toLowerCase();
  const isPerson = detectPerson(name, text);

  // Check categories in priority order
  const checks = [
    { re: /\b(trading|trader|chart|alpha)\b/i, tag: 'crypto-trader' },
    { re: /\b(crypto|web3|defi|nft|blockchain|eth\b|bitcoin|solana|token|onchain|on-chain)\b/i, person: 'crypto-person', entity: 'crypto-entity' },
    { re: /\b(ai|ml\b|llm|gpt|claude|anthropic|openai|machine learning|deep\s*learning)\b/i, person: 'ai-person', entity: 'ai-entity' },
    { re: /\b(vc|venture|invest|capital|fund\b|portfolio)\b/i, person: 'vc-person', entity: 'vc-entity' },
    { re: /\b(dev|engineer|software|code|startup|founder|ceo|cto|programmer|hacker)\b/i, person: 'tech-person', entity: 'tech-entity' },
    { re: /\b(financ|bank|market|stock|econom|hedge|quant)\b/i, person: 'finance-person', entity: 'finance-entity' },
    { re: /\b(politic|government|senator|congress|policy|diplomat|minister|geopolit)\b/i, tag: 'politics' },
  ];

  for (const c of checks) {
    if (c.re.test(text)) {
      if (c.tag) return [c.tag];
      return [isPerson ? c.person : c.entity];
    }
  }
  return ['untagged'];
}

function detectPerson(name, text) {
  // Personal pronouns, titles suggest person
  if (/\b(i |i'm|my |he |she |him |her |founder|ceo|cto|coo|engineer|developer|researcher|professor|phd|dr\.|building|working at)\b/i.test(text)) return true;
  // Company-like patterns suggest entity
  if (/\b(official|platform|protocol|network|we |our |inc\.|corp|ltd|labs|dao|foundation)\b/i.test(text)) return false;
  // Short single-word names are often entities
  const words = (name || '').trim().split(/\s+/);
  if (words.length >= 2) return true; // Multi-word names are usually people
  return false; // Default to entity for single-word names
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function generateHTML(accounts) {
  // Count tags
  const tagCounts = {};
  for (const a of accounts) {
    for (const t of (a.tags || [])) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  // Ordered tag list matching original
  const tagOrder = [
    'crypto-person', 'crypto-entity', 'crypto-trader',
    'ai-person', 'ai-entity',
    'tech-person', 'tech-entity',
    'vc-person', 'vc-entity',
    'finance-person', 'finance-entity',
    'politics', 'media', 'science', 'design', 'personal', 'other', 'untagged'
  ];
  const tagLabels = {
    'crypto-person': 'Crypto Person', 'crypto-entity': 'Crypto Entity', 'crypto-trader': 'Crypto Trader',
    'ai-person': 'Ai Person', 'ai-entity': 'Ai Entity',
    'tech-person': 'Tech Person', 'tech-entity': 'Tech Entity',
    'vc-person': 'Vc Person', 'vc-entity': 'Vc Entity',
    'finance-person': 'Finance Person', 'finance-entity': 'Finance Entity',
    'politics': 'Politics', 'media': 'Media', 'science': 'Science',
    'design': 'Design', 'personal': 'Personal', 'other': 'Other', 'untagged': 'Untagged'
  };

  const total = accounts.length;
  const filterBtns = [`<span class="fbtn active" onclick="setGroup(this,'all')">All (${total})</span>`];
  for (const t of tagOrder) {
    if (tagCounts[t]) {
      filterBtns.push(`<span class="fbtn" onclick="setGroup(this,'${t}')">${tagLabels[t] || t} (${tagCounts[t]})</span>`);
    }
  }

  const cards = accounts.map(a => {
    const handle = a.handle.replace('@', '');
    const tags = (a.tags || []).join(',');
    const searchStr = `${a.name} ${a.handle} ${a.bio}`.toLowerCase();
    const tagSpans = (a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="card" data-s="${esc(searchStr)}" data-g="${esc(tags)}" data-h="${esc(handle)}"><input type="checkbox" class="cb" onchange="toggleSelect(this)"><img data-src="${esc(a.avatar_url)}" width="36" height="36"><div class="info"><div class="top"><div class="left"><div class="name">${esc(a.name)}</div><div class="handle">${esc(a.handle)}</div></div><div class="btns"><a class="btn" href="https://x.com/${esc(handle)}" target="_blank">Profile ↗</a><span class="btn btn-recent" onclick="toggleRecent(this,'${esc(handle)}')">Recent ▼</span></div></div><div class="bio">${esc(a.bio)}</div><div style="margin-top:2px">${tagSpans}</div></div></div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twitter Following</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:10px 16px 60px;background:#0d1117;color:#e6edf3}
@media(max-width:640px){body{max-width:100%;padding:10px 10px 60px}}
h1{color:#58a6ff;font-size:1.1em;margin:8px 0}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.fbtn{padding:5px 10px;background:#161b22;border:1px solid #30363d;border-radius:20px;color:#8b949e;font-size:0.75em;cursor:pointer;white-space:nowrap}
.fbtn.active{background:#58a6ff;color:#0d1117;border-color:#58a6ff;font-weight:600}
.card{display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid #21262d}
.card.selected{background:#1a1f2b;border-radius:6px;margin:0 -6px;padding:10px 6px;border-bottom:1px solid #30363d}
.card img{width:36px;height:36px;border-radius:50%;flex-shrink:0;background:#21262d;margin-top:2px}
.cb{width:18px;height:18px;flex-shrink:0;margin-top:4px;accent-color:#58a6ff;cursor:pointer}
.info{flex:1;min-width:0}
.top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.left{min-width:0;overflow:hidden}
.name{font-weight:600;font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.handle{color:#58a6ff;font-size:0.8em}
.bio{color:#8b949e;font-size:0.78em;margin-top:3px;line-height:1.3;word-wrap:break-word}
.btns{display:flex;gap:4px;flex-shrink:0}
.btn{padding:4px 10px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#58a6ff;font-size:0.75em;text-decoration:none;white-space:nowrap;cursor:pointer}
.btn-recent{color:#8b949e}
.btn-recent.active{color:#58a6ff}
.tag{display:inline-block;padding:1px 6px;background:#1f2937;border-radius:10px;font-size:0.65em;color:#f97316;margin-top:2px;margin-right:3px}
input{width:100%;padding:10px;margin-bottom:8px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:1em}
.tweet-panel{margin:8px 0;border-radius:8px;overflow:hidden}
.tweet-panel iframe{width:100%;height:400px;border:none}
.floating-bar{position:fixed;bottom:0;left:0;right:0;background:#161b22;border-top:1px solid #30363d;padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:10px;z-index:999}
.floating-bar .count{color:#e6edf3;font-size:0.85em}
.floating-bar .copy-btn{padding:6px 16px;background:#58a6ff;color:#0d1117;border:none;border-radius:6px;font-size:0.85em;font-weight:600;cursor:pointer}
.floating-bar .copy-btn:active{background:#4090e0}
.floating-bar .clear-btn{padding:6px 12px;background:#21262d;border:1px solid #30363d;color:#8b949e;border-radius:6px;font-size:0.8em;cursor:pointer}
</style></head><body>
<h1>Twitter Following (${total})</h1>
<input type="text" id="search" placeholder="Search..." oninput="applyFilters()">
<div class="filters" id="filters">
${filterBtns.join('\n')}
</div><div id="list">
${cards}
</div>
<div class="floating-bar">
<span class="count" id="selCount">0 selected</span>
<button class="copy-btn" onclick="copySelected()">📋 Copy Handles</button>
<button class="clear-btn" onclick="clearAll()">Clear</button>
</div>
<script>
let currentGroup='all';
const selected=new Set();
function setGroup(el,g){
  currentGroup=g;
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}
function applyFilters(){
  const q=document.getElementById('search').value.toLowerCase();
  document.querySelectorAll('.card').forEach(c=>{
    const matchGroup=currentGroup==='all'||c.dataset.g.split(',').includes(currentGroup);
    const matchSearch=!q||c.dataset.s.includes(q);
    c.style.display=(matchGroup&&matchSearch)?'':'none';
  });
  document.querySelectorAll('.tag').forEach(t=>{
    t.style.display=(currentGroup!=='all'&&t.textContent===currentGroup)?'none':'';
  });
}
function toggleSelect(cb){
  const card=cb.closest('.card');
  const handle=card.dataset.h;
  if(cb.checked){selected.add(handle);card.classList.add('selected')}
  else{selected.delete(handle);card.classList.remove('selected')}
  updateBar();
}
function updateBar(){
  document.getElementById('selCount').textContent=selected.size+' selected';
}
function copySelected(){
  if(!selected.size)return;
  const txt=[...selected].map(h=>'@'+h).join(', ');
  navigator.clipboard.writeText(txt).then(()=>{
    const btn=document.querySelector('.copy-btn');
    btn.textContent='✅ Copied!';
    setTimeout(()=>btn.textContent='📋 Copy Handles',1500);
  });
}
function clearAll(){
  selected.clear();
  document.querySelectorAll('.cb').forEach(c=>{c.checked=false});
  document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected'));
  updateBar();
}
let openPanel=null;
function toggleRecent(el,handle){
  const card=el.closest('.card');
  const existing=card.querySelector('.tweet-panel');
  if(existing){existing.remove();el.textContent='Recent ▼';el.classList.remove('active');openPanel=null;return}
  if(openPanel){openPanel.panel.remove();openPanel.btn.textContent='Recent ▼';openPanel.btn.classList.remove('active')}
  const div=document.createElement('div');div.className='tweet-panel';
  div.innerHTML='<iframe src="https://syndication.twitter.com/srv/timeline-profile/screen-name/'+handle+'" loading="lazy"></iframe>';
  card.querySelector('.info').appendChild(div);
  el.textContent='Recent ▲';el.classList.add('active');
  openPanel={panel:div,btn:el};
}
const obs=new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){const img=e.target;img.src=img.dataset.src;img.onerror=function(){this.style.visibility='hidden'};obs.unobserve(img)}
  });
},{rootMargin:'200px'});
document.querySelectorAll('img[data-src]').forEach(img=>obs.observe(img));
</script>
</body></html>`;

  writeFileSync(HTML_PATH, html);
}
