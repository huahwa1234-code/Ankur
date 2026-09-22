/* =========================================================
   YAAD RAKH — app.js
   Sab kuch is ek file mein: data model, spaced-repetition
   algorithm, revision engine, aur UI wiring.
   Har section ke upar Hindi comment hai taaki beginner ko
   samajhna aasaan ho.
   ========================================================= */

/* ---------- Storage keys ---------- */
const STORE_KEY   = 'yr_terms_v1';
const STREAK_KEY  = 'yr_streak_v1';
const THEME_KEY   = 'yr_theme_v1';
const SEEDED_KEY  = 'yr_seeded_v1';

/* ---------- Categories (spec ke mutabiq) ---------- */
const CATEGORIES = ['History','Geography','Polity','Economy','Science','Environment','Current Affairs','Miscellaneous'];

/* ---------- Spaced repetition progression tables (din mein) ---------- */
const ALMOST_STEPS_DAYS = [3, 7, 14, 30, 60, 90];   // "थोड़ा याद था" ke baad progression... wait see below
const HARD_STEPS_DAYS   = [1, 3, 7, 14, 30, 60, 90]; // "थोड़ा याद था" progression
const EASY_STEPS_DAYS   = [7, 14, 30, 60, 90];       // "बिल्कुल सही" progression
const AGAIN_MINUTES     = 10;                        // "भूल गया" -> 10 minute baad phir

/* =========================================================
   UTILITIES
   ========================================================= */
function uid(){ return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function nowTs(){ return Date.now(); }
function addMinutes(ts, m){ return ts + m*60*1000; }
function addDays(ts, d){ return ts + d*24*60*60*1000; }
function endOfToday(){
  const d = new Date();
  d.setHours(23,59,59,999);
  return d.getTime();
}
function startOfDay(ts){
  const d = new Date(ts);
  d.setHours(0,0,0,0);
  return d.getTime();
}
function fmtDate(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('hi-IN', {day:'numeric', month:'short'});
}
function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=> t.classList.remove('show'), 2200);
}
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* Interleaving: ek hi category ke terms ko lagataar na rakho — isse
   confusing/similar terms ke beech gap aa jaata hai aur discrimination
   better banti hai (mixing practice). */
function interleaveByCategory(pool){
  const groups = {};
  shuffle(pool).forEach(t => {
    (groups[t.category] = groups[t.category] || []).push(t);
  });
  const buckets = Object.values(groups);
  const result = [];
  let remaining = pool.length;
  while(remaining > 0){
    for(const bucket of buckets){
      if(bucket.length){
        result.push(bucket.shift());
        remaining--;
      }
    }
  }
  return result;
}
function findTermByName(name){
  if(!name) return null;
  const n = name.trim().toLowerCase();
  return state.terms.find(t => t.term.trim().toLowerCase() === n) || null;
}

/* =========================================================
   DATA LAYER (localStorage) — error-safe
   ========================================================= */
function loadTerms(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    console.error('loadTerms error', e);
    return [];
  }
}
function saveTerms(terms){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(terms));
    return true;
  }catch(e){
    console.error('saveTerms error', e);
    toast('⚠️ Data save नहीं हो पाया (storage full हो सकता है)');
    return false;
  }
}
function getStreak(){
  try{
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : {count:0, lastDate:null};
  }catch(e){ return {count:0, lastDate:null}; }
}
function saveStreak(s){
  try{ localStorage.setItem(STREAK_KEY, JSON.stringify(s)); }catch(e){}
}

/* =========================================================
   DEMO DATA (pehli baar app kholne par)
   ========================================================= */
function makeTerm(t){
  const ts = nowTs();
  return Object.assign({
    id: uid(),
    term: '', hindiMeaning: '', englishMeaning: '', category: 'Miscellaneous',
    explanation: '', memoryHint: '', visualEmoji: '', example: '',
    confusedWith: [], difference: '', examNote: '', imageUrl: '', tags: [],
    createdAt: ts, lastReviewed: null, nextReview: ts,
    reviewCount: 0, correctCount: 0, wrongCount: 0,
    goodStreak: 0, wrongStreak: 0, hardStreak: 0,
    status: 'NEW', leech: false, lastQuestionType: null
  }, t);
}
function seedDemoData(){
  if(localStorage.getItem(SEEDED_KEY)) return;
  const demo = [
    makeTerm({term:'El Niño', hindiMeaning:'प्रशांत महासागर के मध्य और पूर्वी भाग के सतही जल का असामान्य रूप से गर्म होना।', englishMeaning:'Abnormal warming of central & eastern Pacific Ocean surface waters.', category:'Geography', memoryHint:'El Niño = गर्म (Niño सुनते ही सोचो सूरज/आग)', visualEmoji:'🌊🔥', example:'El Niño वर्षों में भारत में मानसून कमजोर हो सकता है।', confusedWith:['La Niña','ENSO'], difference:'El Niño = warming, La Niña = cooling', examNote:'ENSO cycle का हिस्सा है।', tags:['climate','ocean']}),
    makeTerm({term:'La Niña', hindiMeaning:'प्रशांत महासागर के मध्य और पूर्वी भाग के सतही जल का असामान्य रूप से ठंडा होना।', englishMeaning:'Abnormal cooling of central & eastern Pacific Ocean surface waters.', category:'Geography', memoryHint:'La Niña = ठंडा (La लगे तो सोचो बर्फ)', visualEmoji:'🌊❄️', example:'La Niña वर्षों में भारत में मानसून प्रायः अच्छा रहता है।', confusedWith:['El Niño','ENSO'], difference:'La Niña = cooling, El Niño = warming', examNote:'La Niña, El Niño के विपरीत phase है।', tags:['climate','ocean']}),
    makeTerm({term:'Fiscal Deficit', hindiMeaning:'सरकार की कुल आय (उधार को छोड़कर) और कुल व्यय के बीच का अंतर।', englishMeaning:'Difference between total government expenditure and total revenue (excluding borrowings).', category:'Economy', memoryHint:'Fiscal Deficit = सरकार की कुल कमी (income से ज्यादा खर्च)', visualEmoji:'💸📉', example:'Budget में Fiscal Deficit को GDP के % में दिखाया जाता है।', confusedWith:['Revenue Deficit','GDP'], difference:'Fiscal Deficit = कुल उधार जरूरत, Revenue Deficit = सिर्फ revenue account की कमी', examNote:'FRBM Act में target तय होते हैं।', tags:['budget','finance']}),
    makeTerm({term:'Inflation', hindiMeaning:'वस्तुओं और सेवाओं की कीमतों में समय के साथ लगातार वृद्धि, जिससे मुद्रा की क्रय शक्ति घटती है।', englishMeaning:'A sustained rise in the general price level, reducing purchasing power.', category:'Economy', memoryHint:'एक ही सामान के लिए ज्यादा पैसे = Inflation', visualEmoji:'🎈💰', example:'RBI, repo rate बढ़ाकर Inflation को control करता है।', confusedWith:['Deflation'], difference:'Inflation = कीमतें बढ़ना, Deflation = कीमतें घटना', examNote:'CPI और WPI से मापा जाता है।', tags:['economy','prices']}),
    makeTerm({term:'Federalism', hindiMeaning:'शासन की वह व्यवस्था जिसमें सत्ता केंद्र और राज्यों के बीच संवैधानिक रूप से बंटी होती है।', englishMeaning:'A system of government where power is constitutionally divided between center and states.', category:'Polity', memoryHint:'Federalism = Federal + बंटवारा (केंद्र-राज्य में सत्ता का बंटवारा)', visualEmoji:'🏛️🤝', example:'भारत में "quasi-federal" व्यवस्था मानी जाती है।', confusedWith:['Unitary System'], difference:'Federalism = सत्ता बंटी हुई, Unitary = सत्ता केंद्र में केंद्रित', examNote:'Article 1 भारत को "Union of States" कहता है।', tags:['constitution']}),
    makeTerm({term:'Fundamental Rights', hindiMeaning:'संविधान के भाग III में दिए गए मौलिक अधिकार, जो नागरिकों को न्यायालय द्वारा लागू करने योग्य गारंटी देते हैं।', englishMeaning:'Basic rights guaranteed in Part III of the Constitution, enforceable by courts.', category:'Polity', memoryHint:'Fundamental Rights = Part III = न्यायालय से enforce होने वाले अधिकार', visualEmoji:'⚖️📜', example:'Right to Equality, Right to Freedom इसके उदाहरण हैं।', confusedWith:['Directive Principles'], difference:'Fundamental Rights = justiciable (enforceable), DPSP = non-justiciable', examNote:'Article 12-35 में वर्णित।', tags:['constitution']}),
    makeTerm({term:'GDP', hindiMeaning:'एक निश्चित समय में देश की सीमा के भीतर उत्पादित सभी वस्तुओं और सेवाओं का कुल बाज़ार मूल्य।', englishMeaning:'Total market value of all goods and services produced within a country in a given period.', category:'Economy', memoryHint:'GDP = देश के अंदर की पूरी production', visualEmoji:'🏭📊', example:'GDP growth rate से आर्थिक सेहत मापी जाती है।', confusedWith:['GNP','Fiscal Deficit'], difference:'GDP = देश की सीमा के अंदर, GNP = देश के नागरिकों द्वारा (सीमा के बाहर भी)', examNote:'Base year 2011-12 पर calculate होता है।', tags:['economy']}),
    makeTerm({term:'Green Revolution', hindiMeaning:'1960 के दशक में भारत में उच्च उत्पादकता वाले बीजों, सिंचाई और उर्वरकों से कृषि उत्पादन में हुई भारी वृद्धि।', englishMeaning:'1960s agricultural transformation in India using HYV seeds, irrigation and fertilizers.', category:'History', memoryHint:'Green Revolution = हरियाली + क्रांति = खाद्यान्न उत्पादन में क्रांति', visualEmoji:'🌾🚜', example:'M.S. Swaminathan को इसका जनक माना जाता है।', confusedWith:['White Revolution'], difference:'Green Revolution = अनाज उत्पादन, White Revolution = दूध उत्पादन (Operation Flood)', examNote:'पंजाब-हरियाणा में सबसे ज्यादा प्रभाव।', tags:['agriculture','history']}),
    makeTerm({term:'Monsoon', hindiMeaning:'मौसमी हवाएं जो दिशा बदलती हैं और भारत में गर्मी के बाद भारी वर्षा लाती हैं।', englishMeaning:'Seasonal winds that reverse direction, bringing heavy rainfall after summer in India.', category:'Geography', memoryHint:'Monsoon = मौसम + हवा दिशा बदले = बारिश', visualEmoji:'🌧️🌬️', example:'Southwest Monsoon जून में केरल पहुँचता है।', confusedWith:['El Niño'], difference:'Monsoon = मौसमी हवा प्रणाली, El Niño = इसे प्रभावित करने वाली समुद्री घटना', examNote:'भारतीय कृषि की "backbone" कहा जाता है।', tags:['climate']}),
    makeTerm({term:'Biodiversity', hindiMeaning:'किसी क्षेत्र में पाए जाने वाले जीवों, पौधों और सूक्ष्मजीवों की विविधता।', englishMeaning:'The variety of living organisms — plants, animals and microbes — in a given area.', category:'Environment', memoryHint:'Biodiversity = Bio (जीवन) + Diversity (विविधता)', visualEmoji:'🐘🌿🦋', example:'Western Ghats एक Biodiversity Hotspot है।', confusedWith:[], difference:'', examNote:'भारत में 4 Biodiversity Hotspots हैं।', tags:['ecology']})
  ];
  const existing = loadTerms();
  saveTerms(existing.concat(demo));
  localStorage.setItem(SEEDED_KEY, '1');
}

/* =========================================================
   SRS: status calculation
   ========================================================= */
function computeStatus(term){
  if(term.wrongStreak >= 3) return 'WEAK';
  if(term.goodStreak >= 5) return 'MASTERED';
  if(term.reviewCount === 0) return 'NEW';
  if(term.reviewCount < 3) return 'LEARNING';
  return 'REVIEW';
}

/* Rating: 0=forgot, 1=hard, 2=almost, 3=easy */
function applySRS(term, rating){
  const ts = nowTs();
  term.reviewCount++;
  term.lastReviewed = ts;

  if(rating === 0){ // भूल गया
    term.goodStreak = 0;
    term.hardStreak = 0;
    term.wrongStreak++;
    term.wrongCount++;
    term.nextReview = addMinutes(ts, AGAIN_MINUTES);
  } else if(rating === 1){ // थोड़ा याद था
    term.goodStreak = 0;
    term.hardStreak = Math.min(term.hardStreak + 1, HARD_STEPS_DAYS.length - 1);
    term.wrongStreak = Math.max(0, term.wrongStreak - 1);
    term.nextReview = addDays(ts, HARD_STEPS_DAYS[term.hardStreak]);
  } else if(rating === 2){ // लगभग सही
    term.goodStreak++;
    term.hardStreak = 0;
    term.wrongStreak = 0;
    term.correctCount++;
    const idx = Math.min(term.goodStreak - 1, ALMOST_STEPS_DAYS.length - 1);
    term.nextReview = addDays(ts, ALMOST_STEPS_DAYS[idx]);
  } else { // बिल्कुल सही
    term.goodStreak++;
    term.hardStreak = 0;
    term.wrongStreak = 0;
    term.correctCount++;
    const idx = Math.min(term.goodStreak - 1, EASY_STEPS_DAYS.length - 1);
    term.nextReview = addDays(ts, EASY_STEPS_DAYS[idx]);
  }
  term.status = computeStatus(term);
  const wasLeech = term.leech;
  term.leech = term.wrongCount >= 4;
  term._justBecameLeech = !wasLeech && term.leech;
  return term;
}

/* =========================================================
   APP STATE
   ========================================================= */
const state = {
  terms: [],
  currentView: 'home',
  editingId: null,
  quickAdd: true,
  filter: 'All',
  search: '',
  session: { queue: [], index: 0, correct: 0, needsWork: 0, weakAtEnd: new Set(), currentQuestion: null }
};

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  seedDemoData();
  state.terms = loadTerms();
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  wireNav();
  wireForm();
  wireTermsList();
  wireRevision();
  refreshStreakChip();
  showView('home');

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
});

/* =========================================================
   THEME
   ========================================================= */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggleBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
});

/* =========================================================
   NAVIGATION
   ========================================================= */
function wireNav(){
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-nav');
      const mode = btn.getAttribute('data-mode');
      showView(view);
      if(view === 'revision') startRevisionMode(mode || 'due');
    });
  });
  document.getElementById('randomTermBtn').addEventListener('click', () => {
    if(state.terms.length === 0){ toast('पहले कुछ terms add करें'); return; }
    showView('revision');
    startRevisionMode('random');
  });
  document.getElementById('startRevisionBtn').addEventListener('click', () => {
    showView('revision');
    startRevisionMode('due');
  });
}
function showView(view){
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-nav') === view));
  if(view === 'home') renderDashboard();
  if(view === 'terms') renderTermsList();
  if(view === 'progress') renderProgress();
  window.scrollTo(0,0);
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(){
  const due = state.terms.filter(t => t.nextReview <= endOfToday());
  const weak = state.terms.filter(t => t.status === 'WEAK');
  const mastered = state.terms.filter(t => t.status === 'MASTERED');

  document.getElementById('statDue').textContent = due.length;
  document.getElementById('statWeak').textContent = weak.length;
  document.getElementById('statMastered').textContent = mastered.length;
  document.getElementById('statTotal').textContent = state.terms.length;

  document.getElementById('dcDue').textContent = due.length + ' due';
  document.getElementById('dcWeak').textContent = weak.length + ' weak';
  document.getElementById('dcTotal').textContent = state.terms.length + ' terms';

  const sub = document.getElementById('startRevisionSub');
  sub.textContent = due.length > 0 ? `आज ${due.length} terms revise करनी हैं।` : 'आज कोई revision due नहीं है';
  refreshStreakChip();
}
function refreshStreakChip(){
  const s = getStreak();
  document.getElementById('streakCount').textContent = s.count || 0;
}

/* =========================================================
   ADD / EDIT TERM FORM
   ========================================================= */
function wireForm(){
  document.getElementById('quickAddToggle').addEventListener('click', () => {
    state.quickAdd = !state.quickAdd;
    document.querySelectorAll('.more-field').forEach(f => f.style.display = state.quickAdd ? 'none' : 'block');
    document.getElementById('quickAddToggle').textContent = state.quickAdd ? 'Full Form' : 'Quick Add';
  });
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
  document.getElementById('fImageUrl').addEventListener('input', updateImagePreview);

  document.getElementById('termForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const term = document.getElementById('fTerm').value.trim();
    const hindi = document.getElementById('fHindi').value.trim();
    if(!term || !hindi){ toast('Term और Hindi Meaning जरूरी हैं'); return; }

    const data = {
      term,
      hindiMeaning: hindi,
      englishMeaning: document.getElementById('fEnglish').value.trim(),
      category: document.getElementById('fCategory').value,
      memoryHint: document.getElementById('fMemoryHint').value.trim(),
      explanation: document.getElementById('fExplanation').value.trim(),
      visualEmoji: document.getElementById('fVisual').value.trim(),
      imageUrl: document.getElementById('fImageUrl').value.trim(),
      example: document.getElementById('fExample').value.trim(),
      confusedWith: document.getElementById('fConfusedWith').value.split(',').map(s=>s.trim()).filter(Boolean),
      difference: document.getElementById('fDifference').value.trim(),
      examNote: document.getElementById('fExamNote').value.trim(),
      tags: document.getElementById('fTags').value.split(',').map(s=>s.trim()).filter(Boolean)
    };

    if(state.editingId){
      const idx = state.terms.findIndex(t => t.id === state.editingId);
      if(idx > -1) Object.assign(state.terms[idx], data);
      toast('Term update हो गया।');
    } else {
      state.terms.push(makeTerm(data));
      toast('Term saved successfully.');
    }
    saveTerms(state.terms);
    resetForm();
    showView('terms');
  });
}
function updateImagePreview(){
  const url = document.getElementById('fImageUrl').value.trim();
  const img = document.getElementById('fImagePreview');
  const hint = document.getElementById('fImageHint');
  hint.style.display = 'none';
  if(!url){ img.style.display = 'none'; img.src = ''; return; }
  img.onload = () => { img.style.display = 'block'; };
  img.onerror = () => { img.style.display = 'none'; hint.style.display = 'block'; };
  img.src = url;
}
function resetForm(){
  document.getElementById('termForm').reset();
  document.getElementById('termId').value = '';
  state.editingId = null;
  document.getElementById('addFormTitle').textContent = 'नया Term जोड़ें';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('formMsg').textContent = '';
  updateImagePreview();
}
function editTerm(id){
  const t = state.terms.find(x => x.id === id);
  if(!t) return;
  state.editingId = id;
  document.getElementById('termId').value = id;
  document.getElementById('fTerm').value = t.term;
  document.getElementById('fHindi').value = t.hindiMeaning;
  document.getElementById('fEnglish').value = t.englishMeaning;
  document.getElementById('fCategory').value = t.category;
  document.getElementById('fMemoryHint').value = t.memoryHint;
  document.getElementById('fExplanation').value = t.explanation;
  document.getElementById('fVisual').value = t.visualEmoji;
  document.getElementById('fImageUrl').value = t.imageUrl;
  document.getElementById('fExample').value = t.example;
  document.getElementById('fConfusedWith').value = (t.confusedWith || []).join(', ');
  document.getElementById('fDifference').value = t.difference;
  document.getElementById('fExamNote').value = t.examNote;
  document.getElementById('fTags').value = (t.tags || []).join(', ');
  updateImagePreview();

  state.quickAdd = false;
  document.querySelectorAll('.more-field').forEach(f => f.style.display = 'block');
  document.getElementById('quickAddToggle').textContent = 'Quick Add';
  document.getElementById('addFormTitle').textContent = 'Term Edit करें';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  showView('add');
}
function deleteTerm(id){
  if(!confirm('क्या आप यह term delete करना चाहते हैं?')) return;
  state.terms = state.terms.filter(t => t.id !== id);
  saveTerms(state.terms);
  renderTermsList();
  toast('Term delete हो गया।');
}

/* =========================================================
   ALL TERMS: search, filter, list, import/export
   ========================================================= */
function wireTermsList(){
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderTermsList();
  });
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.getAttribute('data-filter');
      renderTermsList();
    });
  });
  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importBackup);
}
function matchesFilter(t){
  switch(state.filter){
    case 'All': return true;
    case 'Due Today': return t.nextReview <= endOfToday();
    case 'Weak': return t.status === 'WEAK';
    case 'Learning': return t.status === 'LEARNING' || t.status === 'NEW';
    case 'Mastered': return t.status === 'MASTERED';
    default: return t.category === state.filter;
  }
}
function matchesSearch(t){
  if(!state.search) return true;
  const hay = [t.term, t.hindiMeaning, t.englishMeaning, t.category, (t.tags||[]).join(' ')].join(' ').toLowerCase();
  return hay.includes(state.search);
}
function renderTermsList(){
  const list = document.getElementById('termsList');
  const items = state.terms.filter(t => matchesFilter(t) && matchesSearch(t))
    .sort((a,b) => a.nextReview - b.nextReview);

  if(items.length === 0){
    list.innerHTML = `<div class="empty-state"><span class="empty-emoji">📭</span><h3>कोई term नहीं मिला</h3><p>Filter बदलें या नया term add करें।</p></div>`;
    return;
  }
  list.innerHTML = items.map(t => `
    <div class="term-card status-${t.status}">
      <div class="tc-top">
        <span class="tc-title">${t.visualEmoji ? t.visualEmoji + ' ' : ''}${escapeHtml(t.term)}</span>
        <span class="tc-badge">${t.status}</span>
      </div>
      ${t.leech ? `<div class="leech-banner">🩹 बार-बार भूल रहे हैं — नया Memory Hint लिखने की कोशिश करें</div>` : ''}
      ${t.imageUrl ? `<img src="${escapeHtml(t.imageUrl)}" class="tc-image" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <p class="tc-meaning">${escapeHtml(t.hindiMeaning)}</p>
      <div class="tc-meta">
        <span class="tc-cat">${escapeHtml(t.category)}</span>
        <span>Next: ${fmtDate(t.nextReview)}</span>
        <span>✔ ${t.correctCount} · ✘ ${t.wrongCount}</span>
      </div>
      <div class="tc-actions">
        <button data-edit="${t.id}">✏️ Edit</button>
        <button data-del="${t.id}">🗑️ Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editTerm(b.getAttribute('data-edit'))));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteTerm(b.getAttribute('data-del'))));
}
function exportBackup(){
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), terms: state.terms }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yaad-rakh-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup export हो गया।');
}
function importBackup(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.terms) ? parsed.terms : null);
      if(!incoming) throw new Error('invalid format');
      let count = 0;
      incoming.forEach(raw => {
        if(!raw || !raw.term) return;
        state.terms.push(makeTerm({
          term: raw.term, hindiMeaning: raw.hindiMeaning || '', englishMeaning: raw.englishMeaning || '',
          category: CATEGORIES.includes(raw.category) ? raw.category : 'Miscellaneous',
          memoryHint: raw.memoryHint || '', explanation: raw.explanation || '', visualEmoji: raw.visualEmoji || '',
          imageUrl: raw.imageUrl || '', example: raw.example || '', confusedWith: raw.confusedWith || [],
          difference: raw.difference || '', examNote: raw.examNote || '', tags: raw.tags || []
        }));
        count++;
      });
      saveTerms(state.terms);
      renderTermsList();
      toast(`${count} terms import हो गए।`);
    }catch(err){
      toast('⚠️ Invalid JSON file — import नहीं हो सका।');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

/* =========================================================
   REVISION ENGINE
   ========================================================= */
function wireRevision(){
  document.getElementById('thinkBtn').addEventListener('click', () => {
    document.getElementById('thinkBtn').style.display = 'none';
    document.getElementById('showAnswerRow').style.display = 'block';
  });
  document.getElementById('showAnswerBtn').addEventListener('click', revealAnswer);
  document.getElementById('showHintBtn').addEventListener('click', () => {
    document.getElementById('visualHint').style.display = 'block';
    document.getElementById('showHintBtn').style.display = 'none';
  });
  document.querySelectorAll('.rate-btn').forEach(b => {
    b.addEventListener('click', () => rateCurrentCard(parseInt(b.getAttribute('data-rate'), 10)));
  });
  document.getElementById('backHomeBtn').addEventListener('click', () => showView('home'));
}

function startRevisionMode(mode){
  let pool;
  if(mode === 'weak'){
    pool = state.terms.filter(t => t.status === 'WEAK');
  } else if(mode === 'confusion'){
    pool = state.terms.filter(t => (t.confusedWith || []).length > 0);
  } else if(mode === 'random'){
    pool = state.terms.length ? [pickRandom(state.terms)] : [];
  } else { // due
    pool = state.terms.filter(t => t.nextReview <= endOfToday());
  }

  document.getElementById('sessionComplete').style.display = 'none';

  if(pool.length === 0){
    document.getElementById('revisionRunner').style.display = 'none';
    document.getElementById('revisionEmpty').style.display = 'block';
    return;
  }
  document.getElementById('revisionEmpty').style.display = 'none';
  document.getElementById('revisionRunner').style.display = 'block';

  const ordered = (mode === 'confusion') ? shuffle(pool) : interleaveByCategory(pool);

  state.session = {
    queue: ordered.map(t => t.id),
    mode,
    index: 0,
    correct: 0,
    needsWork: 0,
    weakAtEnd: new Set(),
    currentQuestion: null
  };
  renderCard();
}

function currentTerm(){
  const id = state.session.queue[state.session.index];
  return state.terms.find(t => t.id === id);
}

function generateQuestion(term){
  const inConfusionMode = state.session.mode === 'confusion' && (term.confusedWith||[]).length > 0;
  let forceType = null;
  if(inConfusionMode){
    forceType = Math.random() < 0.5 ? 'odd' : 'diff';
    // odd-one-out ke liye kam se kam 1 sibling term database me hona chahiye
    if(forceType === 'odd'){
      const siblings = term.confusedWith.map(findTermByName).filter(Boolean);
      if(siblings.length === 0) forceType = 'diff';
    }
  }
  const options = ['t2m','m2t','mcq'];
  if((term.confusedWith||[]).length > 0) options.push('diff');
  // Rotation: pichli baar jis tarike se poocha tha, is baar usse alag tarika try karo
  // — isse ek hi term kai alag-alag tarikon se practice hota hai.
  let pool = options.filter(o => o !== term.lastQuestionType);
  if(pool.length === 0) pool = options;
  const type = forceType || pickRandom(pool);

  if(type === 'odd'){
    const siblings = term.confusedWith.map(findTermByName).filter(Boolean);
    const group = shuffle([term, ...siblings]).slice(0, 3);
    const otherCatPool = state.terms.filter(t => t.category !== term.category && !group.includes(t));
    const distractor = otherCatPool.length ? pickRandom(otherCatPool) : pickRandom(state.terms.filter(t => !group.includes(t)));
    const oddOptions = shuffle([...group, distractor]);
    return {
      type: 'mcq', kind: 'odd', category: term.category,
      big: group.map(t => t.visualEmoji || '❔').join('  '),
      sub: 'इनमें से कौनसा term इस group से संबंधित नहीं है?',
      options: oddOptions.map(t => t.term),
      correctAnswer: distractor.term,
      answerMain: `${distractor.term} अलग है — बाकी सब आपस में जुड़े/confuse होने वाले terms हैं।`,
      answerExtra: (term.difference || buildExtra(term))
    };
  }

  if(type === 't2m'){
    return {
      type, kind: type, category: term.category,
      big: (term.visualEmoji ? '' : '') + term.term,
      sub: `${term.term} क्या है?`,
      answerMain: term.hindiMeaning + (term.englishMeaning ? `<br><span style="color:var(--ink-soft);font-size:13px;">${escapeHtml(term.englishMeaning)}</span>` : ''),
      answerExtra: buildExtra(term)
    };
  }
  if(type === 'm2t'){
    return {
      type, kind: type, category: term.category,
      big: '❓',
      sub: `यह किस term से संबंधित है — "${term.hindiMeaning}"`,
      answerMain: term.term,
      answerExtra: buildExtra(term)
    };
  }
  if(type === 'diff' && (term.confusedWith||[]).length){
    const other = term.confusedWith[0];
    return {
      type, kind: type, category: term.category,
      big: `${term.term} vs ${other}`,
      sub: `इन दोनों में मुख्य अंतर क्या है?`,
      answerMain: term.difference || term.hindiMeaning,
      answerExtra: buildExtra(term)
    };
  }
  // mcq (quick recognition)
  const sameCat = state.terms.filter(t => t.id !== term.id && t.category === term.category);
  const others = sameCat.length >= 3 ? sameCat : state.terms.filter(t => t.id !== term.id);
  const distractors = shuffle(others).slice(0,3).map(t => t.term);
  const opts = shuffle([term.term, ...distractors]);
  return {
    type: 'mcq', kind: 'mcq', category: term.category,
    big: term.visualEmoji || '🔎',
    sub: term.hindiMeaning,
    options: opts,
    correctAnswer: term.term,
    answerMain: term.term,
    answerExtra: buildExtra(term)
  };
}
function buildExtra(term){
  let parts = [];
  if(term.explanation) parts.push(term.explanation);
  if(term.example) parts.push('उदाहरण: ' + term.example);
  if(term.difference) parts.push('अंतर: ' + term.difference);
  if(term.examNote) parts.push('📌 ' + term.examNote);
  return parts.join('\n\n');
}

function renderCard(){
  const term = currentTerm();
  const q = generateQuestion(term);
  state.session.currentQuestion = q;

  document.getElementById('revProgressBar').style.width = ((state.session.index) / state.session.queue.length * 100) + '%';
  document.getElementById('revCount').textContent = `${state.session.index + 1} / ${state.session.queue.length}`;

  document.getElementById('fcCategory').textContent = q.category;
  document.getElementById('fcQuestion').textContent = q.big;
  document.getElementById('fcSubQuestion').textContent = q.sub;

  document.getElementById('answerBox').style.display = 'none';
  document.getElementById('ratingRow').style.display = 'none';
  document.getElementById('recallBox').value = '';
  document.getElementById('visualHint').style.display = 'none';
  document.getElementById('visualHint').innerHTML = (term.visualEmoji ? `<div>${escapeHtml(term.visualEmoji)}</div>` : '') +
    (term.imageUrl ? `<img src="${escapeHtml(term.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '');
  document.getElementById('showHintBtn').style.display = (term.visualEmoji || term.imageUrl) ? 'inline-block' : 'none';

  const mcqBox = document.getElementById('mcqOptions');
  mcqBox.innerHTML = '';
  if(q.type === 'mcq'){
    mcqBox.style.display = 'flex';
    document.getElementById('thinkBtn').style.display = 'none';
    document.getElementById('showAnswerRow').style.display = 'none';
    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'mcq-opt';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        mcqBox.querySelectorAll('.mcq-opt').forEach(b => b.disabled = true);
        btn.classList.add(opt === q.correctAnswer ? 'correct' : 'wrong');
        if(opt !== q.correctAnswer){
          [...mcqBox.children].find(b => b.textContent === q.correctAnswer)?.classList.add('correct');
        }
        revealAnswer();
      });
      mcqBox.appendChild(btn);
    });
  } else {
    mcqBox.style.display = 'none';
    document.getElementById('thinkBtn').style.display = 'block';
    document.getElementById('showAnswerRow').style.display = 'none';
  }
}

function revealAnswer(){
  const q = state.session.currentQuestion;
  document.getElementById('answerMain').innerHTML = q.answerMain;
  document.getElementById('answerExtra').textContent = q.answerExtra;
  document.getElementById('answerBox').style.display = 'block';
  document.getElementById('showAnswerRow').style.display = 'none';
  document.getElementById('ratingRow').style.display = 'block';
}

function rateCurrentCard(rating){
  const term = currentTerm();
  term.lastQuestionType = state.session.currentQuestion.kind || state.session.currentQuestion.type;
  applySRS(term, rating);
  saveTerms(state.terms);

  if(rating >= 2) state.session.correct++;
  else state.session.needsWork++;
  if(term.status === 'WEAK') state.session.weakAtEnd.add(term.id);

  bumpStreak();

  const justBecameLeech = term._justBecameLeech;
  term._justBecameLeech = false;

  state.session.index++;
  if(state.session.index >= state.session.queue.length){
    finishSession();
  } else if(justBecameLeech){
    toast(`⚠️ "${term.term}" 4 बार भूल चुके — Edit करके एक नया Memory Hint try करें`);
    setTimeout(renderCard, 900);
  } else {
    renderCard();
  }
}

function finishSession(){
  document.getElementById('revisionRunner').style.display = 'none';
  document.getElementById('sessionComplete').style.display = 'block';
  const total = state.session.correct + state.session.needsWork;
  const retention = total ? Math.round((state.session.correct/total)*100) : 0;
  document.getElementById('scCorrect').textContent = state.session.correct;
  document.getElementById('scNeedsWork').textContent = state.session.needsWork;
  document.getElementById('scRetention').textContent = retention + '%';
  document.getElementById('scWeak').textContent = state.session.weakAtEnd.size;
}

function bumpStreak(){
  const s = getStreak();
  const oneDay = 86400000;
  const today = startOfDay(nowTs());
  const weekNum = Math.floor(today / (7*oneDay));
  if(s.freezeWeek !== weekNum){ s.freezes = 1; s.freezeWeek = weekNum; } // हर हफ्ते 1 नया freeze

  const last = s.lastDate ? startOfDay(s.lastDate) : null;
  if(last === today){ saveStreak(s); return; } // aaj already count ho chuka

  if(last === today - oneDay){
    s.count = (s.count || 0) + 1;
  } else if(last === today - 2*oneDay && s.freezes > 0){
    // 1 din miss hua, par freeze available hai — streak bachegi
    s.count = (s.count || 0) + 1;
    s.freezes--;
    toast('🧊 Streak Freeze इस्तेमाल हुआ — streak बच गई!');
  } else {
    s.count = 1;
  }
  s.lastDate = nowTs();
  saveStreak(s);
  refreshStreakChip();
}

/* =========================================================
   PROGRESS PAGE
   ========================================================= */
function renderProgress(){
  const total = state.terms.length;
  const mastered = state.terms.filter(t => t.status === 'MASTERED').length;
  const learning = state.terms.filter(t => t.status === 'LEARNING' || t.status === 'NEW').length;
  const weak = state.terms.filter(t => t.status === 'WEAK').length;
  const due = state.terms.filter(t => t.nextReview <= endOfToday()).length;

  document.getElementById('pTotal').textContent = total;
  document.getElementById('pMastered').textContent = mastered;
  document.getElementById('pLearning').textContent = learning;
  document.getElementById('pWeak').textContent = weak;
  document.getElementById('pDue').textContent = due;
  document.getElementById('pStreak').textContent = getStreak().count || 0;
  const freezeVal = getStreak().freezes ?? 1;
  document.getElementById('pFreeze').textContent = `· 🧊 ${freezeVal} freeze बचा है`;

  const catBox = document.getElementById('categoryBars');
  catBox.innerHTML = CATEGORIES.map(cat => {
    const inCat = state.terms.filter(t => t.category === cat);
    if(inCat.length === 0) return '';
    const pct = Math.round((inCat.filter(t => t.status === 'MASTERED').length / inCat.length) * 100);
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label"><span>${cat}</span><span>${pct}%</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('') || '<p style="color:var(--ink-soft);font-size:13px;">अभी कोई data नहीं है।</p>';
}
