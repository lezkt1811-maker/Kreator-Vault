/* ==========================================================================
   Trend Oracle — app.js
   Fully client-side. Data lives in localStorage. OCR via Tesseract.js.
   AI enhancement is optional and only activates if a key is set in Settings.
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* Small helpers                                                          */
/* ---------------------------------------------------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (str) => (str || '').toString()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------- */
/* Storage layer                                                          */
/* ---------------------------------------------------------------------- */
const LS = {
  screenshots: 'trendOracle_screenshots',
  trends:      'trendOracle_trends',
  library:     'trendOracle_library',
  performance: 'trendOracle_performance',
  settings:    'trendOracle_settings',
  todayPick:   'trendOracle_todayPick'
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Storage read failed for', key, e);
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage write failed for', key, e);
    toast('Storage is full — try removing some screenshots.');
  }
}

const DEFAULT_NICHE = [
  '13-sign astrology', 'Ophiuchus', 'true sky astrology', 'StarChart13.com',
  'hidden zodiac truth', 'Lilith and Eve', 'spiritual rebellion',
  'ancient feminine wisdom', 'astrology myth-busting', 'TikTok education content'
];

function getSettings() {
  return loadJSON(LS.settings, {
    niche: DEFAULT_NICHE.slice(),
    website: 'StarChart13.com',
    apiKey: ''
  });
}
function saveSettings(s) { saveJSON(LS.settings, s); }

function getScreenshots() { return loadJSON(LS.screenshots, []); }
function saveScreenshots(v) { saveJSON(LS.screenshots, v); }

function getTrends() { return loadJSON(LS.trends, []); }
function saveTrends(v) { saveJSON(LS.trends, v); }

function getLibrary() { return loadJSON(LS.library, []); }
function saveLibrary(v) { saveJSON(LS.library, v); }

function getPerformance() { return loadJSON(LS.performance, []); }
function savePerformance(v) { saveJSON(LS.performance, v); }

/* ---------------------------------------------------------------------- */
/* Text analysis                                                          */
/* ---------------------------------------------------------------------- */
const STOPWORDS = new Set(('the a an and or but if of to in on for with is are was were be been ' +
  'this that these those it its as at by from your you i we they he she them his her our ' +
  'have has had do does did not no yes so than then there here up down out about into over ' +
  'under again more most other some such only own same can will just don should now').split(' '));

const EMOTIONAL_WORDS = ['secret', 'hidden', 'truth', 'exposed', 'banned', 'lied', 'lies',
  'forbidden', 'real', 'shocking', 'ancient', 'awakening', 'rebellion', 'myth', 'wrong',
  'actually', 'proof', 'warning', 'ritual', 'curse', 'power', 'forgotten', 'erased',
  'nobody', 'why', 'never', 'always', 'stop', 'wake up'];

const CONTROVERSY_WORDS = ['controversial', 'debate', 'myth', 'wrong', 'lied', 'fake',
  'cover-up', 'suppressed', 'patriarchy', 'erased', 'gatekept', 'censored'];

function extractHashtags(text) {
  const matches = text.match(/#[a-z0-9_]{2,}/gi) || [];
  return [...new Set(matches.map(h => h.toLowerCase()))];
}

function extractMetrics(text) {
  const metrics = {};
  const metricRe = /([\d][\d,.]*)\s*(k|m|b)?\+?\s*(views|view|likes|like|comments|comment|shares|share|saves|save|followers|follower)/gi;
  let m;
  while ((m = metricRe.exec(text)) !== null) {
    const num = m[1];
    const suffix = (m[2] || '').toUpperCase();
    const label = m[3].toLowerCase().replace(/s$/, '') + 's';
    metrics[label] = num + suffix;
  }
  const percentRe = /(\d+(\.\d+)?)\s?%/g;
  const percents = [];
  while ((m = percentRe.exec(text)) !== null) percents.push(m[1] + '%');
  if (percents.length) metrics.percentages = percents.join(', ');
  return metrics;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']{3,}/g) || [])
    .filter(w => !STOPWORDS.has(w));
}

function topKeywords(text, count = 8) {
  const freq = {};
  tokenize(text).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w);
}

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.reduce((sum, w) => sum + (lower.split(w.toLowerCase()).length - 1), 0);
}

function nicheMatchCount(text) {
  const niche = getSettings().niche;
  return countMatches(text, niche);
}

function deriveTrendName(text, hashtags) {
  if (hashtags.length) return hashtags[0].replace('#', '').replace(/_/g, ' ');
  const keywords = topKeywords(text, 3);
  if (keywords.length) return keywords.join(' ').replace(/\b\w/g, c => c.toUpperCase());
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 3);
  return firstLine ? firstLine.slice(0, 40) : 'Untitled trend';
}

function classifyCategory(text, platformArea) {
  const lower = text.toLowerCase();
  if (/#\w+/.test(text) && platformArea === 'Trending Hashtags') return 'Hashtag';
  if (/sound|audio|remix|original sound/.test(lower)) return 'Sound';
  if (/search|people also search|autocomplete/.test(lower)) return 'Search Term';
  if (/comment|reply|replies/.test(lower)) return 'Audience Question';
  if (/view|like|share|save|analytics|engagement/.test(lower)) return 'Performance Pattern';
  return 'General Topic';
}

/* ---------------------------------------------------------------------- */
/* Scoring                                                                */
/* ---------------------------------------------------------------------- */
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

function computeScores(entry, allTrends) {
  const text = (entry.rawText || '') + ' ' + (entry.trendName || '');
  const niche = nicheMatchCount(text);
  const emotional = countMatches(text, EMOTIONAL_WORDS);
  const controversy = countMatches(text, CONTROVERSY_WORDS);
  const hasQuestion = /\?/.test(text) ? 1 : 0;
  const website = getSettings().website || 'StarChart13.com';
  const websiteMentions = countMatches(text, [website.replace(/https?:\/\//, ''), 'astrology', 'zodiac', 'birth chart', 'starchart']);

  const sameNameCount = allTrends.filter(t => t.trendName === entry.trendName).length;
  const uniqueness = clamp(100 - (sameNameCount - 1) * 20, 10, 100);

  const metricCount = Object.keys(entry.metrics || {}).length;
  const recencyBoost = 10; // freshly extracted trends get a small lift

  const audienceMatch = clamp(niche * 18 + (entry.platformArea === 'Search Insights' ? 10 : 0) + 20);
  const trendStrength = clamp(metricCount * 14 + recencyBoost + (entry.platformArea === 'Trending Hashtags' || entry.platformArea === 'Trending Sounds' ? 15 : 0) + Math.min(sameNameCount, 3) * 8);
  const hookStrength = clamp(emotional * 12 + controversy * 8 + hasQuestion * 12 + 15);
  const websiteConversion = clamp(websiteMentions * 20 + niche * 8 + 10);
  const clarity = clamp(100 - Math.abs(40 - Math.min(text.length, 80)) , 30, 100);

  const viralPotential = clamp(Math.round(
    audienceMatch * 0.22 +
    hookStrength * 0.26 +
    trendStrength * 0.24 +
    websiteConversion * 0.12 +
    uniqueness * 0.08 +
    clarity * 0.08
  ));

  return {
    viralPotential,
    audienceMatch: Math.round(audienceMatch),
    trendStrength: Math.round(trendStrength),
    hookStrength: Math.round(hookStrength),
    websiteConversion: Math.round(websiteConversion),
    uniqueness: Math.round(uniqueness)
  };
}

/* ---------------------------------------------------------------------- */
/* Screenshot upload + OCR                                                */
/* ---------------------------------------------------------------------- */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => /image\/(png|jpeg|jpg|webp)/.test(f.type));
  if (!files.length) { toast('Please choose PNG, JPG, JPEG, or WEBP images.'); return; }

  const platformArea = $('#uploadPlatformArea').value;
  const screenshots = getScreenshots();
  const newOnes = [];

  for (const file of files) {
    const dataUrl = await fileToDataURL(file);
    const shot = {
      id: uid(),
      name: file.name,
      dataUrl,
      platformArea,
      dateAdded: new Date().toISOString(),
      ocrText: '',
      ocrStatus: 'pending'
    };
    newOnes.push(shot);
  }
  saveScreenshots([...newOnes, ...screenshots]);
  renderGallery();
  renderDashboardStats();

  const progressWrap = $('#ocrProgress');
  progressWrap.classList.remove('hidden');
  for (let i = 0; i < newOnes.length; i++) {
    $('#ocrProgressText').textContent = `Reading screenshot ${i + 1} of ${newOnes.length}…`;
    await runOCR(newOnes[i].id, (pct) => {
      $('#ocrBarFill').style.width = Math.round(((i + pct) / newOnes.length) * 100) + '%';
    });
  }
  progressWrap.classList.add('hidden');
  $('#ocrBarFill').style.width = '0%';
  toast('Screenshots read and trends charted ✦');
  renderGallery();
  renderTrends();
  renderDashboard();
  populateGenerateSelect();
}

async function runOCR(screenshotId, onProgress) {
  const screenshots = getScreenshots();
  const shot = screenshots.find(s => s.id === screenshotId);
  if (!shot) return;
  try {
    const result = await Tesseract.recognize(shot.dataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
      }
    });
    shot.ocrText = result.data.text || '';
    shot.ocrStatus = 'done';
  } catch (err) {
    console.error('OCR failed', err);
    shot.ocrText = '';
    shot.ocrStatus = 'error';
  }
  const list = getScreenshots().map(s => s.id === shot.id ? shot : s);
  saveScreenshots(list);
  analyzeScreenshot(shot);
}

function analyzeScreenshot(shot) {
  if (!shot.ocrText || !shot.ocrText.trim()) return;
  const text = shot.ocrText;
  const hashtags = extractHashtags(text);
  const metrics = extractMetrics(text);
  const keywords = topKeywords(text, 8);
  const category = classifyCategory(text, shot.platformArea);
  const trendName = deriveTrendName(text, hashtags);

  const trends = getTrends();
  const entry = {
    id: uid(),
    trendName,
    sourceScreenshot: shot.name,
    sourceScreenshotId: shot.id,
    platformArea: shot.platformArea,
    dateAdded: new Date().toISOString(),
    extractedKeywords: keywords,
    hashtags,
    metrics,
    topicCategory: category,
    notes: '',
    rawText: text.slice(0, 800)
  };
  const scores = computeScores(entry, trends);
  entry.scores = scores;
  entry.creatorRelevanceScore = scores.audienceMatch;
  entry.viralPotentialScore = scores.viralPotential;

  trends.unshift(entry);
  saveTrends(trends);
}

/* ---------------------------------------------------------------------- */
/* Rendering: Gallery                                                     */
/* ---------------------------------------------------------------------- */
function renderGallery() {
  const shots = getScreenshots();
  $('#galleryCount').textContent = shots.length;
  const gallery = $('#gallery');
  if (!shots.length) {
    gallery.innerHTML = '<p class="empty-state">No screenshots yet. Upload your first batch above.</p>';
    return;
  }
  gallery.innerHTML = shots.map(s => `
    <div class="gallery-item" data-id="${s.id}">
      <span class="gallery-status ${s.ocrStatus === 'done' ? 'done' : 'pending'}"></span>
      <img src="${s.dataUrl}" alt="${esc(s.name)}">
      <span class="gallery-tag">${esc(s.platformArea)}</span>
      <button class="gallery-delete" data-id="${s.id}" aria-label="Delete screenshot">✕</button>
    </div>
  `).join('');
}

function deleteScreenshot(id) {
  saveScreenshots(getScreenshots().filter(s => s.id !== id));
  renderGallery();
  renderDashboardStats();
}

/* ---------------------------------------------------------------------- */
/* Rendering: score orbs                                                  */
/* ---------------------------------------------------------------------- */
function orbColor(value) {
  if (value >= 70) return '#4be3a0';
  if (value >= 45) return '#e8c35c';
  return '#ff5f7e';
}
function orbSVG(value, size = 56) {
  const r = (size / 2) - 5;
  const c = 2 * Math.PI * r;
  const offset = c - (clamp(value) / 100) * c;
  const color = orbColor(value);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="color:${color}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="currentColor" stroke-width="5"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg>`;
}
function orbHTML(value, label) {
  return `<div class="orb">
    ${orbSVG(value)}
    <span class="orb-value" style="color:${orbColor(value)}">${value}</span>
    <span class="orb-label">${esc(label)}</span>
  </div>`;
}
function scoreOrbRow(scores) {
  return `<div class="orb-row">
    ${orbHTML(scores.viralPotential, 'Viral Potential')}
    ${orbHTML(scores.audienceMatch, 'Audience Match')}
    ${orbHTML(scores.trendStrength, 'Trend Strength')}
    ${orbHTML(scores.hookStrength, 'Hook Strength')}
    ${orbHTML(scores.websiteConversion, 'Website Conversion')}
  </div>`;
}
function scorePill(value) {
  const cls = value >= 70 ? 'high' : value >= 45 ? 'mid' : 'low';
  return `<span class="score-pill ${cls}">${value}</span>`;
}

/* ---------------------------------------------------------------------- */
/* Rendering: Trend list / cards                                         */
/* ---------------------------------------------------------------------- */
function trendCardHTML(t) {
  const tags = [...t.hashtags.slice(0, 3).map(h => `<span class="tag">${esc(h)}</span>`),
    `<span class="tag gold">${esc(t.topicCategory)}</span>`,
    `<span class="tag purple">${esc(t.platformArea)}</span>`].join('');
  return `<div class="trend-card" data-id="${t.id}">
    <div class="trend-card-top">
      <div>
        <div class="trend-name">${esc(t.trendName)}</div>
        <div class="trend-meta">${new Date(t.dateAdded).toLocaleDateString()} · from ${esc(t.sourceScreenshot)}</div>
      </div>
      ${scorePill(t.viralPotentialScore)}
    </div>
    <div class="trend-tags">${tags}</div>
  </div>`;
}

function renderTrends() {
  const trends = getTrends();
  const search = ($('#trendSearch')?.value || '').toLowerCase();
  const filter = $('#trendFilter')?.value || 'all';
  const filtered = trends.filter(t => {
    const matchesFilter = filter === 'all' || t.platformArea === filter;
    const haystack = (t.trendName + ' ' + t.extractedKeywords.join(' ') + ' ' + t.hashtags.join(' ')).toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesFilter && matchesSearch;
  }).sort((a, b) => b.viralPotentialScore - a.viralPotentialScore);

  $('#trendsFull').innerHTML = filtered.map(trendCardHTML).join('');
  $('#trendsEmpty').classList.toggle('hidden', trends.length > 0);

  $all('.trend-card', $('#trendsFull')).forEach(card => {
    card.addEventListener('click', () => openTrendDetail(card.dataset.id));
  });
}

function openTrendDetail(id) {
  const t = getTrends().find(x => x.id === id);
  if (!t) return;
  const html = `
    <button class="modal-close" id="closeTrendModal">✕</button>
    <p class="eyebrow">${esc(t.topicCategory)} · ${esc(t.platformArea)}</p>
    <h2>${esc(t.trendName)}</h2>
    <p class="muted small">Charted ${new Date(t.dateAdded).toLocaleString()} from ${esc(t.sourceScreenshot)}</p>
    ${scoreOrbRow(t.scores)}
    <div class="post-block">
      <div class="post-block-label">Keywords</div>
      <div class="trend-tags">${t.extractedKeywords.map(k => `<span class="tag">${esc(k)}</span>`).join('')}</div>
    </div>
    ${t.hashtags.length ? `<div class="post-block"><div class="post-block-label">Hashtags seen</div>
      <div class="trend-tags">${t.hashtags.map(h => `<span class="tag purple">${esc(h)}</span>`).join('')}</div></div>` : ''}
    ${Object.keys(t.metrics).length ? `<div class="post-block"><div class="post-block-label">Metrics read</div>
      <div class="post-block-body">${Object.entries(t.metrics).map(([k,v]) => `${k}: ${v}`).join('\n')}</div></div>` : ''}
    <div class="post-block">
      <div class="post-block-label">Notes</div>
      <textarea class="textarea" id="trendNotesInput" rows="3" placeholder="Add your own notes…">${esc(t.notes)}</textarea>
    </div>
    <button class="btn btn-primary" id="saveTrendNotes">Save notes</button>
    <button class="btn btn-secondary" id="generateFromTrend">Generate post from this ✎</button>
  `;
  $('#trendModalContent').innerHTML = html;
  $('#trendModal').classList.remove('hidden');
  $('#closeTrendModal').addEventListener('click', () => $('#trendModal').classList.add('hidden'));
  $('#saveTrendNotes').addEventListener('click', () => {
    const trends = getTrends().map(x => x.id === id ? { ...x, notes: $('#trendNotesInput').value } : x);
    saveTrends(trends);
    toast('Notes saved');
  });
  $('#generateFromTrend').addEventListener('click', () => {
    $('#trendModal').classList.add('hidden');
    showView('generate');
    populateGenerateSelect();
    $('#generateTrendSelect').value = id;
  });
}

/* ---------------------------------------------------------------------- */
/* Post generation — local templates                                     */
/* ---------------------------------------------------------------------- */
const HOOK_OPENERS = [
  "Nobody taught you this in astrology school:",
  "Your zodiac app has been lying to you about",
  "The 13th sign they don't want you to know about:",
  "This is the hidden truth behind",
  "Ophiuchus energy is showing up everywhere right now —",
  "The ancient feminine wisdom your horoscope skipped:",
];

function pick(arr, seed) {
  const idx = Math.abs(seed) % arr.length;
  return arr[idx];
}
function seedFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function generateLocalPost(trend) {
  const website = getSettings().website || 'StarChart13.com';
  const seed = seedFromString(trend.id);
  const hook = `${pick(HOOK_OPENERS, seed)} ${trend.trendName}.`;
  const title = `${trend.trendName} — the true sky version nobody explains`;
  const caption = `${title}\n\nMost horoscopes are working off a chart that's centuries out of date. Here's what the true sky actually shows about ${trend.trendName.toLowerCase()}, and why 13-sign astrology changes the read. Full birth chart breakdowns at ${website}.`;

  const hashtagPool = ['#astrology', '#ophiuchus', '#13thsign', '#truesky', '#astrologytok',
    '#zodiactruth', '#lilith', '#spiritualawakening', '#hiddenknowledge', '#astrologyeducation'];
  const extraTags = trend.hashtags.slice(0, 3).map(h => h.replace('#', ''));
  const hashtags = [...new Set([...hashtagPool.slice(0, 6), ...extraTags.map(t => '#' + t)])].slice(0, 8).join(' ');

  const script30 =
`[0-2s] HOOK (on screen + spoken): "${hook}"
[2-10s] Set up the myth: what most people believe about ${trend.trendName.toLowerCase()}.
[10-20s] Reveal: the true-sky / 13-sign explanation, tie it to Ophiuchus or Lilith where relevant.
[20-27s] One concrete "check your own chart" tip viewers can act on immediately.
[27-30s] CTA: "Get your real chart at ${website}." + on-screen text: ${website}`;

  const script60 =
`[0-3s] HOOK: "${hook}"
[3-12s] Name the common belief everyone's taught about this topic and why it feels true.
[12-25s] Introduce the 13-sign / true sky counter-argument. Bring in Ophiuchus and the idea of "hidden zodiac truth."
[25-38s] Go deeper: connect it to spiritual rebellion / ancient feminine wisdom (Lilith and Eve framing) — why this knowledge was left out.
[38-50s] Practical takeaway: how to figure out where this shows up in their own chart.
[50-57s] Recap the core reveal in one sentence for anyone who skipped ahead.
[57-60s] CTA: "Full breakdown and your true chart at ${website}."`;

  const pinnedComment = `If your placement felt "off" your whole life — that's usually why 👀 full chart at ${website}`;
  const thumbnailText = `THE ${trend.trendName.toUpperCase()} NOBODY EXPLAINS`;
  const cta = `Get your true 13-sign chart free at ${website}`;

  return { title, hook, caption, hashtags, script30, script60, pinnedComment, thumbnailText, cta };
}

async function generateAIPost(trend) {
  const settings = getSettings();
  if (!settings.apiKey) throw new Error('No API key set');

  const website = settings.website || 'StarChart13.com';
  const niche = settings.niche.join(', ');
  const prompt = `You are a TikTok content strategist for a creator in this niche: ${niche}. Their website is ${website}.
Trend data extracted from a TikTok analytics screenshot:
- Trend name: ${trend.trendName}
- Category: ${trend.topicCategory}
- Platform area: ${trend.platformArea}
- Keywords: ${trend.extractedKeywords.join(', ')}
- Hashtags seen: ${trend.hashtags.join(', ')}

Write a TikTok post package as strict JSON with these exact keys (no markdown, no preamble, JSON only):
{"title": "", "hook": "", "caption": "", "hashtags": "", "script30": "", "script60": "", "pinnedComment": "", "thumbnailText": "", "cta": ""}
Caption format: title first, then description, then hashtags directly underneath, no extra labels. Scripts should include timestamps. CTA must reference ${website}.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error('AI request failed: ' + response.status);
  const data = await response.json();
  const text = (data.content || []).map(b => b.text || '').join('\n');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function populateGenerateSelect() {
  const select = $('#generateTrendSelect');
  const trends = getTrends().sort((a, b) => b.viralPotentialScore - a.viralPotentialScore);
  if (!trends.length) {
    select.innerHTML = '<option value="">No trends yet — upload screenshots first</option>';
    return;
  }
  select.innerHTML = trends.map(t => `<option value="${t.id}">${esc(t.trendName)} (${t.viralPotentialScore})</option>`).join('');
}

async function handleGeneratePost() {
  const trendId = $('#generateTrendSelect').value;
  const trend = getTrends().find(t => t.id === trendId);
  if (!trend) { toast('Pick a trend first'); return; }
  const useAI = $('#useAiToggle').checked;
  const btn = $('#generatePostBtn');
  btn.disabled = true;
  btn.textContent = 'Reading the sky…';

  let post;
  try {
    if (useAI) {
      post = await generateAIPost(trend);
    } else {
      post = generateLocalPost(trend);
    }
  } catch (err) {
    console.error(err);
    toast('AI unavailable — used local generation instead');
    post = generateLocalPost(trend);
  }
  btn.disabled = false;
  btn.textContent = 'Generate post ✦';
  renderGeneratedOutput(post, trend);
}

function renderGeneratedOutput(post, trend) {
  const wrap = $('#generatedOutput');
  wrap.innerHTML = `
    <div class="glass-card">
      ${postBlock('Title', post.title)}
      ${postBlock('On-screen hook', post.hook)}
      ${postBlock('Caption (paste as-is)', `${post.title}\n${post.caption}\n\n${post.hashtags}`)}
      ${postBlock('30-second script', post.script30)}
      ${postBlock('60-second script', post.script60)}
      ${postBlock('Pinned comment idea', post.pinnedComment)}
      ${postBlock('Thumbnail text', post.thumbnailText)}
      ${postBlock('Call to action', post.cta)}
      <button class="btn btn-primary full" id="saveToLibraryBtn">Save to Content Library</button>
    </div>
  `;
  $('#saveToLibraryBtn').addEventListener('click', () => {
    const idea = {
      id: uid(),
      title: post.title,
      hook: post.hook,
      script30: post.script30,
      script60: post.script60,
      caption: post.caption,
      hashtags: post.hashtags,
      pinnedComment: post.pinnedComment,
      thumbnailText: post.thumbnailText,
      cta: post.cta,
      dateCreated: new Date().toISOString(),
      trendSource: trend.trendName,
      trendId: trend.id,
      status: 'idea',
      notes: ''
    };
    const lib = getLibrary();
    lib.unshift(idea);
    saveLibrary(lib);
    toast('Saved to Content Library ✦');
    renderDashboardStats();
  });
}

function postBlock(label, body) {
  const blockId = 'blk_' + uid();
  return `<div class="post-block">
    <div class="post-block-label"><span>${esc(label)}</span><button class="copy-btn" data-copy="${blockId}">copy</button></div>
    <div class="post-block-body" id="${blockId}">${esc(body)}</div>
  </div>`;
}

document.addEventListener('click', (e) => {
  if (e.target.matches('.copy-btn')) {
    const id = e.target.dataset.copy;
    const text = $('#' + id)?.textContent || '';
    navigator.clipboard?.writeText(text).then(() => toast('Copied')).catch(() => toast('Could not copy'));
  }
});

/* ---------------------------------------------------------------------- */
/* Post This Today                                                        */
/* ---------------------------------------------------------------------- */
function pickTodayTrend(forceNew = false) {
  const trends = getTrends();
  if (!trends.length) return null;
  const sorted = [...trends].sort((a, b) => b.viralPotentialScore - a.viralPotentialScore);
  const state = loadJSON(LS.todayPick, { id: null, date: null, excluded: [] });
  const todayStr = new Date().toDateString();

  if (!forceNew && state.id && state.date === todayStr) {
    const existing = trends.find(t => t.id === state.id);
    if (existing) return existing;
  }
  const excluded = forceNew ? [...state.excluded, state.id].filter(Boolean) : [];
  const candidate = sorted.find(t => !excluded.includes(t.id)) || sorted[0];
  saveJSON(LS.todayPick, { id: candidate.id, date: todayStr, excluded });
  return candidate;
}

function renderToday() {
  const trend = pickTodayTrend();
  const wrap = $('#todayContent');
  if (!trend) {
    wrap.innerHTML = '<p class="empty-state">Upload a few screenshots first, then the Oracle can choose today\'s post.</p>';
    return;
  }
  const post = generateLocalPost(trend);
  const weak = trend.viralPotentialScore < 45;
  wrap.innerHTML = `
    <div class="glass-card highlight-card">
      <div class="card-glow"></div>
      <p class="eyebrow">${esc(trend.topicCategory)} · from ${esc(trend.platformArea)}</p>
      <h2>${esc(trend.trendName)}</h2>
      ${scoreOrbRow(trend.scores)}
      ${weak ? `<div class="warning-banner">⚠ This trend is scoring low — it may feel saturated or off-niche. Consider it a backup rather than today's main post.</div>` : ''}
      <div class="post-block">
        <div class="post-block-label">Why the Oracle chose this</div>
        <div class="post-block-body">${esc(whyThisTrend(trend))}</div>
      </div>
    </div>
    ${postBlock('Exact hook', post.hook)}
    ${postBlock('Exact caption', `${post.title}\n${post.caption}\n\n${post.hashtags}`)}
    ${postBlock('Suggested video structure', post.script30)}
    <div class="post-block">
      <div class="post-block-label">Recommended posting angle</div>
      <div class="post-block-body">${esc(postingAngle(trend))}</div>
    </div>
    <button class="btn btn-primary full" id="todayGenerateFull">Generate full post ✎</button>
  `;
  $('#todayGenerateFull').addEventListener('click', () => {
    showView('generate');
    populateGenerateSelect();
    $('#generateTrendSelect').value = trend.id;
  });
}

function whyThisTrend(t) {
  const reasons = [];
  if (t.scores.audienceMatch > 55) reasons.push('it lines up closely with your 13-sign / true sky niche');
  if (t.scores.hookStrength > 55) reasons.push('the language carries a strong curiosity or emotional hook');
  if (t.scores.trendStrength > 55) reasons.push('the metrics on the source screenshot show real momentum');
  if (t.scores.websiteConversion > 55) reasons.push('it naturally points back to StarChart13.com');
  if (!reasons.length) reasons.push('it is currently your highest-scoring charted trend, even though no single signal is dominant');
  return 'This trend scored highest today because ' + reasons.join(', and ') + '.';
}

function postingAngle(t) {
  if (t.topicCategory === 'Sound') return 'Use the trending sound as background audio under a talking-head myth-bust — sound-first content rides the algorithm push harder than original audio right now.';
  if (t.topicCategory === 'Hashtag') return 'Lead with the hashtag topic directly in your caption and first 3 words on screen so the FYP context matches instantly.';
  if (t.topicCategory === 'Search Term') return 'Answer this like a direct search result — say the exact phrase in your hook so it surfaces in TikTok search.';
  if (t.topicCategory === 'Audience Question') return 'Frame this as a direct answer to a comment/question — open with "You asked..." to boost watch-through.';
  return 'Open with the reveal, not the setup — front-load the hidden-truth angle in the first 2 seconds.';
}

/* ---------------------------------------------------------------------- */
/* Content Library                                                        */
/* ---------------------------------------------------------------------- */
const STATUS_LIST = ['idea', 'drafted', 'filmed', 'posted', 'performed well', 'flopped'];

function statusClass(status) { return 'status-' + status.replace(/\s+/g, '-'); }

function libraryCardHTML(item) {
  return `<div class="library-card" data-id="${item.id}">
    <div class="library-card-top">
      <div>
        <div class="trend-name">${esc(item.title)}</div>
        <div class="trend-meta">${new Date(item.dateCreated).toLocaleDateString()} · from ${esc(item.trendSource)}</div>
      </div>
      <span class="status-badge ${statusClass(item.status)}">${esc(item.status)}</span>
    </div>
  </div>`;
}

function renderLibrary() {
  const items = getLibrary();
  const search = ($('#librarySearch')?.value || '').toLowerCase();
  const filter = $('#libraryFilter')?.value || 'all';
  const filtered = items.filter(i => {
    const matchesFilter = filter === 'all' || i.status === filter;
    const matchesSearch = !search || (i.title + ' ' + i.trendSource).toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });
  $('#libraryList').innerHTML = filtered.map(libraryCardHTML).join('');
  $('#libraryEmpty').classList.toggle('hidden', items.length > 0);
  $all('.library-card', $('#libraryList')).forEach(card => {
    card.addEventListener('click', () => openLibraryDetail(card.dataset.id));
  });
}

function openLibraryDetail(id) {
  const item = getLibrary().find(i => i.id === id);
  if (!item) return;
  const statusOptions = STATUS_LIST.map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`).join('');
  $('#libraryModalContent').innerHTML = `
    <button class="modal-close" id="closeLibraryModal">✕</button>
    <p class="eyebrow">from ${esc(item.trendSource)}</p>
    <h2>${esc(item.title)}</h2>
    <div class="field-row">
      <label class="field-label">Status</label>
      <select class="select" id="libStatusSelect">${statusOptions}</select>
    </div>
    ${postBlock('Hook', item.hook)}
    ${postBlock('Caption', `${item.title}\n${item.caption}\n\n${item.hashtags}`)}
    ${postBlock('30-second script', item.script30)}
    ${postBlock('60-second script', item.script60)}
    ${postBlock('Pinned comment', item.pinnedComment)}
    ${postBlock('Thumbnail text', item.thumbnailText)}
    ${postBlock('CTA', item.cta)}
    <div class="post-block">
      <div class="post-block-label">Notes</div>
      <textarea class="textarea" id="libNotesInput" rows="3">${esc(item.notes)}</textarea>
    </div>
    <button class="btn btn-primary" id="saveLibItem">Save changes</button>
    <button class="btn btn-ghost danger" id="deleteLibItem">Delete idea</button>
  `;
  $('#libraryModal').classList.remove('hidden');
  $('#closeLibraryModal').addEventListener('click', () => $('#libraryModal').classList.add('hidden'));
  $('#saveLibItem').addEventListener('click', () => {
    const lib = getLibrary().map(i => i.id === id ? { ...i, status: $('#libStatusSelect').value, notes: $('#libNotesInput').value } : i);
    saveLibrary(lib);
    renderLibrary();
    renderDashboardStats();
    toast('Saved ✦');
    $('#libraryModal').classList.add('hidden');
  });
  $('#deleteLibItem').addEventListener('click', () => {
    saveLibrary(getLibrary().filter(i => i.id !== id));
    renderLibrary();
    renderDashboardStats();
    $('#libraryModal').classList.add('hidden');
    toast('Deleted');
  });
}

/* ---------------------------------------------------------------------- */
/* Performance Tracker                                                    */
/* ---------------------------------------------------------------------- */
function populatePerfSelect() {
  const select = $('#perfPostSelect');
  const items = getLibrary();
  if (!items.length) {
    select.innerHTML = '<option value="">No saved ideas yet</option>';
    return;
  }
  select.innerHTML = items.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('');
}

function handleSavePerformance() {
  const postId = $('#perfPostSelect').value;
  if (!postId) { toast('Save an idea to the Library first'); return; }
  const item = getLibrary().find(i => i.id === postId);
  const record = {
    id: uid(),
    postId,
    title: item ? item.title : 'Untitled',
    trendSource: item ? item.trendSource : '',
    date: new Date().toISOString(),
    views: Number($('#perfViews').value) || 0,
    likes: Number($('#perfLikes').value) || 0,
    comments: Number($('#perfComments').value) || 0,
    shares: Number($('#perfShares').value) || 0,
    saves: Number($('#perfSaves').value) || 0,
    follows: Number($('#perfFollows').value) || 0,
    websiteClicks: Number($('#perfClicks').value) || 0
  };
  const perf = getPerformance();
  perf.unshift(record);
  savePerformance(perf);

  if (item) {
    const engagementRate = record.views ? (record.likes + record.comments + record.shares + record.saves) / record.views : 0;
    const newStatus = engagementRate > 0.12 ? 'performed well' : (record.views > 0 ? 'flopped' : item.status);
    const lib = getLibrary().map(i => i.id === postId ? { ...i, status: record.views > 0 ? newStatus : i.status } : i);
    saveLibrary(lib);
  }

  $all('#perfForm input').forEach(inp => inp.value = '');
  renderPerfHistory();
  renderLibrary();
  renderDashboard();
  toast('Performance logged ✦');
}

function renderPerfHistory() {
  const perf = getPerformance();
  $('#perfHistory').innerHTML = perf.map(p => `
    <div class="library-card">
      <div class="library-card-top">
        <div>
          <div class="trend-name">${esc(p.title)}</div>
          <div class="trend-meta">${new Date(p.date).toLocaleDateString()} · from ${esc(p.trendSource)}</div>
        </div>
      </div>
      <div class="trend-tags" style="margin-top:10px">
        <span class="tag">${p.views} views</span>
        <span class="tag">${p.likes} likes</span>
        <span class="tag">${p.comments} comments</span>
        <span class="tag">${p.shares} shares</span>
        <span class="tag">${p.saves} saves</span>
        <span class="tag gold">${p.follows} follows</span>
        <span class="tag purple">${p.websiteClicks} site clicks</span>
      </div>
    </div>
  `).join('');
  $('#perfEmpty').classList.toggle('hidden', perf.length > 0);
}

function computeInsight() {
  const lib = getLibrary();
  const wellPerformed = lib.filter(i => i.status === 'performed well');
  if (wellPerformed.length < 1) return null;
  const trends = getTrends();
  const categories = {};
  wellPerformed.forEach(i => {
    const t = trends.find(x => x.id === i.trendId);
    const cat = t ? t.topicCategory : 'General Topic';
    categories[cat] = (categories[cat] || 0) + 1;
  });
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  if (!topCat) return null;
  return `Posts built from "${topCat[0]}" trends are performing best for you so far (${topCat[1]} of your top performers). Lean into more of these.`;
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */
function renderDashboardStats() {
  $('#statScreenshots').textContent = getScreenshots().length;
  $('#statTrends').textContent = getTrends().length;
  $('#statIdeas').textContent = getLibrary().length;
  $('#statPosted').textContent = getLibrary().filter(i => ['posted', 'performed well', 'flopped'].includes(i.status)).length;
}

function renderDashboard() {
  renderDashboardStats();
  const trend = pickTodayTrend();
  if (trend) {
    $('#dashTopTrendName').textContent = trend.trendName;
    $('#dashTopTrendWhy').textContent = whyThisTrend(trend);
  } else {
    $('#dashTopTrendName').textContent = 'No trends charted yet';
    $('#dashTopTrendWhy').textContent = 'Upload a few screenshots to let the Oracle read the sky.';
  }
  const top = [...getTrends()].sort((a, b) => b.viralPotentialScore - a.viralPotentialScore).slice(0, 4);
  $('#dashTrendList').innerHTML = top.length
    ? top.map(trendCardHTML).join('')
    : '<p class="empty-state">Nothing charted yet.</p>';
  $all('.trend-card', $('#dashTrendList')).forEach(card => {
    card.addEventListener('click', () => openTrendDetail(card.dataset.id));
  });

  const insight = computeInsight();
  $('#dashInsightText').textContent = insight || "Log performance on a few posted videos and the Oracle will start finding your pattern.";
}

/* ---------------------------------------------------------------------- */
/* Settings                                                                */
/* ---------------------------------------------------------------------- */
function loadSettingsIntoForm() {
  const s = getSettings();
  $('#nicheKeywords').value = s.niche.join('\n');
  $('#brandWebsite').value = s.website;
  $('#apiKeyInput').value = s.apiKey || '';
}

function saveNiche() {
  const s = getSettings();
  s.niche = $('#nicheKeywords').value.split('\n').map(l => l.trim()).filter(Boolean);
  s.website = $('#brandWebsite').value.trim() || 'StarChart13.com';
  saveSettings(s);
  $('#nicheSaved').classList.remove('hidden');
  setTimeout(() => $('#nicheSaved').classList.add('hidden'), 2000);
}

function saveApiKey() {
  const s = getSettings();
  s.apiKey = $('#apiKeyInput').value.trim();
  saveSettings(s);
  $('#apiKeySaved').classList.remove('hidden');
  setTimeout(() => $('#apiKeySaved').classList.add('hidden'), 2000);
}
function clearApiKey() {
  const s = getSettings();
  s.apiKey = '';
  saveSettings(s);
  $('#apiKeyInput').value = '';
  toast('API key removed');
}

function exportData() {
  const payload = {
    screenshots: getScreenshots(),
    trends: getTrends(),
    library: getLibrary(),
    performance: getPerformance(),
    settings: getSettings()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trend-oracle-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function resetData() {
  if (!confirm('This erases all screenshots, trends, saved ideas, and performance data from this browser. Continue?')) return;
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  toast('All data erased');
  renderEverything();
}

/* ---------------------------------------------------------------------- */
/* Navigation                                                             */
/* ---------------------------------------------------------------------- */
function showView(name) {
  $all('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  $all('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (name === 'today') renderToday();
  if (name === 'trends') renderTrends();
  if (name === 'library') renderLibrary();
  if (name === 'performance') { populatePerfSelect(); renderPerfHistory(); }
  if (name === 'generate') populateGenerateSelect();
  if (name === 'settings') loadSettingsIntoForm();
  if (name === 'dashboard') renderDashboard();
}

function renderEverything() {
  renderDashboard();
  renderGallery();
  renderTrends();
  renderLibrary();
  populateGenerateSelect();
  populatePerfSelect();
  renderPerfHistory();
  loadSettingsIntoForm();
}

/* ---------------------------------------------------------------------- */
/* Wiring                                                                 */
/* ---------------------------------------------------------------------- */
function init() {
  // Nav
  $all('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  $('#settingsShortcut').addEventListener('click', () => showView('settings'));
  $('#dashGoToPostToday').addEventListener('click', () => showView('today'));

  // Upload
  $('#fileInput').addEventListener('change', (e) => handleFiles(e.target.files));
  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  document.addEventListener('click', (e) => {
    if (e.target.matches('.gallery-delete')) deleteScreenshot(e.target.dataset.id);
    const item = e.target.closest('.gallery-item');
    if (item && !e.target.matches('.gallery-delete')) {
      // future: open screenshot preview / OCR text
    }
  });

  // Trends
  $('#trendSearch').addEventListener('input', renderTrends);
  $('#trendFilter').addEventListener('change', renderTrends);

  // Today
  $('#rerollToday').addEventListener('click', () => { pickTodayTrend(true); renderToday(); });

  // Generate
  $('#generatePostBtn').addEventListener('click', handleGeneratePost);

  // Library
  $('#librarySearch').addEventListener('input', renderLibrary);
  $('#libraryFilter').addEventListener('change', renderLibrary);

  // Performance
  $('#savePerfBtn').addEventListener('click', handleSavePerformance);

  // Settings
  $('#saveNicheBtn').addEventListener('click', saveNiche);
  $('#saveApiKeyBtn').addEventListener('click', saveApiKey);
  $('#clearApiKeyBtn').addEventListener('click', clearApiKey);
  $('#exportDataBtn').addEventListener('click', exportData);
  $('#resetDataBtn').addEventListener('click', resetData);

  // Modals
  [['#trendModal'], ['#libraryModal']].forEach(([sel]) => {
    $(sel).addEventListener('click', (e) => { if (e.target === $(sel)) $(sel).classList.add('hidden'); });
  });

  renderEverything();
}

document.addEventListener('DOMContentLoaded', init);
