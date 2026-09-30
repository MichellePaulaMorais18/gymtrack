/* ══════════════════════════════════
   FIREBASE — INIT + AUTH + DATA
══════════════════════════════════ */
firebase.initializeApp({
  apiKey: "AIzaSyBH7h6g0yB1DQe2id_4T8T-ARsFd6-r2vk",
  authDomain: "gymtrack-fe4f3.firebaseapp.com",
  databaseURL: "https://gymtrack-fe4f3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gymtrack-fe4f3",
  storageBucket: "gymtrack-fe4f3.firebasestorage.app",
  messagingSenderId: "853105062727",
  appId: "1:853105062727:web:330ef0eb5b21e5b6421262"
});
const auth = firebase.auth();
const db   = firebase.database();

// Cache em memória (fonte de verdade para leituras síncronas)
let cache = {
  exercises: [],  // [{id, name, type}]
  sessions:  [],  // [{id, date:'YYYY-MM-DD', entries:[{exId, series:[[{w,r},...], ...]}]}]
  foods:     [],  // [{id, name, portion, kcal, prot, carb, gord, fib, acuc, sodio}] — valores por porção
  nutrition: {},  // {'YYYY-MM-DD': {water: ml, meals: [{id, name, items:[{foodId, qty}]}]}}
  settings:  {},  // {waterGoal: ml}
  profile:   {},  // {sex:'F'|'M', birthYear, height (cm), activity (fator do dia a dia)}
  weights:   {},  // {'YYYY-MM-DD': {w: kg, bf?: % gordura, ...demais métricas de BIO_METRICS}}
  templates: []   // refeições prontas: [{id, name, items:[{foodId, qty}]}]
};
let currentUid = null;

function userRef() { return db.ref('users/' + currentUid + '/app'); }

async function loadFromCloud() {
  try {
    const snap = await userRef().get();
    const data = snap.val() || {};
    Object.keys(data).forEach(key => {
      if (cache[key] !== undefined) cache[key] = data[key];
    });
  } catch(e) { console.warn('Database load error', e); }
}

function saveToCloud(key) {
  if (!currentUid) return;
  userRef().child(key).set(cache[key]).catch(e => console.warn('Save error', e));
}

function signInGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(e => alert('Erro ao entrar: ' + e.message));
}

function signOut() {
  if (!confirm('Deseja sair da sua conta?')) return;
  auth.signOut();
}

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUid = user.uid;
    document.getElementById('login-screen').classList.remove('show');
    document.getElementById('app-loading').classList.add('show');
    await loadFromCloud();
    document.getElementById('user-avatar').src = user.photoURL || '';
    document.getElementById('app-loading').classList.remove('show');
    document.getElementById('app').style.display = 'block';
    showTab(currentTab);
  } else {
    currentUid = null;
    cache = { exercises: [], sessions: [], foods: [], nutrition: {}, settings: {}, profile: {}, weights: {}, templates: [] };
    document.getElementById('app').style.display = 'none';
    document.getElementById('app-loading').classList.remove('show');
    document.getElementById('login-screen').classList.add('show');
  }
});

/* ══════════════════════════════════
   DARK MODE
══════════════════════════════════ */
function toggleDark() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  document.getElementById('dark-btn').textContent = isDark ? '☀️' : '🌙';
}
if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dark-btn').textContent = '☀️';
  });
}

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDateLong(str) {
  return parseDate(str).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtDateShort(str) {
  return parseDate(str).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function fmtNum(n) { return Number(n) % 1 === 0 ? String(Number(n)) : String(Number(n)).replace('.', ','); }

/* Tipos de exercício:
   - peso   → segmentos {w, r}     (carga × repetições — padrão)
   - tempo  → segmentos {t}        (isometria, em segundos)
   - cardio → segmentos {t, v, i}  (minutos, km/h, % inclinação)
   Série = lista de segmentos. Drop set / intervalo = vários segmentos. */
const EX_TYPES = {
  peso:   { label: '🏋️ Peso × Reps',      icon: '',    newSeg: () => ({ w: 0, r: 0 }) },
  tempo:  { label: '⏱️ Tempo (isometria)', icon: '⏱️ ', newSeg: () => ({ t: 0 }) },
  cardio: { label: '🏃 Cardio (esteira)',  icon: '🏃 ', newSeg: () => ({ t: 0, v: 0, i: 0 }) }
};

function exType(exId) { const e = getExercise(exId); return (e && e.type) || 'peso'; }

function fmtTime(sec) {
  sec = Math.round(Number(sec) || 0);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? m + 'min' + (s ? s + 's' : '') : s + 's';
}

function fmtSerie(serie, type) {
  return serie.map(seg => {
    if (type === 'tempo')  return fmtTime(seg.t);
    if (type === 'cardio') return `${fmtNum(seg.t)}min @ ${fmtNum(seg.v)}km/h${Number(seg.i) ? ' ' + fmtNum(seg.i) + '%' : ''}`;
    return `${seg.r}× ${fmtNum(seg.w)}kg`;
  }).join(' ➜ ');
}

function fmtEntry(entry) {
  const type = exType(entry.exId);
  return entry.series.map(s => fmtSerie(s, type)).join('  |  ');
}

// Métrica de progressão/recorde por tipo
function exMetric(type) {
  if (type === 'tempo') return {
    label: 'Tempo máx',
    value: e => Math.max(...e.series.flat().map(seg => Number(seg.t) || 0)),
    fmt: v => fmtTime(v)
  };
  if (type === 'cardio') return {
    label: 'Distância (km)',
    value: e => e.series.flat().reduce((t, seg) => t + (Number(seg.v) || 0) * (Number(seg.t) || 0) / 60, 0),
    fmt: v => fmtNum(Math.round(v * 100) / 100) + ' km'
  };
  return {
    label: 'Carga máx (kg)',
    value: e => Math.max(...e.series.flat().map(seg => Number(seg.w) || 0)),
    fmt: v => fmtNum(v) + 'kg'
  };
}

function serieVolume(serie) { return serie.reduce((t, seg) => t + (Number(seg.w) * Number(seg.r) || 0), 0); }
function entryVolume(entry) { return entry.series.reduce((t, s) => t + serieVolume(s), 0); }
function sessionVolume(session) { return session.entries.reduce((t, e) => t + entryVolume(e), 0); }

// Tempo total (min) dos exercícios de tempo/cardio de uma sessão
function entryMinutes(entry) {
  const type = exType(entry.exId);
  const total = entry.series.flat().reduce((t, seg) => t + (Number(seg.t) || 0), 0);
  if (type === 'tempo')  return total / 60;
  if (type === 'cardio') return total;
  return 0;
}
function sessionMinutes(session) { return session.entries.reduce((t, e) => t + entryMinutes(e), 0); }

function getExercise(id) { return cache.exercises.find(e => e.id === id); }
function exName(id) { const e = getExercise(id); return e ? e.name : '(excluído)'; }

function getSession(date) { return cache.sessions.find(s => s.date === date); }

function getOrCreateSession(date) {
  let s = getSession(date);
  if (!s) { s = { id: uid(), date, entries: [] }; cache.sessions.push(s); }
  return s;
}

function saveSessions() {
  cache.sessions = cache.sessions.filter(s => s.entries.length > 0);
  saveToCloud('sessions');
}

// Última vez que este exercício foi treinado antes da data atual
function lastEntryFor(exId, beforeDate) {
  const prev = cache.sessions
    .filter(s => s.date < beforeDate && s.entries.some(e => e.exId === exId))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return null;
  return { date: prev.date, entry: prev.entries.find(e => e.exId === exId) };
}

/* ══════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════ */
let currentTab = 'treino';
let currentDate = toDateStr(new Date());
let expandedExId = null;

// Menu lateral em sanfona: grupos → abas [id, ícone, nome]
const NAV = [
  { group: 'Treino', icon: '🏋️', tabs: [
    ['treino', '🏋️', 'Treino do dia'], ['historico', '📅', 'Histórico'], ['exercicios', '📋', 'Exercícios']] },
  { group: 'Alimentação', icon: '🍽️', tabs: [
    ['dieta', '🍽️', 'Dieta do dia'], ['cardapio', '🥗', 'Cardápio']] },
  { group: 'Resultados', icon: '📊', tabs: [
    ['balanco', '🔥', 'Balanço calórico'], ['evolucao', '📆', 'Evolução'], ['corpo', '🧬', 'Composição corporal']] }
];
let navClosed = {};
try { navClosed = JSON.parse(localStorage.getItem('navClosed') || '{}'); } catch (e) {}

function renderDrawer() {
  document.getElementById('drawer-nav').innerHTML = NAV.map(g => {
    const closed = navClosed[g.group];
    return `
      <div class="nav-group">
        <button class="nav-group-head" onclick="toggleNavGroup('${g.group}')">
          <span>${g.icon} ${g.group}</span><span class="chev">${closed ? '▸' : '▾'}</span>
        </button>
        ${closed ? '' : g.tabs.map(([id, icon, label]) => `
          <button class="nav-item ${currentTab === id ? 'active' : ''}" onclick="showTab('${id}')">
            <span>${icon}</span>${label}</button>`).join('')}
      </div>`;
  }).join('');
}

function toggleNavGroup(group) {
  navClosed[group] = !navClosed[group];
  try { localStorage.setItem('navClosed', JSON.stringify(navClosed)); } catch (e) {}
  renderDrawer();
}

function openDrawer()  { renderDrawer(); document.body.classList.add('drawer-open'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); }

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  const info = NAV.flatMap(g => g.tabs).find(t => t[0] === tab);
  document.getElementById('page-title').textContent = info ? `${info[1]} ${info[2]}` : 'GymTrack';
  renderDrawer();
  closeDrawer();
  window.scrollTo(0, 0);
  renderAll();
}

function setDate(dateStr) {
  if (!dateStr) return;
  currentDate = dateStr;
  renderAll();
}

function shiftDate(days) {
  const d = parseDate(currentDate);
  d.setDate(d.getDate() + days);
  currentDate = toDateStr(d);
  renderAll();
}

function renderAll() {
  if (currentTab === 'treino') renderTreino();
  if (currentTab === 'dieta') renderDieta();
  if (currentTab === 'balanco') renderBalanco();
  if (currentTab === 'cardapio') renderCardapio();
  if (currentTab === 'evolucao') renderEvolucao();
  if (currentTab === 'corpo') renderCorpo();
  if (currentTab === 'historico') renderHistorico();
  if (currentTab === 'exercicios') renderExercicios();
}

/* ══════════════════════════════════
   TAB: TREINO
══════════════════════════════════ */
function renderTreino() {
  document.getElementById('treino-date').value = currentDate;
  document.getElementById('date-label').textContent = fmtDateLong(currentDate);

  const session = getSession(currentDate);
  const wrap = document.getElementById('treino-entries');
  const summary = document.getElementById('treino-summary');

  if (!session || session.entries.length === 0) {
    summary.innerHTML = '';
    wrap.innerHTML = `<div class="empty-state"><span class="big">💪</span>
      Nenhum exercício registrado neste dia.<br>Bora treinar!</div>`;
    return;
  }

  const totalSeries = session.entries.reduce((t, e) => t + e.series.length, 0);
  const vol  = sessionVolume(session);
  const mins = sessionMinutes(session);
  summary.innerHTML = `
    <div class="sum-chip"><b>${session.entries.length}</b><small>exercícios</small></div>
    <div class="sum-chip"><b>${totalSeries}</b><small>séries</small></div>
    ${vol  ? `<div class="sum-chip"><b>${fmtNum(vol)} kg</b><small>volume total</small></div>` : ''}
    ${mins ? `<div class="sum-chip"><b>${fmtNum(Math.round(mins))} min</b><small>tempo total</small></div>` : ''}`;

  wrap.innerHTML = session.entries.map((entry, ei) => {
    const last = lastEntryFor(entry.exId, currentDate);
    const lastHtml = last ? `
      <div class="last-hint">
        <span>Último (${fmtDateShort(last.date)}): ${esc(fmtEntry(last.entry))}</span>
        <button class="btn-mini" onclick="repeatLast(${ei})">Repetir</button>
      </div>` : '';

    const type = exType(entry.exId);
    const seriesHtml = entry.series.map((serie, si) => `
      <div class="serie">
        <span class="serie-num">S${si + 1}</span>
        <div class="segs">
          ${serie.map((seg, gi) => `
            <div class="seg">
              ${gi > 0 ? '<span class="seg-arrow">↘</span>' : ''}
              ${segInputs(type, seg, ei, si, gi)}
              ${serie.length > 1 ? `<button class="btn-tiny danger" title="Remover trecho"
                onclick="removeSeg(${ei},${si},${gi})">✕</button>` : ''}
            </div>`).join('')}
        </div>
        <div class="serie-actions">
          <button class="btn-tiny" title="${type === 'peso' ? 'Adicionar carga na mesma série (drop set)' : 'Adicionar intervalo na mesma série'}"
            onclick="addSeg(${ei},${si})">＋</button>
          <button class="btn-tiny danger" title="Remover série"
            onclick="removeSerie(${ei},${si})">🗑</button>
        </div>
      </div>`).join('');

    return `
      <div class="entry-card">
        <div class="entry-head">
          <span class="entry-name">${esc(exName(entry.exId))}</span>
          <button class="btn-del" title="Remover exercício do treino"
            onclick="removeEntry(${ei})">🗑</button>
        </div>
        ${lastHtml}
        ${seriesHtml}
        <button class="btn-add-serie" onclick="addSerie(${ei})">＋ Série</button>
      </div>`;
  }).join('');
}

// Inputs de um segmento conforme o tipo do exercício
function segInputs(type, seg, ei, si, gi) {
  const inp = (field, step, unit, mode) => `
    <input type="number" inputmode="${mode || 'decimal'}" step="${step}" min="0" value="${seg[field] ?? 0}"
      onchange="updSeg(${ei},${si},${gi},'${field}',this.value)"><span class="unit">${unit}</span>`;
  if (type === 'tempo')  return inp('t', 5, 'seg', 'numeric');
  if (type === 'cardio') return inp('t', 1, 'min') + inp('v', 0.5, 'km/h') + inp('i', 0.5, '%&nbsp;incl');
  return inp('w', 0.5, 'kg') + '<span class="unit">×</span>' + inp('r', 1, 'reps', 'numeric');
}

function currentEntries() {
  const s = getSession(currentDate);
  return s ? s.entries : [];
}

function updSeg(ei, si, gi, field, value) {
  const v = parseFloat(String(value).replace(',', '.')) || 0;
  currentEntries()[ei].series[si][gi][field] = v;
  saveSessions(); renderTreino();
}

function addSeg(ei, si) {
  const serie = currentEntries()[ei].series[si];
  serie.push({ ...serie[serie.length - 1] });
  saveSessions(); renderTreino();
}

function removeSeg(ei, si, gi) {
  currentEntries()[ei].series[si].splice(gi, 1);
  saveSessions(); renderTreino();
}

function addSerie(ei) {
  const entry = currentEntries()[ei];
  const lastSerie = entry.series[entry.series.length - 1];
  entry.series.push(lastSerie
    ? lastSerie.map(seg => ({ ...seg }))
    : [EX_TYPES[exType(entry.exId)].newSeg()]);
  saveSessions(); renderTreino();
}

function removeSerie(ei, si) {
  const entry = currentEntries()[ei];
  entry.series.splice(si, 1);
  if (entry.series.length === 0) entry.series.push([EX_TYPES[exType(entry.exId)].newSeg()]);
  saveSessions(); renderTreino();
}

function removeEntry(ei) {
  const entry = currentEntries()[ei];
  if (!confirm(`Remover "${exName(entry.exId)}" deste treino?`)) return;
  getSession(currentDate).entries.splice(ei, 1);
  saveSessions(); renderTreino();
}

function repeatLast(ei) {
  const entry = currentEntries()[ei];
  const last = lastEntryFor(entry.exId, currentDate);
  if (!last) return;
  entry.series = last.entry.series.map(serie => serie.map(seg => ({ ...seg })));
  saveSessions(); renderTreino();
}

/* ══ MODAL: adicionar exercício ao treino ══ */
function openExerciseModal() {
  const inSession = new Set(currentEntries().map(e => e.exId));
  const list = document.getElementById('modal-ex-list');
  if (cache.exercises.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:8px">Você ainda não tem exercícios cadastrados — crie o primeiro abaixo.</p>';
  } else {
    list.innerHTML = cache.exercises.map(ex => `
      <button class="ex-pick ${inSession.has(ex.id) ? 'in-session' : ''}"
        onclick="pickExercise('${ex.id}')">${EX_TYPES[(ex.type || 'peso')].icon}${esc(ex.name)}</button>`).join('');
  }
  document.getElementById('modal-ex-name').value = '';
  document.getElementById('modal-exercise').classList.add('show');
}

function closeExerciseModal() {
  document.getElementById('modal-exercise').classList.remove('show');
}

function pickExercise(exId) {
  if (currentEntries().some(e => e.exId === exId)) return;
  addEntryToSession(exId);
  closeExerciseModal();
}

function addExerciseFromModal(ev) {
  ev.preventDefault();
  const name = document.getElementById('modal-ex-name').value.trim();
  if (!name) return;
  const ex = { id: uid(), name, type: document.getElementById('modal-ex-type').value };
  cache.exercises.push(ex);
  saveToCloud('exercises');
  addEntryToSession(ex.id);
  closeExerciseModal();
}

function addEntryToSession(exId) {
  const session = getOrCreateSession(currentDate);
  // Pré-preenche com o último treino deste exercício, se existir
  const last = lastEntryFor(exId, currentDate);
  const series = last
    ? last.entry.series.map(serie => serie.map(seg => ({ ...seg })))
    : [[EX_TYPES[exType(exId)].newSeg()]];
  session.entries.push({ exId, series });
  saveSessions(); renderTreino();
}

/* ══════════════════════════════════
   TAB: HISTÓRICO
══════════════════════════════════ */
function renderHistorico() {
  const wrap = document.getElementById('historico-list');
  const sessions = [...cache.sessions].sort((a, b) => b.date.localeCompare(a.date));

  if (sessions.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">📅</span>
      Nenhum treino registrado ainda.</div>`;
    return;
  }

  wrap.innerHTML = sessions.map(s => `
    <div class="hist-card">
      <div class="hist-head">
        <div>
          <div class="hist-date">${fmtDateLong(s.date)}</div>
          <div class="hist-vol">${s.entries.length} exercícios · ${fmtNum(sessionVolume(s))} kg de volume</div>
        </div>
        <div class="hist-actions">
          <button class="btn-tiny" title="Abrir para editar" onclick="editSession('${s.date}')">✏️</button>
          <button class="btn-tiny danger" title="Excluir treino" onclick="deleteSession('${s.id}')">🗑</button>
        </div>
      </div>
      ${s.entries.map(e => `<div class="hist-line"><b>${esc(exName(e.exId))}</b> — ${esc(fmtEntry(e))}</div>`).join('')}
    </div>`).join('');
}

function editSession(date) {
  currentDate = date;
  showTab('treino');
}

function deleteSession(id) {
  const s = cache.sessions.find(x => x.id === id);
  if (!confirm(`Excluir o treino de ${fmtDateShort(s.date)}?`)) return;
  cache.sessions = cache.sessions.filter(x => x.id !== id);
  saveToCloud('sessions');
  renderHistorico();
}

/* ══════════════════════════════════
   TAB: EXERCÍCIOS
══════════════════════════════════ */
let progChart = null;

function renderExercicios() {
  const wrap = document.getElementById('exercicios-list');

  if (cache.exercises.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">📋</span>
      Cadastre seus exercícios para acompanhar a evolução.</div>`;
    return;
  }

  wrap.innerHTML = cache.exercises.map(ex => {
    const sessions = cache.sessions
      .filter(s => s.entries.some(e => e.exId === ex.id))
      .sort((a, b) => a.date.localeCompare(b.date));
    const count = sessions.length;
    const lastDate = count ? fmtDateShort(sessions[count - 1].date) : '—';
    const type = ex.type || 'peso';
    const metric = exMetric(type);
    const best = sessions.reduce((m, s) => {
      const e = s.entries.find(x => x.exId === ex.id);
      return Math.max(m, metric.value(e));
    }, 0);

    const expanded = expandedExId === ex.id;
    let detail = '';
    if (expanded) {
      const histHtml = [...sessions].reverse().slice(0, 10).map(s => {
        const e = s.entries.find(x => x.exId === ex.id);
        return `<div class="hist-line"><b>${fmtDateShort(s.date)}</b> — ${esc(fmtEntry(e))}</div>`;
      }).join('') || '<p style="color:var(--muted);font-size:0.85rem">Sem registros ainda.</p>';

      detail = `
        <div class="ex-detail" onclick="event.stopPropagation()">
          ${count >= 2 ? '<canvas id="prog-chart"></canvas>' : ''}
          ${histHtml}
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn-mini" onclick="renameExercise('${ex.id}')">✏️ Renomear</button>
            <button class="btn-mini" style="background:#fee2e2;color:var(--red)"
              onclick="deleteExercise('${ex.id}')">🗑 Excluir</button>
          </div>
        </div>`;
    }

    return `
      <div class="ex-card" onclick="toggleExercise('${ex.id}')">
        <div class="ex-head">
          <div>
            <div class="ex-name">${EX_TYPES[type].icon}${esc(ex.name)}</div>
            <div class="ex-meta">${count} treino${count === 1 ? '' : 's'} · último: ${lastDate}${best ? ` · recorde: ${metric.fmt(best)}` : ''}</div>
          </div>
          <span>${expanded ? '▲' : '▼'}</span>
        </div>
        ${detail}
      </div>`;
  }).join('');

  // Gráfico de progressão (métrica conforme o tipo do exercício)
  if (expandedExId) {
    const canvas = document.getElementById('prog-chart');
    if (canvas) {
      const metric = exMetric(exType(expandedExId));
      const sessions = cache.sessions
        .filter(s => s.entries.some(e => e.exId === expandedExId))
        .sort((a, b) => a.date.localeCompare(b.date));
      const labels = sessions.map(s => fmtDateShort(s.date));
      const data = sessions.map(s => {
        const e = s.entries.find(x => x.exId === expandedExId);
        return Math.round(metric.value(e) * 100) / 100;
      });
      if (progChart) progChart.destroy();
      progChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: metric.label,
            data,
            borderColor: '#ea580c',
            backgroundColor: 'rgba(234,88,12,0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: false } }
        }
      });
    }
  }
}

function toggleExercise(id) {
  expandedExId = (expandedExId === id) ? null : id;
  renderExercicios();
}

function addExercise(ev) {
  ev.preventDefault();
  const input = document.getElementById('new-ex-name');
  const name = input.value.trim();
  if (!name) return;
  cache.exercises.push({ id: uid(), name, type: document.getElementById('new-ex-type').value });
  saveToCloud('exercises');
  input.value = '';
  renderExercicios();
}

function renameExercise(id) {
  const ex = getExercise(id);
  const name = prompt('Novo nome:', ex.name);
  if (!name || !name.trim()) return;
  ex.name = name.trim();
  saveToCloud('exercises');
  renderExercicios();
}

function deleteExercise(id) {
  const used = cache.sessions.some(s => s.entries.some(e => e.exId === id));
  const msg = used
    ? 'Este exercício tem treinos registrados. Excluir mesmo assim? (os registros no histórico serão mantidos)'
    : 'Excluir este exercício?';
  if (!confirm(msg)) return;
  cache.exercises = cache.exercises.filter(e => e.id !== id);
  saveToCloud('exercises');
  if (expandedExId === id) expandedExId = null;
  renderExercicios();
}

/* ══════════════════════════════════
   TAB: DIETA — alimentos, refeições e água
══════════════════════════════════ */
const MEAL_SUGGESTIONS = ['☕ Café da manhã', '🍽️ Almoço', '🥪 Lanche', '🌙 Jantar', '🍎 Ceia'];
let pickerTarget = null;   // {kind:'meal'|'tpl', key} — prato que recebe o alimento escolhido
let editingFoodId = null;

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function getFood(id) { return cache.foods.find(f => f.id === id); }

function dayNutri(date) { return cache.nutrition[date]; }

function getOrCreateDay(date) {
  if (!cache.nutrition[date]) cache.nutrition[date] = { water: 0, meals: [] };
  const day = cache.nutrition[date];
  if (!day.meals) day.meals = [];  // RTDB não guarda listas vazias
  return day;
}

function currentMeals() {
  const day = dayNutri(currentDate);
  return (day && day.meals) ? day.meals : [];
}

function saveNutrition() {
  Object.keys(cache.nutrition).forEach(date => {
    const d = cache.nutrition[date];
    if (!(Number(d.water) || 0) && !(d.meals && d.meals.length)) delete cache.nutrition[date];
  });
  saveToCloud('nutrition');
}

function waterGoal() { return Number(cache.settings && cache.settings.waterGoal) || 2000; }

// Nutrientes guardados por porção de alimento.
// abbr/suffix = linha compacta ("P 31 · Na 70mg"); unit/chip = resumo do dia
const NUTRIENTS = [
  { k: 'kcal',  abbr: '',      suffix: ' kcal', unit: '',   chip: 'kcal'   },
  { k: 'prot',  abbr: 'P ',    suffix: '',      unit: 'g',  chip: 'prot'   },
  { k: 'carb',  abbr: 'C ',    suffix: '',      unit: 'g',  chip: 'carbo'  },
  { k: 'gord',  abbr: 'G ',    suffix: '',      unit: 'g',  chip: 'gord'   },
  { k: 'fib',   abbr: 'F ',    suffix: '',      unit: 'g',  chip: 'fibra'  },
  { k: 'acuc',  abbr: 'Açúc ', suffix: '',      unit: 'g',  chip: 'açúcar' },
  { k: 'sodio', abbr: 'Na ',   suffix: 'mg',    unit: 'mg', chip: 'sódio'  }
];

function zeroMacros() { return Object.fromEntries(NUTRIENTS.map(n => [n.k, 0])); }

// Macros de um item do prato = valores do alimento × quantidade de porções
function itemMacros(item) {
  const f = getFood(item.foodId) || {};
  const q = Number(item.qty) || 0;
  return Object.fromEntries(NUTRIENTS.map(n => [n.k, (Number(f[n.k]) || 0) * q]));
}

function sumMacros(list) {
  return list.reduce((t, m) => {
    NUTRIENTS.forEach(n => t[n.k] += Number(m[n.k]) || 0);
    return t;
  }, zeroMacros());
}

function mealMacros(meal) { return sumMacros((meal.items || []).map(itemMacros)); }
function dayMacros(day)   { return sumMacros((day.meals || []).map(mealMacros)); }

function fmtG(n) { return fmtNum(Math.round(Number(n) * 10) / 10); }

function macroLine(m, skipKcal) {
  return NUTRIENTS.filter(n => !(skipKcal && n.k === 'kcal'))
    .map(n => `${n.abbr}${fmtG(Number(m[n.k]) || 0)}${n.suffix}`)
    .join(' · ');
}

function renderDieta() {
  document.getElementById('dieta-date').value = currentDate;
  document.getElementById('dieta-date-label').textContent = fmtDateLong(currentDate);

  const day = dayNutri(currentDate) || { water: 0, meals: [] };
  const meals = day.meals || [];

  // Resumo do dia
  const summary = document.getElementById('dieta-summary');
  if (meals.length) {
    const t = dayMacros(day);
    summary.innerHTML = NUTRIENTS.map(n => `
      <div class="sum-chip"><b>${fmtG(t[n.k])}${n.unit}</b><small>${n.chip}</small></div>`).join('');
  } else summary.innerHTML = '';

  // Hidratação
  const water = Number(day.water) || 0;
  const goal = waterGoal();
  const pct = Math.min(100, Math.round(water / goal * 100));
  document.getElementById('water-card').innerHTML = `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">💧 Hidratação</span>
        <button class="btn-mini" onclick="setWaterGoal()" title="Alterar meta">meta: ${goal}ml</button>
      </div>
      <div class="water-bar"><div class="water-fill" style="width:${pct}%"></div></div>
      <div class="water-row">
        <b>${water}ml <small class="water-pct">(${pct}%)</small></b>
        <div class="water-btns">
          <button class="btn-mini" onclick="addWater(-200)">−200</button>
          <button class="btn-mini" onclick="addWater(200)">＋200</button>
          <button class="btn-mini" onclick="addWater(300)">＋300</button>
          <button class="btn-mini" onclick="addWater(500)">＋500</button>
        </div>
      </div>
    </div>`;

  // Refeições
  const wrap = document.getElementById('dieta-meals');
  if (!meals.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">🍽️</span>
      Nenhuma refeição registrada neste dia.</div>`;
  } else {
    wrap.innerHTML = meals.map((meal, mi) => `
      <div class="entry-card">
        <div class="entry-head">
          <span class="entry-name">${esc(meal.name)}</span>
          <div class="hist-actions">
            ${(meal.items || []).length ? `<button class="btn-tiny" title="Salvar como refeição pronta" onclick="saveMealAsTemplate(${mi})">💾</button>` : ''}
            <button class="btn-tiny danger" title="Remover refeição" onclick="removeMeal(${mi})">🗑</button>
          </div>
        </div>
        ${plateHtml(meal, 'meal', mi)}
      </div>`).join('');
  }
}

/* ── Editor de prato (refeição do dia ou refeição pronta) ──
   kind 'meal' → key = índice da refeição no dia atual
   kind 'tpl'  → key = id da refeição pronta */
function plateArgs(kind, key) { return kind === 'meal' ? `'meal',${key}` : `'tpl','${key}'`; }

function getPlate(kind, key) {
  const plate = kind === 'meal' ? currentMeals()[key] : cache.templates.find(t => t.id === key);
  if (plate && !plate.items) plate.items = [];  // RTDB não guarda listas vazias
  return plate;
}

function savePlate(kind) {
  if (kind === 'meal') saveNutrition(); else saveToCloud('templates');
  renderAll();
}

function plateHtml(plate, kind, key) {
  const a = plateArgs(kind, key);
  const items = plate.items || [];
  const itemsHtml = items.map((item, ii) => {
    const f = getFood(item.foodId);
    return `
      <div class="meal-item">
        <div class="meal-item-top">
          <input type="number" step="0.5" min="0" inputmode="decimal" value="${item.qty}"
            onchange="updQty(${a},${ii},this.value)">
          <span class="unit">×</span>
          <span class="meal-item-name">${f ? esc(f.name) : '(excluído)'}${f && f.portion ? ` <small>${esc(f.portion)}</small>` : ''}</span>
          <button class="btn-tiny danger" title="Remover do prato" onclick="removePlateItem(${a},${ii})">✕</button>
        </div>
        <div class="meal-item-macros">${macroLine(itemMacros(item))}</div>
      </div>`;
  }).join('');
  const m = mealMacros(plate);
  const totalHtml = items.length
    ? `<div class="meal-total">Total: <b>${fmtG(m.kcal)} kcal</b> · ${macroLine(m, true)}</div>`
    : '<p class="meal-empty">Prato vazio — adicione alimentos.</p>';
  return `${itemsHtml}${totalHtml}
    <button class="btn-add-serie" onclick="openFoodPicker(${a})">＋ Alimento</button>`;
}

/* ── Água ── */
function addWater(ml) {
  const day = getOrCreateDay(currentDate);
  day.water = Math.max(0, (Number(day.water) || 0) + ml);
  saveNutrition(); renderDieta();
}

function setWaterGoal() {
  const v = parseInt(prompt('Meta diária de água (ml):', waterGoal()));
  if (!v || v <= 0) return;
  if (!cache.settings) cache.settings = {};
  cache.settings.waterGoal = v;
  saveToCloud('settings');
  renderDieta();
}

/* ── Refeições ── */
function openMealModal() {
  const tpls = cache.templates;
  document.getElementById('modal-meal-templates').innerHTML = tpls.length ? `
    <p class="modal-label">📋 Refeições prontas</p>
    <div class="pick-list">${tpls.map(t => `
      <button class="ex-pick" onclick="applyTemplate('${t.id}')">${esc(t.name)} <small>${fmtG(mealMacros(t).kcal)}kcal</small></button>`).join('')}
    </div>` : `
    <p class="food-hint">Dica: crie refeições prontas no 🥗 Cardápio (ou salve uma refeição do dia com 💾) para adicioná-las com um toque.</p>`;
  document.getElementById('modal-meal-list').innerHTML = MEAL_SUGGESTIONS.map(n =>
    `<button class="ex-pick" onclick="addMeal('${n}')">${n}</button>`).join('');
  document.getElementById('modal-meal-name').value = '';
  document.getElementById('modal-meal').classList.add('show');
}

function addMeal(name, items) {
  getOrCreateDay(currentDate).meals.push({ id: uid(), name, items: items || [] });
  saveNutrition(); closeModal('modal-meal'); renderDieta();
}

// Copia os itens da refeição pronta — editar o prato do dia não altera o modelo
function applyTemplate(id) {
  const t = cache.templates.find(x => x.id === id);
  if (!t) return;
  addMeal(t.name, (t.items || []).map(it => ({ ...it })));
}

function saveMealAsTemplate(mi) {
  const meal = currentMeals()[mi];
  const name = prompt('Nome da refeição pronta:', meal.name);
  if (!name || !name.trim()) return;
  cache.templates.push({ id: uid(), name: name.trim(), items: (meal.items || []).map(it => ({ ...it })) });
  saveToCloud('templates');
  alert(`"${name.trim()}" salva nas refeições prontas do Cardápio.`);
}

function addMealCustom(ev) {
  ev.preventDefault();
  const name = document.getElementById('modal-meal-name').value.trim();
  if (!name) return;
  addMeal(name);
}

function removeMeal(mi) {
  const meal = currentMeals()[mi];
  if (!confirm(`Remover "${meal.name}" deste dia?`)) return;
  currentMeals().splice(mi, 1);
  saveNutrition(); renderDieta();
}

/* ── Itens do prato ── */
function sortedFoods() { return [...cache.foods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); }

function matchesSearch(text, q) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return norm(text).includes(norm(q));
}

function openFoodPicker(kind, key) {
  pickerTarget = { kind, key };
  document.getElementById('food-search').value = '';
  renderFoodPickerList();
  document.getElementById('modal-food-picker').classList.add('show');
}

function renderFoodPickerList() {
  const q = document.getElementById('food-search').value.trim();
  const foods = sortedFoods().filter(f => !q || matchesSearch(f.name, q));
  document.getElementById('modal-food-list').innerHTML = foods.length
    ? foods.map(f => `
        <button class="ex-pick" onclick="pickFood('${f.id}')">${esc(f.name)} <small>${fmtG(f.kcal || 0)}kcal</small></button>`).join('')
    : `<p class="meal-empty">${cache.foods.length ? 'Nenhum alimento encontrado.' : 'Nenhum alimento cadastrado — crie o primeiro abaixo.'}</p>`;
}

function addToTarget(foodId) {
  if (!pickerTarget) return false;
  const plate = getPlate(pickerTarget.kind, pickerTarget.key);
  if (!plate) return false;
  plate.items.push({ foodId, qty: 1 });
  savePlate(pickerTarget.kind);
  return true;
}

function pickFood(foodId) {
  addToTarget(foodId);
  closeModal('modal-food-picker');
}

function updQty(kind, key, ii, value) {
  getPlate(kind, key).items[ii].qty = parseFloat(String(value).replace(',', '.')) || 0;
  savePlate(kind);
}

function removePlateItem(kind, key, ii) {
  getPlate(kind, key).items.splice(ii, 1);
  savePlate(kind);
}

/* ── Cadastro de alimentos ── */
function openFoodForm(foodId) {
  editingFoodId = foodId;
  const f = foodId ? getFood(foodId) : null;
  document.getElementById('food-form-title').textContent = f ? 'Editar alimento' : 'Novo alimento';
  document.getElementById('ff-name').value = f ? f.name : '';
  document.getElementById('ff-portion').value = f ? (f.portion || '') : '';
  NUTRIENTS.forEach(n => {
    document.getElementById('ff-' + n.k).value = f ? (f[n.k] || 0) : '';
  });
  closeModal('modal-food-picker');
  document.getElementById('modal-food-form').classList.add('show');
}

function saveFoodForm(ev) {
  ev.preventDefault();
  const num = id => parseFloat(String(document.getElementById(id).value).replace(',', '.')) || 0;
  const data = {
    name: document.getElementById('ff-name').value.trim(),
    portion: document.getElementById('ff-portion').value.trim(),
    ...Object.fromEntries(NUTRIENTS.map(n => [n.k, num('ff-' + n.k)]))
  };
  if (!data.name) return;
  if (editingFoodId) {
    Object.assign(getFood(editingFoodId), data);
    saveToCloud('foods');
  } else {
    const food = { id: uid(), ...data };
    cache.foods.push(food);
    saveToCloud('foods');
    addToTarget(food.id);  // se veio do "＋ Alimento" de um prato, já entra nele
  }
  pickerTarget = null;
  closeModal('modal-food-form');
  renderAll();
}

function newFood() { pickerTarget = null; openFoodForm(null); }

function deleteFood(id) {
  const usedIn = items => (items || []).some(it => it.foodId === id);
  const inMeals = Object.values(cache.nutrition).some(d => (d.meals || []).some(m => usedIn(m.items)));
  const inTpls = cache.templates.some(t => usedIn(t.items));
  const msg = inMeals || inTpls
    ? `Este alimento aparece em ${inMeals ? 'refeições registradas' : ''}${inMeals && inTpls ? ' e em ' : ''}${inTpls ? 'refeições prontas' : ''}. Excluir mesmo assim? (onde ele aparece vai mostrar "(excluído)")`
    : 'Excluir este alimento?';
  if (!confirm(msg)) return;
  cache.foods = cache.foods.filter(f => f.id !== id);
  saveToCloud('foods');
  renderAll();
}

/* ══════════════════════════════════
   TAB: CARDÁPIO — alimentos e refeições prontas
══════════════════════════════════ */
let cardapioSub = 'templates';
let expandedTplId = null;

function setCardapioSub(sub) {
  cardapioSub = sub;
  document.querySelectorAll('.seg-tab').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  renderCardapio();
}

function renderCardapio() {
  const wrap = document.getElementById('cardapio-content');
  if (cardapioSub === 'foods') {
    // Mantém a busca digitada entre re-renderizações
    const prev = document.getElementById('foods-search');
    const q = prev ? prev.value : '';
    wrap.innerHTML = `
      <div class="add-form">
        <input type="search" id="foods-search" placeholder="🔍 Buscar alimento..." value="${esc(q)}" oninput="renderFoodsList()">
        <button class="btn-primary" onclick="newFood()">＋ Novo</button>
      </div>
      <div id="foods-list"></div>`;
    renderFoodsList();
    return;
  }

  const tpls = cache.templates;
  wrap.innerHTML = `
    <p class="food-hint">Monte aqui seus pratos padrão (ex.: "Café da manhã padrão") e, na Dieta do dia, adicione com um toque em <b>＋ Adicionar refeição</b>.</p>
    ${tpls.length ? '' : `<div class="empty-state"><span class="big">📋</span>Nenhuma refeição pronta ainda.</div>`}
    ${tpls.map(t => {
      const open = expandedTplId === t.id;
      const m = mealMacros(t);
      return `
        <div class="entry-card">
          <div class="entry-head tpl-head" onclick="toggleTpl('${t.id}')">
            <div>
              <span class="entry-name">${esc(t.name)}</span>
              <div class="ex-meta">${(t.items || []).length} alimento${(t.items || []).length === 1 ? '' : 's'} · ${fmtG(m.kcal)} kcal · P ${fmtG(m.prot)}g</div>
            </div>
            <span>${open ? '▲' : '▼'}</span>
          </div>
          ${open ? `
            <div class="tpl-body">
              ${plateHtml(t, 'tpl', t.id)}
              <div class="tpl-actions">
                <button class="btn-mini" onclick="renameTemplate('${t.id}')">✏️ Renomear</button>
                <button class="btn-mini" onclick="duplicateTemplate('${t.id}')">⧉ Duplicar</button>
                <button class="btn-mini danger-mini" onclick="deleteTemplate('${t.id}')">🗑 Excluir</button>
              </div>
            </div>` : ''}
        </div>`;
    }).join('')}
    <button class="btn-primary btn-block" onclick="newTemplate()">＋ Nova refeição pronta</button>`;
}

function renderFoodsList() {
  const q = document.getElementById('foods-search').value.trim();
  const foods = sortedFoods().filter(f => !q || matchesSearch(f.name, q));
  document.getElementById('foods-list').innerHTML = foods.map(f => `
    <div class="food-row">
      <div class="food-row-info">
        <b>${esc(f.name)}</b> <small>${esc(f.portion || '')}</small>
        <div class="meal-item-macros">${macroLine(f)}</div>
      </div>
      <button class="btn-tiny" title="Editar" onclick="openFoodForm('${f.id}')">✏️</button>
      <button class="btn-tiny danger" title="Excluir" onclick="deleteFood('${f.id}')">🗑</button>
    </div>`).join('') || `<div class="empty-state"><span class="big">🥗</span>
      ${cache.foods.length ? 'Nenhum alimento encontrado.' : 'Nenhum alimento cadastrado ainda.'}</div>`;
}

function toggleTpl(id) { expandedTplId = expandedTplId === id ? null : id; renderCardapio(); }

function newTemplate() {
  const name = prompt('Nome da refeição pronta (ex.: Café da manhã padrão):');
  if (!name || !name.trim()) return;
  const t = { id: uid(), name: name.trim(), items: [] };
  cache.templates.push(t);
  expandedTplId = t.id;
  saveToCloud('templates');
  renderCardapio();
}

function renameTemplate(id) {
  const t = cache.templates.find(x => x.id === id);
  const name = prompt('Novo nome:', t.name);
  if (!name || !name.trim()) return;
  t.name = name.trim();
  saveToCloud('templates');
  renderCardapio();
}

function duplicateTemplate(id) {
  const t = cache.templates.find(x => x.id === id);
  const copy = { id: uid(), name: t.name + ' (cópia)', items: (t.items || []).map(it => ({ ...it })) };
  cache.templates.push(copy);
  expandedTplId = copy.id;
  saveToCloud('templates');
  renderCardapio();
}

function deleteTemplate(id) {
  const t = cache.templates.find(x => x.id === id);
  if (!confirm(`Excluir a refeição pronta "${t.name}"? (as refeições já registradas nos dias não mudam)`)) return;
  cache.templates = cache.templates.filter(x => x.id !== id);
  saveToCloud('templates');
  renderCardapio();
}

/* ══════════════════════════════════
   TAB: BALANÇO — simulação de gasto calórico
══════════════════════════════════ */
// Fator do dia a dia SEM contar a academia (o treino é somado à parte)
const ACTIVITY_LEVELS = [
  { f: 1.2, label: 'Sedentário (trabalho sentado, pouca caminhada)' },
  { f: 1.3, label: 'Levemente ativo (caminha um pouco no dia)' },
  { f: 1.4, label: 'Ativo (fica muito em pé / caminha bastante)' },
  { f: 1.5, label: 'Muito ativo (trabalho físico pesado)' }
];
const KCAL_PER_KG = 7700;   // energia aproximada de 1 kg de gordura corporal
const SET_MIN     = 3;      // min por série de musculação (execução + descanso)
const DROP_MIN    = 0.75;   // min extra por carga adicional (drop set)
const MET_PESO    = 5;
const MET_TEMPO   = 4;
const MET_CARDIO_SEM_VEL = 6;

let balPeriod = 7;       // aba Balanço: 7 | 30 dias
let evoPeriod = 'mes';   // aba Evolução: 'mes' | 'ano'
function activePeriod() { return currentTab === 'evolucao' ? evoPeriod : balPeriod; }
let profileOpen = false;
let balChart = null;

function profileComplete() {
  const p = cache.profile || {};
  return p.sex && p.birthYear && p.height && p.activity;
}

// Peso mais recente até a data (ou a primeira pesagem, se todas forem depois)
function weightOn(date) {
  const dates = Object.keys(cache.weights || {}).sort();
  if (!dates.length) return null;
  const before = dates.filter(d => d <= date);
  const d = before.length ? before[before.length - 1] : dates[0];
  return { date: d, ...cache.weights[d] };
}

// Taxa metabólica basal — Mifflin-St Jeor
function bmr(kg, date) {
  const p = cache.profile;
  const age = Number(date.slice(0, 4)) - Number(p.birthYear);
  return 10 * kg + 6.25 * Number(p.height) - 5 * age + (p.sex === 'M' ? 5 : -161);
}

// kcal líquidas (acima do repouso) de um MET durante N minutos
function metKcal(met, kg, min) { return Math.max(0, met - 1) * 3.5 * kg / 200 * min; }

// Esteira — equações do ACSM (caminhada < 8 km/h, corrida ≥ 8 km/h)
function cardioKcal(seg, kg) {
  const min = Number(seg.t) || 0, v = Number(seg.v) || 0, g = (Number(seg.i) || 0) / 100;
  if (!v) return metKcal(MET_CARDIO_SEM_VEL, kg, min);
  const s = v * 1000 / 60;  // m/min
  const vo2 = v < 8 ? 0.1 * s + 1.8 * s * g : 0.2 * s + 0.9 * s * g;  // VO2 líquido (sem o repouso)
  return vo2 * kg / 1000 * 5 * min;
}

function entryKcal(entry, kg) {
  const type = exType(entry.exId);
  if (type === 'cardio') return entry.series.flat().reduce((t, seg) => t + cardioKcal(seg, kg), 0);
  if (type === 'tempo') {
    const min = entry.series.flat().reduce((t, seg) => t + (Number(seg.t) || 0), 0) / 60 + entry.series.length;
    return metKcal(MET_TEMPO, kg, min);
  }
  const extras = entry.series.reduce((t, s) => t + Math.max(0, s.length - 1), 0);
  return metKcal(MET_PESO, kg, entry.series.length * SET_MIN + extras * DROP_MIN);
}

// Balanço de um dia: ingerido, gasto (TMB + dia a dia + treino) e saldo
function dayBalance(date) {
  const wInfo = weightOn(date);
  if (!wInfo || !profileComplete()) return null;
  const kg = Number(wInfo.w);
  const basal = bmr(kg, date);
  const neat = basal * (Number(cache.profile.activity) - 1);
  const session = getSession(date);
  const parts = session ? session.entries.map(e => ({ name: exName(e.exId), kcal: entryKcal(e, kg) })) : [];
  const treino = parts.reduce((t, p) => t + p.kcal, 0);
  const day = dayNutri(date);
  const meals = (day && day.meals) || [];
  const logged = meals.some(m => (m.items || []).length);
  const intake = logged ? dayMacros(day) : null;
  const gasto = basal + neat + treino;
  return {
    kg, basal, neat, treino, parts, gasto, logged, trained: parts.length > 0,
    kcal: intake ? intake.kcal : 0, prot: intake ? intake.prot : 0,
    saldo: intake ? intake.kcal - gasto : null
  };
}

function periodDates(endDate, days) {
  const out = [];
  const d = parseDate(endDate);
  d.setDate(d.getDate() - days + 1);
  for (let i = 0; i < days; i++) { out.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function fmtKcal(n) { return Math.round(n).toLocaleString('pt-BR'); }
function fmtSigned(n, dec) {
  const v = dec ? Math.round(n * 10 ** dec) / 10 ** dec : Math.round(n);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + (dec ? fmtNum(Math.abs(v)) : Math.abs(v).toLocaleString('pt-BR'));
}

function renderBalanco() {
  document.getElementById('bal-date').value = currentDate;
  document.getElementById('bal-date-label').textContent = fmtDateLong(currentDate);
  const wrap = document.getElementById('bal-content');

  if (!profileComplete()) {
    wrap.innerHTML = `
      <div class="bal-note">Para simular seu gasto calórico, preencha seu perfil e registre seu peso. 👇</div>
      ${profileCardHtml(true)}
      ${weightCardHtml()}`;
    return;
  }
  if (!weightOn(currentDate)) {
    wrap.innerHTML = `
      <div class="bal-note">Registre seu peso para começar a simulação. 👇</div>
      ${weightCardHtml()}
      ${profileCardHtml(profileOpen)}`;
    return;
  }

  balMemo = new Map();
  wrap.innerHTML = weightCardHtml() + dayCardHtml() + trendCardHtml([7, 30], '📈 Tendência') +
    `<button class="link-btn" onclick="showTab('evolucao')">📆 Ver evolução mensal e anual →</button>` +
    profileCardHtml(profileOpen);
  drawBalChart();
  balMemo = null;
}

/* ── Card: peso do dia ── */
function weightCardHtml() {
  const today = (cache.weights || {})[currentDate];
  const last = weightOn(currentDate);
  const lastTxt = last && last.date !== currentDate
    ? `<div class="bal-sub">Última pesagem: ${fmtNum(last.w)}kg${last.bf ? ` · ${fmtNum(last.bf)}% gordura` : ''} em ${fmtDateShort(last.date)}</div>` : '';
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">⚖️ Peso do dia</span>
        ${today ? `<button class="btn-del" title="Apagar pesagem" onclick="deleteWeight()">🗑</button>` : ''}</div>
      <div class="weight-row">
        <label>Peso (kg)<input type="number" id="bal-w" step="0.1" min="0" inputmode="decimal" value="${today ? today.w : ''}"></label>
        <label>% gordura <small>(opcional)</small><input type="number" id="bal-bf" step="0.1" min="0" max="80" inputmode="decimal" value="${today && today.bf ? today.bf : ''}"></label>
        <button class="btn-primary" onclick="saveWeight()">Salvar</button>
      </div>
      ${lastTxt}
      <button class="link-btn left" onclick="showTab('corpo')">🧬 ${today && Object.keys(today).length > 2
        ? `Ver bioimpedância completa (${Object.keys(today).length} métricas) →` : 'Registrar bioimpedância completa →'}</button>
    </div>`;
}

function saveWeight() {
  const num = id => parseFloat(String(document.getElementById(id).value).replace(',', '.')) || 0;
  const w = num('bal-w'), bf = num('bal-bf');
  if (!w) { alert('Informe o peso em kg.'); return; }
  if (!cache.weights) cache.weights = {};
  // Mescla com o registro do dia para não apagar as métricas da bioimpedância
  const entry = { ...(cache.weights[currentDate] || {}), w };
  if (bf) entry.bf = bf; else delete entry.bf;  // RTDB não aceita campos undefined
  cache.weights[currentDate] = entry;
  saveToCloud('weights');
  renderBalanco();
}

function deleteWeight() {
  if (!confirm(`Apagar a pesagem de ${fmtDateShort(currentDate)}?`)) return;
  delete cache.weights[currentDate];
  saveToCloud('weights');
  renderBalanco();
}

/* ── Card: balanço do dia ── */
function dayCardHtml() {
  const b = dayBalance(currentDate);
  const treinoList = b.parts.map(p =>
    `<div class="bal-row bal-sub-row"><span>${esc(p.name)}</span><span>${fmtKcal(p.kcal)}</span></div>`).join('');
  let saldoHtml;
  if (!b.logged) {
    saldoHtml = `<div class="bal-note">Nenhuma refeição registrada neste dia — registre na aba Dieta para ver o saldo.</div>`;
  } else {
    const cls = b.saldo < -100 ? 'deficit' : b.saldo > 100 ? 'superavit' : 'manut';
    const txt = b.saldo < -100 ? 'déficit' : b.saldo > 100 ? 'superávit' : 'manutenção';
    saldoHtml = `<div class="bal-saldo ${cls}">Saldo: <b>${fmtSigned(b.saldo)} kcal</b> <small>(${txt})</small></div>`;
  }
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">🔥 Balanço do dia</span></div>
      <div class="bal-row"><span>🍽️ Ingerido</span><b>${b.logged ? fmtKcal(b.kcal) + ' kcal' : '—'}</b></div>
      <div class="bal-row"><span>🔥 Gasto estimado</span><b>${fmtKcal(b.gasto)} kcal</b></div>
      <div class="bal-row bal-sub-row"><span>Metabolismo basal</span><span>${fmtKcal(b.basal)}</span></div>
      <div class="bal-row bal-sub-row"><span>Dia a dia (fora da academia)</span><span>${fmtKcal(b.neat)}</span></div>
      <div class="bal-row bal-sub-row"><span>Treino</span><span>${b.trained ? fmtKcal(b.treino) : 'sem treino'}</span></div>
      ${treinoList ? `<div class="bal-parts">${treinoList}</div>` : ''}
      ${saldoHtml}
    </div>`;
}

/* ── Card: tendência do período ── */
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

let balMemo = null;   // cache de dayBalance durante um render (o modo Ano calcula centenas de dias)
let lastTrend = null; // estatísticas do último render, reaproveitadas pelo gráfico

function dayBalanceMemo(d) {
  if (!balMemo) return dayBalance(d);
  if (!balMemo.has(d)) balMemo.set(d, dayBalance(d));
  return balMemo.get(d);
}

function monthDates(y, m) {
  const out = [];
  const d = new Date(y, m, 1);
  while (d.getMonth() === m) { out.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function capToday(dates) { const t = toDateStr(new Date()); return dates.filter(d => d <= t); }

// Intervalo atual + intervalo anterior (para comparar), conforme o modo escolhido
function periodRange() {
  const cd = parseDate(currentDate);
  const y = cd.getFullYear(), m = cd.getMonth();
  const per = activePeriod();
  if (per === 'mes') {
    const py = m ? y : y - 1, pm = m ? m - 1 : 11;
    return { dates: capToday(monthDates(y, m)), prev: capToday(monthDates(py, pm)),
             label: `${MONTHS[m]} de ${y}`, prevName: 'mês anterior',
             colPrev: `${MONTHS_SHORT[pm]}/${String(py).slice(2)}`, colNow: `${MONTHS_SHORT[m]}/${String(y).slice(2)}`, nav: true };
  }
  if (per === 'ano') {
    const yearDates = yy => Array.from({ length: 12 }, (_, mm) => monthDates(yy, mm)).flat();
    return { dates: capToday(yearDates(y)), prev: capToday(yearDates(y - 1)),
             label: String(y), prevName: 'ano anterior', colPrev: String(y - 1), colNow: String(y), nav: true };
  }
  const dates = periodDates(currentDate, per);
  const before = parseDate(dates[0]);
  before.setDate(before.getDate() - 1);
  return { dates, prev: periodDates(toDateStr(before), per),
           label: `Últimos ${per} dias`, prevName: `${per} dias anteriores`,
           colPrev: 'Antes', colNow: 'Agora', nav: false };
}

function shiftPeriod(dir) {
  const d = parseDate(currentDate);
  const day = d.getDate();
  d.setDate(1);
  if (activePeriod() === 'mes') d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  currentDate = toDateStr(d);
  renderAll();
}

function periodStats(dates) {
  const days = dates.map(d => ({ date: d, b: dayBalanceMemo(d) }));
  const logged = days.filter(x => x.b && x.b.logged);
  const n = logged.length;
  const avg = f => n ? logged.reduce((t, x) => t + f(x.b), 0) / n : 0;
  const end = dates.length ? dates[dates.length - 1] : currentDate;
  const kgNow = (weightOn(end) || { w: 1 }).w;

  // Pesagens reais dentro do período
  const wDates = dates.length
    ? Object.keys(cache.weights || {}).filter(d => d >= dates[0] && d <= end).sort() : [];
  const firstW = wDates.length ? { date: wDates[0], ...cache.weights[wDates[0]] } : null;
  const lastW  = wDates.length ? { date: wDates[wDates.length - 1], ...cache.weights[wDates[wDates.length - 1]] } : null;

  // Previsão só entre a primeira e a última pesagem, para comparar com a balança
  let predDelta = null;
  if (firstW && lastW && firstW.date !== lastW.date) {
    predDelta = logged.filter(x => x.date > firstW.date && x.date <= lastW.date)
      .reduce((t, x) => t + x.b.saldo, 0) / KCAL_PER_KG;
  }
  const bfDates = wDates.filter(d => cache.weights[d].bf);
  let comp = null;
  if (bfDates.length >= 2) {
    const a = cache.weights[bfDates[0]], z = cache.weights[bfDates[bfDates.length - 1]];
    const fat = w => w.w * w.bf / 100;
    comp = { from: bfDates[0], to: bfDates[bfDates.length - 1],
             fat: fat(z) - fat(a), lean: (z.w - fat(z)) - (a.w - fat(a)) };
  }

  return {
    dates, days, n,
    trainedDays: days.filter(x => x.b && x.b.trained).length,
    avgIn: avg(b => b.kcal), avgOut: avg(b => b.gasto), avgSaldo: avg(b => b.saldo),
    protKg: avg(b => b.prot) / kgNow,
    totalPred: logged.reduce((t, x) => t + x.b.saldo, 0) / KCAL_PER_KG,
    realDelta: firstW && lastW && firstW.date !== lastW.date ? lastW.w - firstW.w : null,
    predDelta, firstW, lastW, comp
  };
}

const PERIOD_LABELS = { 7: '7 dias', 30: '30 dias', mes: 'Mês', ano: 'Ano' };

function trendCardHtml(modes, title) {
  const range = periodRange();
  const s = periodStats(range.dates);
  const p = periodStats(range.prev);
  lastTrend = { s, range };
  const per = activePeriod();

  const tabs = modes.map(v =>
    `<button class="period-btn ${per === v ? 'active' : ''}" onclick="setBalPeriod(${typeof v === 'string' ? `'${v}'` : v})">${PERIOD_LABELS[v]}</button>`).join('');
  const head = `
    <div class="entry-head"><span class="entry-name">${title}</span></div>
    <div class="period-tabs full">${tabs}</div>
    ${range.nav ? `
      <div class="period-nav">
        <button class="btn-icon" onclick="shiftPeriod(-1)">◀</button>
        <b>${range.label}</b>
        <button class="btn-icon" onclick="shiftPeriod(1)">▶</button>
      </div>` : ''}`;

  if (s.n === 0) {
    return `
      <div class="entry-card">
        ${head}
        <div class="bal-note">${range.dates.length ? 'Nenhum dia com alimentação registrada nesse período.' : 'Esse período ainda não começou.'}</div>
      </div>`;
  }

  const saldoCls = s.avgSaldo < -100 ? 'deficit' : s.avgSaldo > 100 ? 'superavit' : '';
  const chips = `
    <div class="bal-grid">
      <div class="sum-chip"><b>${fmtKcal(s.avgIn)}</b><small>kcal/dia ingerido</small></div>
      <div class="sum-chip"><b>${fmtKcal(s.avgOut)}</b><small>kcal/dia gasto</small></div>
      <div class="sum-chip ${saldoCls}"><b>${fmtSigned(s.avgSaldo)}</b><small>saldo/dia</small></div>
      <div class="sum-chip"><b>${fmtSigned(s.predDelta !== null ? s.predDelta : s.totalPred, 2)}kg</b><small>simulação</small></div>
      <div class="sum-chip"><b>${s.realDelta !== null ? fmtSigned(s.realDelta, 1) + 'kg' : '—'}</b><small>balança</small></div>
      <div class="sum-chip"><b>${fmtNum(Math.round(s.protKg * 10) / 10)}g/kg</b><small>proteína</small></div>
    </div>`;

  return `
    <div class="entry-card">
      ${head}
      <div class="bal-sub">${s.n} de ${s.dates.length} dias com alimentação registrada · ${s.trainedDays} dias de treino</div>
      ${chips}
      <canvas id="trend-chart-${currentTab}" class="trend-chart"></canvas>
      ${per === 'ano' ? monthTableHtml(s.dates) : ''}
      ${compareHtml(s, p, range)}
      <div class="bal-insights">${insights(s).map(t => `<p>${t}</p>`).join('')}</div>
    </div>`;
}

function setBalPeriod(p) {
  if (currentTab === 'evolucao') evoPeriod = p; else balPeriod = p;
  renderAll();
}

/* ══════════════════════════════════
   TAB: EVOLUÇÃO — visão mensal e anual
══════════════════════════════════ */
function renderEvolucao() {
  const wrap = document.getElementById('evo-content');
  if (!profileComplete() || !Object.keys(cache.weights || {}).length) {
    wrap.innerHTML = `<div class="bal-note">Para ver sua evolução, preencha o perfil e registre ao menos uma pesagem na aba
      <a href="#" onclick="showTab('balanco');return false">🔥 Balanço calórico</a>.</div>`;
    return;
  }
  balMemo = new Map();
  wrap.innerHTML = trendCardHtml(['mes', 'ano'], '📆 Evolução') + bodyTrendCardHtml();
  drawBalChart();
  balMemo = null;
}

// Tabela: este período × o anterior (médias por dia, então meses/anos incompletos comparam de forma justa)
function compareHtml(s, p, range) {
  if (!p.n) return `<p class="bal-sub cmp-empty">📅 Sem alimentação registrada no ${range.prevName} para comparar.</p>`;
  const perWeek = x => x.dates.length ? x.trainedDays / x.dates.length * 7 : 0;
  const rows = [
    ['Ingerido (kcal/dia)', p.avgIn, s.avgIn, v => fmtKcal(v), 0],
    ['Gasto (kcal/dia)', p.avgOut, s.avgOut, v => fmtKcal(v), 0],
    ['Saldo (kcal/dia)', p.avgSaldo, s.avgSaldo, v => fmtSigned(v), 0],
    ['Proteína (g/kg)', p.protKg, s.protKg, v => fmtNum(Math.round(v * 10) / 10), 1],
    ['Treinos/semana', perWeek(p), perWeek(s), v => fmtNum(Math.round(v * 10) / 10), 1],
    ['Peso (últ. pesagem)', p.lastW ? p.lastW.w : null, s.lastW ? s.lastW.w : null, v => fmtNum(v) + 'kg', 1],
    ['% gordura (últ.)', lastMetricIn(p.dates, 'bf'), lastMetricIn(s.dates, 'bf'), v => fmtNum(Math.round(v * 10) / 10) + '%', 1],
    ['Massa muscular (últ.)', lastMetricIn(p.dates, 'muscleKg'), lastMetricIn(s.dates, 'muscleKg'), v => fmtNum(Math.round(v * 10) / 10) + 'kg', 1]
  ].filter(([, a, b], i) => i < 6 || a !== null || b !== null);
  return `
    <p class="cmp-title">📅 Comparado ao ${range.prevName}</p>
    <div class="table-wrap">
      <table class="cmp-table">
        <thead><tr><th></th><th>${range.colPrev}</th><th>${range.colNow}</th><th>Δ</th></tr></thead>
        <tbody>${rows.map(([name, a, b, fmt, dec]) => `
          <tr><td>${name}</td>
            <td>${a !== null ? fmt(a) : '—'}</td>
            <td><b>${b !== null ? fmt(b) : '—'}</b></td>
            <td class="cmp-delta">${a !== null && b !== null ? fmtSigned(b - a, dec) : '—'}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Modo Ano: uma linha por mês
function monthTableHtml(dates) {
  const byMonth = {};
  dates.forEach(d => (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || []).push(d));
  const hasBf = lastMetricIn(dates, 'bf') !== null;
  const rows = Object.keys(byMonth).sort().map(k => {
    const ms = periodStats(byMonth[k]);
    const name = MONTHS_SHORT[Number(k.slice(5, 7)) - 1];
    const bf = lastMetricIn(byMonth[k], 'bf');
    const bfCell = hasBf ? `<td>${bf !== null ? fmtNum(Math.round(bf * 10) / 10) + '%' : '—'}</td>` : '';
    if (!ms.n) return `<tr class="muted-row"><td>${name}</td><td>0</td><td>—</td><td>—</td><td>—</td><td>—</td>${bfCell}</tr>`;
    const cls = ms.avgSaldo < -100 ? 'deficit' : ms.avgSaldo > 100 ? 'superavit' : '';
    return `<tr><td>${name}</td><td>${ms.n}</td><td>${fmtKcal(ms.avgIn)}</td><td>${fmtKcal(ms.avgOut)}</td>
      <td class="${cls}"><b>${fmtSigned(ms.avgSaldo)}</b></td>
      <td>${ms.realDelta !== null ? fmtSigned(ms.realDelta, 1) + 'kg' : '—'}</td>${bfCell}</tr>`;
  }).join('');
  return `
    <p class="cmp-title">🗓️ Mês a mês <small>(médias por dia registrado)</small></p>
    <div class="table-wrap">
      <table class="cmp-table month-table">
        <thead><tr><th>Mês</th><th>Dias</th><th>Ingerido</th><th>Gasto</th><th>Saldo</th><th>Balança</th>${hasBf ? '<th>% gord.</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Interpretação: déficit/superávit × proteína × treino (+ composição se houver % gordura)
function insights(s) {
  const out = [];
  const protOk = s.protKg >= 1.6;
  const treinaBem = s.trainedDays >= Math.max(1, Math.round(s.dates.length / 7 * 2));
  const protTxt = `${fmtNum(Math.round(s.protKg * 10) / 10)} g/kg`;

  if (s.n < 3) out.push('📝 Poucos dias registrados — a tendência fica mais confiável com pelo menos 5–7 dias de alimentação anotada.');
  const faltam = s.dates.length - s.n;
  if (faltam === 1) out.push('ℹ️ 1 dia sem refeições registradas ficou de fora do cálculo (não dá para supor quanto você comeu).');
  else if (faltam > 1) out.push(`ℹ️ ${faltam} dias sem refeições registradas ficaram de fora do cálculo (não dá para supor quanto você comeu).`);

  if (s.avgSaldo < -1000) {
    out.push('⚠️ Déficit muito agressivo (mais de 1000 kcal/dia). Isso aumenta bastante o risco de perder massa magra e de cansaço no treino.');
  } else if (s.avgSaldo < -150) {
    if (protOk && treinaBem) out.push(`✅ Déficit moderado com treino e proteína boa (${protTxt}): o melhor cenário para <b>perder gordura preservando massa magra</b>.`);
    else if (!protOk) out.push(`⚠️ Você está em déficit, mas a proteína está baixa (${protTxt}). Com menos de 1,6 g/kg, parte do peso perdido tende a ser massa magra. O ideal é 1,6–2,2 g/kg.`);
    else out.push('⚠️ Déficit com poucos treinos no período: sem estímulo de musculação, parte do peso perdido tende a ser massa magra.');
  } else if (s.avgSaldo > 500) {
    out.push('⚠️ Superávit alto (mais de 500 kcal/dia): a maior parte do excedente tende a virar <b>gordura</b>, mesmo treinando.');
  } else if (s.avgSaldo > 150) {
    if (protOk && treinaBem) out.push(`💪 Superávit moderado com treino e proteína boa (${protTxt}): cenário de <b>ganho de massa magra</b>, com algum ganho de gordura junto.`);
    else out.push('⚠️ Superávit sem treino/proteína suficientes: o excedente tende a virar principalmente gordura.');
  } else {
    if (protOk && treinaBem) out.push(`⚖️ Perto da manutenção, com treino e proteína boa (${protTxt}): peso estável, com chance de <b>recomposição</b> (perder gordura e ganhar massa devagar).`);
    else out.push('⚖️ Perto da manutenção: a tendência é o peso ficar estável.');
  }

  if (s.realDelta !== null && s.predDelta !== null) {
    out.push(`⚖️ Entre ${fmtDateShort(s.firstW.date)} e ${fmtDateShort(s.lastW.date)} a balança mudou <b>${fmtSigned(s.realDelta, 1)} kg</b>; a simulação previa <b>${fmtSigned(s.predDelta, 2)} kg</b>.`);
    if (Math.abs(s.realDelta - s.predDelta) > 1) out.push('🔍 Diferença grande entre previsto e real. Pode ser líquido/retenção (varia 1–2 kg de um dia pro outro), refeições não anotadas, ou seu gasto real diferente da estimativa. Olhe a tendência de várias semanas, não um dia.');
  } else {
    out.push('📉 Registre seu peso pelo menos 2 vezes no período (de preferência em jejum, mesmo horário) para comparar a simulação com a balança.');
  }

  if (s.comp) {
    const f = fmtSigned(s.comp.fat, 1), l = fmtSigned(s.comp.lean, 1);
    out.push(`🧬 Pela % de gordura (${fmtDateShort(s.comp.from)} → ${fmtDateShort(s.comp.to)}): gordura <b>${f} kg</b>, massa magra <b>${l} kg</b>. Bioimpedância oscila bastante; confie mais na tendência de várias medições.`);
  } else {
    out.push('🧬 Para ver se a mudança é gordura ou massa magra, anote também a <b>% de gordura</b> nas pesagens (bioimpedância ou avaliação física).');
  }
  return out;
}

// Gráfico: peso real × peso previsto pela simulação
function drawBalChart() {
  const canvas = document.getElementById('trend-chart-' + currentTab);
  if (balChart) { balChart.destroy(); balChart = null; }
  if (!canvas || !lastTrend) return;
  const s = lastTrend.s;
  const base = weightOn(s.dates[0]);
  let cum = 0;
  const pred = s.days.map(x => {
    if (x.b && x.b.logged && x.date > base.date) cum += x.b.saldo;
    return Math.round((Number(base.w) + cum / KCAL_PER_KG) * 100) / 100;
  });
  let labels = s.dates.map(fmtDateShort);
  let real = s.dates.map(d => cache.weights[d] ? Number(cache.weights[d].w) : null);
  let predData = pred;

  // Modo Ano: um ponto por mês (última pesagem do mês; simulação no fim do mês)
  if (activePeriod() === 'ano') {
    const months = [...new Set(s.dates.map(d => d.slice(0, 7)))];
    labels = months.map(k => MONTHS_SHORT[Number(k.slice(5, 7)) - 1]);
    real = months.map(k => {
      const ws = Object.keys(cache.weights).filter(d => d.startsWith(k)).sort();
      return ws.length ? Number(cache.weights[ws[ws.length - 1]].w) : null;
    });
    predData = months.map(k => pred[s.dates.map(d => d.slice(0, 7)).lastIndexOf(k)]);
  }

  balChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Balança', data: real, borderColor: '#ea580c', backgroundColor: '#ea580c',
          spanGaps: true, pointRadius: 4, tension: 0.2 },
        { label: 'Simulação', data: predData, borderColor: '#94a3b8', borderDash: [5, 4],
          pointRadius: 0, tension: 0.2 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { ticks: { callback: v => fmtNum(v) + 'kg' } }, x: { ticks: { maxTicksLimit: 8 } } }
    }
  });
}

/* ── Card: perfil ── */
function profileCardHtml(open) {
  const p = cache.profile || {};
  const head = `<div class="entry-head" ${profileComplete() ? 'style="cursor:pointer" onclick="toggleProfile()"' : ''}>
      <span class="entry-name">👤 Meu perfil</span>${profileComplete() ? `<span>${open ? '▲' : '▼'}</span>` : ''}</div>`;
  if (!open) return `<div class="entry-card">${head}</div>`;
  return `
    <div class="entry-card">
      ${head}
      <div class="food-grid profile-grid">
        <label>Sexo<select id="pf-sex">
          <option value="F" ${p.sex !== 'M' ? 'selected' : ''}>Feminino</option>
          <option value="M" ${p.sex === 'M' ? 'selected' : ''}>Masculino</option></select></label>
        <label>Ano de nascimento<input type="number" id="pf-year" inputmode="numeric" min="1920" max="2020" value="${p.birthYear || ''}"></label>
        <label>Altura (cm)<input type="number" id="pf-height" inputmode="numeric" min="100" max="230" value="${p.height || ''}"></label>
        <label class="full">Rotina fora da academia<select id="pf-act">
          ${ACTIVITY_LEVELS.map(a => `<option value="${a.f}" ${Number(p.activity) === a.f ? 'selected' : ''}>${a.label}</option>`).join('')}
        </select></label>
      </div>
      <p class="food-hint">O treino é calculado à parte, a partir do que você registra na aba Treino.</p>
      <button class="btn-primary btn-block" onclick="saveProfile()">Salvar perfil</button>
    </div>`;
}

function toggleProfile() { profileOpen = !profileOpen; renderBalanco(); }

function saveProfile() {
  const sex = document.getElementById('pf-sex').value;
  const birthYear = parseInt(document.getElementById('pf-year').value);
  const height = parseFloat(String(document.getElementById('pf-height').value).replace(',', '.'));
  const activity = parseFloat(document.getElementById('pf-act').value);
  if (!birthYear || !height) { alert('Preencha o ano de nascimento e a altura.'); return; }
  cache.profile = { sex, birthYear, height, activity };
  saveToCloud('profile');
  profileOpen = false;
  renderBalanco();
}

/* ══════════════════════════════════
   TAB: COMPOSIÇÃO CORPORAL — bioimpedância
══════════════════════════════════ */
// [chave, nome, unidade, casas decimais, direção boa: +1 subir é bom, -1 descer é bom, 0 neutro]
const BIO_GROUPS = [
  { name: '⚖️ Geral', metrics: [
    ['w', 'Peso', 'kg', 1, 0], ['imc', 'IMC', '', 1, 0], ['height', 'Altura', 'cm', 0, 0], ['age', 'Idade real', 'anos', 0, 0]] },
  { name: '🧈 Gordura', metrics: [
    ['bf', 'Percentual de gordura', '%', 1, -1], ['fatKg', 'Peso da gordura', 'kg', 1, -1],
    ['visceral', 'Gordura visceral', '', 1, -1], ['obesity', 'Percentual de obesidade', '%', 1, -1]] },
  { name: '💪 Músculo e massa magra', metrics: [
    ['musclePct', 'Percentual de massa muscular', '%', 1, 1], ['muscleKg', 'Peso da massa muscular', 'kg', 1, 1],
    ['smm', 'Massa muscular esquelética', 'kg', 1, 1], ['muscleRate', 'Registro de massa muscular', '%', 1, 1],
    ['lbm', 'LBM (massa magra)', 'kg', 1, 1], ['bone', 'Ossos', 'kg', 1, 0], ['protein', 'Proteína', '%', 1, 1]] },
  { name: '💧 Água', metrics: [
    ['waterPct', 'Percentual de água', '%', 1, 0], ['waterKg', 'Peso da água', 'kg', 1, 0]] },
  { name: '🔥 Metabolismo', metrics: [
    ['bmr', 'Metabolismo', 'kcal', 0, 0], ['metaAge', 'Idade metabólica', 'anos', 0, -1]] }
];
const BIO_METRICS = BIO_GROUPS.flatMap(g =>
  g.metrics.map(([k, label, unit, dec, good]) => ({ k, label, unit, dec, good, group: g.name })));
const bioMetric = k => BIO_METRICS.find(m => m.k === k);

let bioEditing = false;
let bioChartKey = 'bf';
let bioChartRange = 'tudo';
let bioCmp = { a: null, b: null };
let bodyChart = null;

function fmtBio(m, v) {
  if (v === undefined || v === null || v === '') return '—';
  const n = Math.round(Number(v) * 10 ** m.dec) / 10 ** m.dec;
  return (m.k === 'bmr' ? n.toLocaleString('pt-BR') : fmtNum(n)) + (m.unit && m.unit !== '%' ? ' ' + m.unit : m.unit);
}

function fmtBioDelta(m, d) {
  const cls = !m.good || Math.abs(d) < 1e-9 ? '' : (d * m.good > 0 ? 'good' : 'bad');
  return `<span class="bio-delta ${cls}">${fmtSigned(d, m.dec)}</span>`;
}

function bioDates() { return Object.keys(cache.weights || {}).sort(); }

// Valor mais recente de uma métrica em uma lista de datas (ou null)
function lastMetricIn(dates, key) {
  for (let i = dates.length - 1; i >= 0; i--) {
    const r = cache.weights[dates[i]];
    if (r && r[key] !== undefined) return Number(r[key]);
  }
  return null;
}

function renderCorpo() {
  document.getElementById('corpo-date').value = currentDate;
  document.getElementById('corpo-date-label').textContent = fmtDateLong(currentDate);
  const wrap = document.getElementById('corpo-content');
  const rec = (cache.weights || {})[currentDate];
  wrap.innerHTML = (rec && !bioEditing ? bioViewHtml(rec) : bioFormHtml(rec)) +
    bioChartCardHtml() + bioCompareCardHtml() + bioHistoryHtml();
  drawBodyChart();
}

/* ── Medição do dia: formulário ── */
function bioFormHtml(rec) {
  const prevDates = bioDates().filter(d => d < currentDate);
  const prevRec = prevDates.length ? cache.weights[prevDates[prevDates.length - 1]] : {};
  const p = cache.profile || {};
  const defaults = { height: p.height, age: p.birthYear ? Number(currentDate.slice(0, 4)) - Number(p.birthYear) : undefined };
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">🧬 ${rec ? 'Editar medição' : 'Nova medição'} de ${fmtDateShort(currentDate)}</span>
        ${rec ? `<button class="btn-tiny" title="Cancelar" onclick="bioEditing=false;renderCorpo()">✕</button>` : ''}
      </div>
      <p class="food-hint">Preencha só o que sua balança mostrar. Em cinza, o valor da medição anterior. Para medições mais comparáveis: mesmo horário, em jejum, antes do treino.</p>
      ${BIO_GROUPS.map(g => `
        <p class="bio-group">${g.name}</p>
        <div class="food-grid bio-grid">
          ${g.metrics.map(([k, label, unit]) => {
            const val = rec && rec[k] !== undefined ? rec[k] : (!rec && defaults[k] !== undefined ? defaults[k] : '');
            const ph = prevRec[k] !== undefined ? prevRec[k] : '';
            return `<label>${label}${unit ? ` (${unit})` : ''}${k === 'w' ? ' *' : ''}
              <input type="number" id="bio-${k}" step="any" min="0" inputmode="decimal" value="${val}" placeholder="${ph}"></label>`;
          }).join('')}
        </div>`).join('')}
      <button class="btn-primary btn-block" onclick="saveBio()">Salvar medição</button>
    </div>`;
}

function saveBio() {
  const entry = {};
  BIO_METRICS.forEach(m => {
    const raw = String(document.getElementById('bio-' + m.k).value).replace(',', '.').trim();
    if (raw !== '' && !isNaN(parseFloat(raw))) entry[m.k] = parseFloat(raw);
  });
  if (!entry.w) { alert('Informe pelo menos o peso.'); return; }
  cache.weights[currentDate] = entry;
  saveToCloud('weights');
  bioEditing = false;
  bioCmp = { a: null, b: null };  // volta a comparar primeira × mais recente
  renderCorpo();
}

function deleteBio() {
  if (!confirm(`Apagar a medição de ${fmtDateShort(currentDate)} (peso e todas as métricas)?`)) return;
  delete cache.weights[currentDate];
  saveToCloud('weights');
  bioEditing = false;
  bioCmp = { a: null, b: null };
  renderCorpo();
}

/* ── Medição do dia: visualização ── */
function bioViewHtml(rec) {
  const prevDates = bioDates().filter(d => d < currentDate);
  // Cada métrica compara com o último valor registrado DELA (pesagens rápidas só têm peso/% gordura)
  const prev = {};
  BIO_METRICS.forEach(m => { const v = lastMetricIn(prevDates, m.k); if (v !== null) prev[m.k] = v; });
  const hasPrev = Object.keys(prev).length > 0;
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">🧬 Medição de ${fmtDateShort(currentDate)}</span>
        <div class="hist-actions">
          <button class="btn-tiny" title="Editar" onclick="bioEditing=true;renderCorpo()">✏️</button>
          <button class="btn-tiny danger" title="Apagar" onclick="deleteBio()">🗑</button>
        </div>
      </div>
      ${hasPrev ? `<p class="bal-sub">Δ = diferença para o último valor anterior de cada métrica · <span class="bio-delta good">verde</span> na direção boa, <span class="bio-delta bad">vermelho</span> na direção ruim</p>` : ''}
      ${BIO_GROUPS.map(g => {
        const rows = g.metrics.filter(([k]) => rec[k] !== undefined).map(([k]) => {
          const m = bioMetric(k);
          const d = prev[k] !== undefined ? fmtBioDelta(m, rec[k] - prev[k]) : '';
          return `<div class="bal-row bio-row"><span>${m.label}</span><span><b>${fmtBio(m, rec[k])}</b> ${d}</span></div>`;
        }).join('');
        return rows ? `<p class="bio-group">${g.name}</p>${rows}` : '';
      }).join('')}
    </div>`;
}

/* ── Gráfico de uma métrica ao longo do tempo ── */
function bioSeries(key) {
  let dates = bioDates().filter(d => cache.weights[d][key] !== undefined);
  if (bioChartRange !== 'tudo') {
    const from = parseDate(toDateStr(new Date()));
    from.setMonth(from.getMonth() - Number(bioChartRange));
    dates = dates.filter(d => d >= toDateStr(from));
  }
  return dates.map(d => ({ date: d, v: Number(cache.weights[d][key]) }));
}

function bioChartCardHtml() {
  const available = BIO_METRICS.filter(m => bioDates().some(d => cache.weights[d][m.k] !== undefined));
  if (!available.length) return '';
  if (!available.some(m => m.k === bioChartKey)) bioChartKey = available[0].k;
  const m = bioMetric(bioChartKey);
  const series = bioSeries(bioChartKey);
  const ranges = [['3', '3 meses'], ['6', '6 meses'], ['12', '1 ano'], ['tudo', 'Tudo']].map(([v, l]) =>
    `<button class="period-btn ${bioChartRange === v ? 'active' : ''}" onclick="bioChartRange='${v}';renderCorpo()">${l}</button>`).join('');
  let stats = '<p class="bal-sub">Sem medições dessa métrica no intervalo.</p>';
  if (series.length) {
    const vals = series.map(x => x.v);
    const first = series[0], last = series[series.length - 1];
    stats = `
      <div class="bal-grid">
        <div class="sum-chip"><b>${fmtBio(m, first.v)}</b><small>primeira (${fmtDateShort(first.date)})</small></div>
        <div class="sum-chip"><b>${fmtBio(m, last.v)}</b><small>última (${fmtDateShort(last.date)})</small></div>
        <div class="sum-chip"><b>${series.length > 1 ? fmtBioDelta(m, last.v - first.v) : '—'}</b><small>variação</small></div>
        <div class="sum-chip"><b>${fmtBio(m, Math.min(...vals))}</b><small>mínimo</small></div>
        <div class="sum-chip"><b>${fmtBio(m, Math.max(...vals))}</b><small>máximo</small></div>
        <div class="sum-chip"><b>${series.length}</b><small>medições</small></div>
      </div>`;
  }
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">📈 Evolução da métrica</span></div>
      <select class="bio-select" onchange="bioChartKey=this.value;renderCorpo()">
        ${BIO_GROUPS.map(g => {
          const opts = g.metrics.filter(([k]) => available.some(a => a.k === k))
            .map(([k, label]) => `<option value="${k}" ${k === bioChartKey ? 'selected' : ''}>${label}</option>`).join('');
          return opts ? `<optgroup label="${g.name}">${opts}</optgroup>` : '';
        }).join('')}
      </select>
      <div class="period-tabs full">${ranges}</div>
      ${series.length > 1 ? '<canvas id="body-chart"></canvas>' : ''}
      ${stats}
    </div>`;
}

function drawBodyChart() {
  if (bodyChart) { bodyChart.destroy(); bodyChart = null; }
  const canvas = document.getElementById('body-chart');
  if (!canvas) return;
  const m = bioMetric(bioChartKey);
  const series = bioSeries(bioChartKey);
  bodyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map(x => fmtDateShort(x.date)),
      datasets: [{ label: m.label, data: series.map(x => x.v), borderColor: '#ea580c',
                   backgroundColor: 'rgba(234,88,12,0.12)', fill: true, tension: 0.25, pointRadius: 4 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => fmtNum(v) + (m.unit === '%' ? '%' : '') } }, x: { ticks: { maxTicksLimit: 8 } } }
    }
  });
}

/* ── Comparar duas medições ── */
function bioCompareTable(recA, recB, labelA, labelB) {
  const rows = BIO_METRICS.filter(m => recA[m.k] !== undefined || recB[m.k] !== undefined).map(m => `
    <tr><td>${m.label}</td>
      <td>${fmtBio(m, recA[m.k])}</td>
      <td><b>${fmtBio(m, recB[m.k])}</b></td>
      <td>${recA[m.k] !== undefined && recB[m.k] !== undefined ? fmtBioDelta(m, recB[m.k] - recA[m.k]) : '—'}</td></tr>`).join('');
  return `
    <div class="table-wrap">
      <table class="cmp-table">
        <thead><tr><th></th><th>${labelA}</th><th>${labelB}</th><th>Δ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bioCompareCardHtml() {
  const dates = bioDates();
  if (dates.length < 2) return '';
  if (!dates.includes(bioCmp.a)) bioCmp.a = dates[0];
  if (!dates.includes(bioCmp.b)) bioCmp.b = dates[dates.length - 1];
  const opt = sel => dates.map(d => `<option value="${d}" ${d === sel ? 'selected' : ''}>${fmtDateShort(d)}/${d.slice(2, 4)}</option>`).join('');
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">🔄 Comparar medições</span></div>
      <div class="cmp-pickers">
        <select class="bio-select" onchange="bioCmp.a=this.value;renderCorpo()">${opt(bioCmp.a)}</select>
        <span>→</span>
        <select class="bio-select" onchange="bioCmp.b=this.value;renderCorpo()">${opt(bioCmp.b)}</select>
      </div>
      ${bioCompareTable(cache.weights[bioCmp.a], cache.weights[bioCmp.b], fmtDateShort(bioCmp.a), fmtDateShort(bioCmp.b))}
    </div>`;
}

/* ── Histórico de medições ── */
function bioHistoryHtml() {
  const dates = bioDates().reverse();
  if (!dates.length) return '';
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">🗂️ Histórico de medições</span></div>
      ${dates.map(d => {
        const r = cache.weights[d];
        const extra = [r.bf !== undefined ? fmtNum(r.bf) + '% gord.' : '', r.muscleKg !== undefined ? fmtNum(r.muscleKg) + 'kg músc.' : '']
          .filter(Boolean).join(' · ');
        return `
          <div class="hist-line bio-hist ${d === currentDate ? 'current' : ''}" onclick="bioEditing=false;setDate('${d}');window.scrollTo(0,0)">
            <b>${fmtDateShort(d)}/${d.slice(2, 4)}</b> — ${fmtNum(r.w)}kg${extra ? ' · ' + extra : ''}
            <small>${Object.keys(r).length} métricas</small>
          </div>`;
      }).join('')}
    </div>`;
}

/* ── Evolução: composição corporal no período (1ª × última medição) ── */
function bodyTrendCardHtml() {
  if (!lastTrend) return '';
  const dates = lastTrend.range.dates;
  const inPeriod = dates.length ? bioDates().filter(d => d >= dates[0] && d <= dates[dates.length - 1]) : [];
  const withBio = inPeriod.filter(d => Object.keys(cache.weights[d]).length > 2);
  let body;
  if (withBio.length >= 2) {
    const a = withBio[0], b = withBio[withBio.length - 1];
    body = `<p class="bal-sub">Primeira × última medição de bioimpedância do período.</p>
      ${bioCompareTable(cache.weights[a], cache.weights[b], fmtDateShort(a), fmtDateShort(b))}`;
  } else {
    body = `<p class="bal-sub">São necessárias pelo menos 2 medições de bioimpedância no período para comparar
      (${withBio.length} encontrada${withBio.length === 1 ? '' : 's'}).
      <a href="#" onclick="showTab('corpo');return false">Registrar medição →</a></p>`;
  }
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">🧬 Composição corporal · ${lastTrend.range.label}</span></div>
      ${body}
    </div>`;
}

/* ══════════════════════════════════
   FECHAR MODAL AO CLICAR FORA
══════════════════════════════════ */
document.addEventListener('click', ev => {
  if (ev.target.classList && ev.target.classList.contains('modal')) {
    ev.target.classList.remove('show');
  }
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') closeDrawer();
});
