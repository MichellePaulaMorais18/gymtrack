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

  document.getElementById('dieta-week').innerHTML = weekStripHtml();
  document.getElementById('dieta-gauge').innerHTML = gaugeCardHtml();
  document.getElementById('water-card').innerHTML = waterCardHtml();
  document.getElementById('dieta-track').innerHTML = trackCardHtml();
  drawTrackChart();

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

/* ══ Metas, medidor de calorias, faixa da semana e acompanhamento ══ */
const MACRO_GOALS = [
  { k: 'carb', label: 'Carboidratos', color: '#f5b13d' },
  { k: 'prot', label: 'Proteína', color: '#5b8def' },
  { k: 'gord', label: 'Gordura', color: '#e0614a' }
];
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
let trackMode = 'dia';
let trackChart = null;

function dietGoals() { return (cache.settings && cache.settings.goals) || {}; }
function dayKcal(date) { const d = dayNutri(date); return d ? dayMacros(d).kcal : 0; }
function dayLogged(date) { const d = dayNutri(date); return !!(d && (d.meals || []).some(m => (m.items || []).length)); }
function dayWater(date) { const d = dayNutri(date); return d ? Number(d.water) || 0 : 0; }

// Gasto do treino do dia (mesma estimativa do Balanço); null se não treinou ou sem peso registrado
function exerciseKcal(date) {
  const s = getSession(date);
  const w = weightOn(date);
  if (!s || !s.entries.length || !w) return null;
  return s.entries.reduce((t, e) => t + entryKcal(e, Number(w.w)), 0);
}

// Alvo do dia = meta + gasto do treino (mesma conta do medidor)
function dayTarget(date) {
  const g = dietGoals();
  return g.kcal ? g.kcal + (exerciseKcal(date) || 0) : 0;
}

function weekDates(date) {
  const d = parseDate(date);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return toDateStr(x); });
}

// Anel de progresso (0 a 1); passar da meta fica vermelho só quando isso é ruim (calorias, não água)
function ringSvg(frac, size, color, overIsBad = true) {
  const r = (size - 5) / 2, c = 2 * Math.PI * r;
  const over = overIsBad && frac > 1.05;
  const f = Math.max(0, Math.min(1, frac));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="3.5"/>
    ${f > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--red)' : color}" stroke-width="3.5"
      stroke-linecap="round" stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
  </svg>`;
}

function weekStripHtml() {
  const g = dietGoals();
  const today = toDateStr(new Date());
  return `<div class="week-strip">${weekDates(currentDate).map((d, i) => {
    const frac = d > today ? 0 : g.kcal ? dayKcal(d) / dayTarget(d) : (dayLogged(d) ? 1 : 0);
    return `<button class="week-day ${d === currentDate ? 'active' : ''} ${d === today ? 'today' : ''}" onclick="setDate('${d}')">
      <span>${WEEKDAYS[i]}</span><b>${d.slice(8)}</b>${ringSvg(frac, 26, 'var(--primary)')}</button>`;
  }).join('')}</div>`;
}

function macroBarsHtml(t, g) {
  return `<div class="macro-bars">${MACRO_GOALS.map(m => {
    const goal = Number(g[m.k]) || 0;
    const pct = goal ? Math.min(100, t[m.k] / goal * 100) : 0;
    return `<div class="macro-bar">
      <span class="macro-name">${m.label}</span>
      <div class="macro-track"><div class="macro-fill" style="width:${pct}%;background:${m.color}"></div></div>
      <span class="macro-val"><b>${fmtG(t[m.k])}g</b>${goal ? ` / ${fmtG(goal)}g` : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function gaugeCardHtml() {
  const g = dietGoals();
  const t = dayMacros(dayNutri(currentDate) || { meals: [] });
  const extras = `<p class="gauge-extra">Fibra ${fmtG(t.fib)}g · Açúcar ${fmtG(t.acuc)}g · Sódio ${fmtG(t.sodio)}mg</p>`;
  if (!g.kcal) {
    return `
      <div class="entry-card">
        <div class="entry-head"><span class="entry-name">🎯 Metas do dia</span></div>
        <p class="bal-sub">Hoje: <b>${fmtKcal(t.kcal)} kcal</b> · P ${fmtG(t.prot)}g · C ${fmtG(t.carb)}g · G ${fmtG(t.gord)}g</p>
        <button class="btn-primary btn-block" onclick="openGoals()">🎯 Definir metas de calorias e macros</button>
        ${extras}
      </div>`;
  }
  const ex = exerciseKcal(currentDate);
  const remaining = g.kcal - t.kcal + (ex || 0);
  const frac = Math.min(1, t.kcal / (g.kcal + (ex || 0)));
  const over = remaining < 0;
  // Arco de 180°: da esquerda (vazio) para a direita (meta atingida)
  const R = 90, L = Math.PI * R, theta = Math.PI - Math.PI * frac;
  const dotX = 110 + R * Math.cos(theta), dotY = 110 - R * Math.sin(theta);
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">🎯 Metas do dia</span>
        <button class="btn-tiny" title="Editar metas" onclick="openGoals()">✏️</button>
      </div>
      <div class="gauge">
        <svg viewBox="0 0 220 122" class="gauge-svg">
          <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="var(--primary-soft)" stroke-width="16" stroke-linecap="round"/>
          ${frac > 0 ? `<path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="${over ? 'var(--red)' : 'var(--primary)'}" stroke-width="16"
            stroke-linecap="round" stroke-dasharray="${(frac * L).toFixed(1)} ${L.toFixed(1)}"/>
          <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="5" fill="#fff" stroke="${over ? 'var(--red)' : 'var(--primary)'}" stroke-width="2"/>` : ''}
        </svg>
        <div class="gauge-center ${over ? 'over' : ''}">
          <small>${over ? 'Excedeu' : 'Restam'}</small>
          <b>${fmtKcal(Math.abs(remaining))}</b>
          <small>kcal</small>
        </div>
      </div>
      <p class="gauge-formula">Restante = Meta − Dieta + Exercício</p>
      <div class="gauge-row">
        <div><small>🎯 Meta</small><b>${fmtKcal(g.kcal)}</b></div>
        <span>−</span>
        <div><small>🍽️ Dieta</small><b>${fmtKcal(t.kcal)}</b></div>
        <span>+</span>
        <div><small>🔥 Exercício</small><b>${ex ? fmtKcal(ex) : '--'}</b></div>
      </div>
      ${macroBarsHtml(t, g)}
      ${extras}
    </div>`;
}

/* ── Água ── */
function waterStreak(date) {
  const goal = waterGoal();
  const d = parseDate(date);
  if (dayWater(toDateStr(d)) < goal) d.setDate(d.getDate() - 1);  // hoje ainda pode bater a meta
  let n = 0;
  while (dayWater(toDateStr(d)) >= goal) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function waterCardHtml() {
  const water = dayWater(currentDate), goal = waterGoal();
  const pct = Math.round(water / goal * 100);
  const today = toDateStr(new Date());
  const week = weekDates(currentDate);
  const logged = week.filter(d => d <= today && dayWater(d) > 0);
  const avg = logged.length ? logged.reduce((t, d) => t + dayWater(d), 0) / logged.length : 0;
  const streak = waterStreak(currentDate);
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">💧 Água</span>
        <button class="btn-mini" onclick="openGoals()" title="Alterar meta">meta ${goal.toLocaleString('pt-BR')}ml ✏️</button>
      </div>
      <div class="water-top">
        <b class="water-big">${water.toLocaleString('pt-BR')}<small>ml</small></b>
        <span class="water-pct">${pct}% · ${water >= goal ? 'meta batida 🎉' : `faltam ${(goal - water).toLocaleString('pt-BR')}ml`}</span>
      </div>
      <div class="water-bar"><div class="water-fill" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="water-btns">
        <button class="water-btn minus" onclick="addWater(-250)" title="Desfazer 250ml">−</button>
        <button class="water-btn" onclick="addWater(250)">＋250</button>
        <button class="water-btn" onclick="addWater(500)">＋500</button>
        <button class="water-btn" onclick="addWater(700)">＋700</button>
      </div>
      <div class="water-week">${week.map((d, i) =>
        `<div class="water-day ${d === currentDate ? 'active' : ''}"><span>${WEEKDAYS[i][0]}</span>${ringSvg(d > today ? 0 : dayWater(d) / goal, 22, '#0ea5e9', false)}</div>`).join('')}
      </div>
      <div class="water-stats">
        <div><b>${streak}</b> dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'} na meta</div>
        <div><b>${Math.round(avg).toLocaleString('pt-BR')}ml</b> média da semana</div>
      </div>
    </div>`;
}

/* ── Modal de metas ── */
function openGoals() {
  const g = dietGoals();
  const b = profileComplete() && weightOn(currentDate) ? dayBalance(currentDate) : null;
  const kg = weightOn(currentDate) ? Number(weightOn(currentDate).w) : null;
  const field = (id, label, unit, val) => `
    <div class="bio-field"><label for="${id}">${label}</label>
      <input type="number" id="${id}" step="any" min="0" inputmode="decimal" value="${val || ''}"><span class="unit">${unit}</span></div>`;
  document.getElementById('goals-body').innerHTML = `
    <div class="bio-fields">
      ${field('goal-kcal', 'Calorias', 'kcal', g.kcal)}
      ${field('goal-prot', 'Proteína', 'g', g.prot)}
      ${field('goal-carb', 'Carboidratos', 'g', g.carb)}
      ${field('goal-gord', 'Gordura', 'g', g.gord)}
      ${field('goal-water', 'Água', 'ml', waterGoal())}
    </div>
    ${b ? `<p class="food-hint goals-hint">💡 Seu gasto estimado (aba Balanço) é de <b>~${fmtKcal(b.basal + b.neat)} kcal</b> num dia sem treino.
      Para perder gordura, uma meta comum é ficar 300–500 kcal abaixo disso.</p>` : ''}
    ${kg ? `<p class="food-hint goals-hint">💡 Para quem treina, a proteína recomendada é 1,6–2,2 g por kg: <b>${Math.round(kg * 1.6)}–${Math.round(kg * 2.2)} g</b> para ${fmtNum(kg)} kg.</p>` : ''}
    <p class="food-hint goals-hint">Os treinos registrados no dia somam no "Exercício" e aumentam o que resta para comer, como no app da balança.</p>
    <button class="btn-primary btn-block" onclick="saveGoals()">Salvar metas</button>`;
  document.getElementById('modal-goals').classList.add('show');
}

function saveGoals() {
  const num = id => parseFloat(String(document.getElementById(id).value).replace(',', '.')) || 0;
  const goals = {};
  ['kcal', 'prot', 'carb', 'gord'].forEach(k => { const v = num('goal-' + k); if (v > 0) goals[k] = v; });
  if (!cache.settings) cache.settings = {};
  cache.settings.goals = goals;
  const w = num('goal-water');
  if (w > 0) cache.settings.waterGoal = w;
  saveToCloud('settings');
  closeModal('modal-goals');
  renderDieta();
}

/* ── Acompanhamento: dia / semana / mês / ano ── */
function trackRange() {
  const cd = parseDate(currentDate), y = cd.getFullYear(), m = cd.getMonth();
  if (trackMode === 'semana') {
    const w = weekDates(currentDate);
    return { dates: w, label: `${fmtDateShort(w[0])} – ${fmtDateShort(w[6])}` };
  }
  if (trackMode === 'mes') return { dates: monthDates(y, m), label: `${MONTHS[m]} de ${y}` };
  if (trackMode === 'ano') return { dates: Array.from({ length: 12 }, (_, i) => monthDates(y, i)).flat(), label: String(y) };
  return { dates: [currentDate], label: fmtDateFull(currentDate) };
}

function setTrackMode(mode) { trackMode = mode; renderDieta(); }

function shiftTrack(dir) {
  const d = parseDate(currentDate);
  if (trackMode === 'dia') d.setDate(d.getDate() + dir);
  else if (trackMode === 'semana') d.setDate(d.getDate() + 7 * dir);
  else {
    const day = d.getDate();
    d.setDate(1);
    if (trackMode === 'mes') d.setMonth(d.getMonth() + dir); else d.setFullYear(d.getFullYear() + dir);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  currentDate = toDateStr(d);
  renderAll();
}

// Barras do gráfico conforme o modo: refeições do dia, dias da semana/mês ou meses do ano
function trackBars(range) {
  if (trackMode === 'dia') {
    return currentMeals().map(m => ({ label: m.name.replace(/^\W+\s*/, '') || m.name, v: mealMacros(m).kcal }));
  }
  if (trackMode === 'ano') {
    const y = currentDate.slice(0, 4);
    return MONTHS_SHORT.map((name, i) => {
      const ds = monthDates(+y, i).filter(dayLogged);
      return { label: name, v: ds.length ? ds.reduce((t, d) => t + dayKcal(d), 0) / ds.length : null };
    });
  }
  return range.dates.map((d, i) => ({
    label: trackMode === 'semana' ? WEEKDAYS[i] : String(+d.slice(8)),
    v: dayLogged(d) ? dayKcal(d) : null,
    target: dayTarget(d)
  }));
}

function trackCardHtml() {
  const g = dietGoals();
  const range = trackRange();
  const logged = range.dates.filter(dayLogged);
  const total = logged.reduce((t, d) => t + dayKcal(d), 0);
  const avgMacros = sumMacros(logged.map(d => dayMacros(dayNutri(d))));
  Object.keys(avgMacros).forEach(k => { avgMacros[k] = logged.length ? avgMacros[k] / logged.length : 0; });
  const isDay = trackMode === 'dia';
  const main = isDay ? total : avgMacros.kcal;
  const progress = g.kcal ? Math.round(main / (isDay ? dayTarget(currentDate) : g.kcal) * 100) : null;

  // Ranking de ingestão: alimentos que mais somaram calorias no período
  const rank = new Map();
  logged.forEach(d => (dayNutri(d).meals || []).forEach(m => (m.items || []).forEach(it => {
    const r = rank.get(it.foodId) || { kcal: 0, times: 0 };
    r.kcal += itemMacros(it).kcal; r.times++;
    rank.set(it.foodId, r);
  })));
  const ranking = [...rank.entries()].sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 10);

  const tabs = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']].map(([v, l]) =>
    `<button class="period-btn ${trackMode === v ? 'active' : ''}" onclick="setTrackMode('${v}')">${l}</button>`).join('');
  const bars = trackBars(range);
  const hasBars = bars.some(b => b.v);

  return `
    <div class="entry-card track-card">
      <div class="entry-head"><span class="entry-name">📊 Acompanhamento</span></div>
      <div class="period-tabs full">${tabs}</div>
      <div class="period-nav">
        <button class="btn-icon" onclick="shiftTrack(-1)">◀</button>
        <b>${range.label}</b>
        <button class="btn-icon" onclick="shiftTrack(1)">▶</button>
      </div>
      ${logged.length ? `
        <div class="track-head">
          <div><small>${isDay ? 'Quantidade total' : 'Média por dia'}</small><b>${fmtKcal(main)}<small> kcal</small></b></div>
          <div class="right"><small>Progresso</small><b>${progress !== null ? progress + '<small>%</small>' : '—'}</b></div>
        </div>
        ${isDay ? '' : `<p class="bal-sub">${logged.length} dia${logged.length === 1 ? '' : 's'} registrado${logged.length === 1 ? '' : 's'} · total ${fmtKcal(total)} kcal</p>`}
        ${hasBars ? '<div class="track-chart-wrap"><canvas id="track-chart"></canvas></div>' : ''}
        ${isDay ? '' : macroBarsHtml(avgMacros, g)}
        <p class="bio-group">🏆 Ranking de ingestão</p>
        ${ranking.map(([id, r], i) => {
          const f = getFood(id);
          return `<div class="rank-row"><span class="rank-pos">${i + 1}</span>
            <span class="rank-name">${f ? esc(f.name) : '(excluído)'}${r.times > 1 ? ` <small>${r.times}×</small>` : ''}</span>
            <b>${fmtKcal(r.kcal)} kcal</b></div>`;
        }).join('')}` : `<p class="meal-empty">Nenhuma refeição registrada nesse período.</p>`}
    </div>`;
}

// Linha tracejada da meta de calorias por cima das barras
const goalLinePlugin = {
  id: 'goalLine',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts.value) return;
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { left, right } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = opts.color; ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('meta', right, y - 2);
    ctx.restore();
  }
};

function drawTrackChart() {
  if (trackChart) { trackChart.destroy(); trackChart = null; }
  const canvas = document.getElementById('track-chart');
  if (!canvas) return;
  const g = dietGoals();
  const bars = trackBars(trackRange());
  const dark = document.body.classList.contains('dark');
  const muted = dark ? '#94a3b8' : '#6b7280';
  const goalForBars = trackMode === 'dia' ? null : g.kcal;
  trackChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: bars.map(b => b.label),
      datasets: [{
        data: bars.map(b => b.v === null ? null : Math.round(b.v)),
        backgroundColor: bars.map(b => goalForBars && b.v > (b.target || goalForBars) * 1.05 ? 'rgba(220,38,38,0.55)' : 'rgba(234,88,12,0.45)'),
        borderRadius: 6, maxBarThickness: 26
      }]
    },
    plugins: [goalLinePlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        goalLine: { value: goalForBars, color: muted },
        tooltip: { callbacks: { label: item => `${fmtKcal(item.raw)} kcal${trackMode === 'ano' ? ' (média/dia)' : ''}` } }
      },
      scales: {
        y: { beginAtZero: true, border: { display: false }, suggestedMax: goalForBars ? goalForBars * 1.1 : undefined,
             grid: { color: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' },
             ticks: { maxTicksLimit: 5, color: muted } },
        x: { grid: { display: false }, ticks: { color: muted, autoSkip: true, maxRotation: 0, font: { size: 10 } } }
      }
    }
  });
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
    ['musclePct', 'Percentual da massa muscular esquelética', '%', 1, 1], ['muscleKg', 'Peso da massa muscular', 'kg', 1, 1],
    ['smm', 'Peso da massa muscular esquelética', 'kg', 1, 1], ['muscleRate', 'Registro de massa muscular', '%', 1, 1],
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
  wrap.innerHTML = (rec && !bioEditing ? bioHeadlineHtml(rec) + bioViewHtml(rec) + bioAnalysisHtml(rec) : bioFormHtml(rec)) +
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
        <div class="bio-fields">
          ${g.metrics.map(([k, label, unit]) => {
            const val = rec && rec[k] !== undefined ? rec[k] : (!rec && defaults[k] !== undefined ? defaults[k] : '');
            const ph = prevRec[k] !== undefined ? prevRec[k] : '';
            return `<div class="bio-field">
              <label for="bio-${k}">${label}${k === 'w' ? ' <b>*</b>' : ''}</label>
              <input type="number" id="bio-${k}" step="any" min="0" inputmode="decimal" value="${val}" placeholder="${ph}">
              <span class="unit">${unit}</span></div>`;
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
  const refs = bioRefs(rec, currentDate);
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">📋 Métricas corporais</span>
      </div>
      ${hasPrev ? `<p class="bal-sub">Δ = diferença para o último valor anterior de cada métrica · <span class="bio-delta good">verde</span> na direção boa, <span class="bio-delta bad">vermelho</span> na direção ruim</p>` : ''}
      ${BIO_GROUPS.map(g => {
        const rows = g.metrics.filter(([k]) => rec[k] !== undefined).map(([k]) => {
          const m = bioMetric(k);
          const d = prev[k] !== undefined ? fmtBioDelta(m, rec[k] - prev[k]) : '';
          const c = classifyBio(k, rec[k], refs);
          return `<div class="bal-row bio-row"><span>${m.label}</span>
            <span class="bio-val"><span><b>${fmtBio(m, rec[k])}</b> ${d}</span>${c ? `<span class="bio-tag ${c.tone}">${c.label}</span>` : ''}</span></div>`;
        }).join('');
        return rows ? `<p class="bio-group">${g.name}</p>${rows}` : '';
      }).join('')}
    </div>`;
}

/* ── Faixas de referência e análises derivadas (como as da balança) ──
   Peso/IMC: limites da OMS (18,5 / 24,9 / 29,9), iguais aos da balança dela.
   Demais métricas: faixas gerais aproximadas por sexo — servem de orientação, não de diagnóstico. */
const TONES = { low: 'low', good: 'good', warn: 'warn', bad: 'bad' };

function bioContext(rec, date) {
  const p = cache.profile || {};
  const sex = p.sex === 'M' ? 'M' : 'F';
  const hCm = Number(rec.height || p.height) || 0;
  const age = Number(rec.age) || (p.birthYear ? Number(date.slice(0, 4)) - Number(p.birthYear) : 0);
  return { sex, h: hCm / 100, age, w: Number(rec.w) || 0 };
}

// Cada referência: limites (cuts) e as faixas entre eles [nome, tom]
function bioRefs(rec, date) {
  const { sex, h, age, w } = bioContext(rec, date);
  const F = sex === 'F';
  const bmiBands = [['Baixo', 'low'], ['Saudável', 'good'], ['Alto', 'warn'], ['Obeso', 'bad']];
  const bfCuts = F ? [21, 28, 38] : [11, 21, 28];
  const bfBands = [['Baixo', 'low'], ['Saudável', 'good'], ['Alto', 'warn'], ['Muito alto', 'bad']];
  const boneStd = F ? (w < 50 ? 1.8 : w <= 75 ? 2.2 : 2.5) : (w < 65 ? 2.5 : w <= 95 ? 2.9 : 3.2);
  const smmCuts = F ? [25, 30] : [33, 39];
  const refs = {
    imc: { cuts: [18.5, 24.9, 29.9], bands: bmiBands },
    bf: { cuts: bfCuts, bands: bfBands },
    visceral: { cuts: [9.5, 14.5], bands: [['Saudável', 'good'], ['Alto', 'warn'], ['Muito alto', 'bad']] },
    obesity: { cuts: [-10, 10, 20], bands: [['Abaixo', 'low'], ['Saudável', 'good'], ['Acima', 'warn'], ['Obeso', 'bad']] },
    waterPct: { cuts: F ? [50, 60] : [55, 65], bands: [['Baixo', 'warn'], ['Saudável', 'good'], ['Excelente', 'good']] },
    protein: { cuts: [16, 20], bands: [['Baixo', 'warn'], ['Saudável', 'good'], ['Excelente', 'good']] },
    musclePct: { cuts: smmCuts, bands: [['Baixo', 'warn'], ['Saudável', 'good'], ['Excelente', 'good']] },
    bone: { cuts: [boneStd - 0.1], bands: [['Baixo', 'warn'], ['Excelente', 'good']] }
  };
  if (h) refs.w = { cuts: [18.5, 24.9, 29.9].map(b => b * h * h), bands: bmiBands };
  if (w) {
    refs.fatKg = { cuts: bfCuts.map(c => c * w / 100), bands: bfBands };
    refs.smm = { cuts: smmCuts.map(c => c * w / 100), bands: refs.musclePct.bands };
  }
  if (age) refs.metaAge = { cuts: [age + 0.5], bands: [['Excelente', 'good'], ['Acima da idade', 'warn']] };
  return refs;
}

function classifyBio(k, v, refs) {
  const r = refs[k];
  if (!r || v === undefined || v === null) return null;
  const i = r.cuts.filter(c => v >= c).length;
  const [label, tone] = r.bands[i];
  return { label, tone: TONES[tone], index: i };
}

// Posição (0 a 1) do valor na barra colorida, com faixas de larguras iguais
function rangePos(v, cuts) {
  const span = cuts.length > 1 ? cuts[1] - cuts[0] : cuts[0] * 0.3;
  const bounds = [cuts[0] - span, ...cuts, cuts[cuts.length - 1] + span];
  const n = bounds.length - 1;
  let i = bounds.findIndex((b, j) => j < n && v < bounds[j + 1]);
  if (i < 0) i = n - 1;
  const frac = (v - bounds[i]) / (bounds[i + 1] - bounds[i]);
  return Math.max(0.01, Math.min(0.99, (i + Math.max(0, Math.min(1, frac))) / n));
}

function rangeBarHtml(v, ref, fmtCut) {
  const pos = rangePos(v, ref.cuts);
  return `
    <div class="range-bar">
      <div class="range-track">${ref.bands.map(([, tone]) => `<span class="${tone}"></span>`).join('')}</div>
      <div class="range-marker" style="left:${(pos * 100).toFixed(1)}%"></div>
      <div class="range-cuts">${ref.cuts.map((c, i) =>
        `<span style="left:${((i + 1) / ref.bands.length * 100).toFixed(1)}%">${fmtCut(c)}</span>`).join('')}</div>
      <div class="range-labels">${ref.bands.map(([l]) => `<span>${l}</span>`).join('')}</div>
    </div>`;
}

/* Destaque do peso: classificação, barra, comparação com a última vez e melhor dos 30 dias */
function bioHeadlineHtml(rec) {
  const refs = bioRefs(rec, currentDate);
  const c = classifyBio('w', rec.w, refs);
  const before = bioDates().filter(d => d < currentDate && cache.weights[d].w !== undefined);
  const prevD = before[before.length - 1];
  const from = parseDate(currentDate); from.setDate(from.getDate() - 29);
  const last30 = bioDates().filter(d => d >= toDateStr(from) && d <= currentDate && cache.weights[d].w !== undefined);
  const best = last30.length > 1 ? last30.reduce((a, b) => cache.weights[b].w < cache.weights[a].w ? b : a) : null;
  const delta = prevD ? rec.w - cache.weights[prevD].w : null;
  return `
    <div class="entry-card bio-headline">
      <div class="entry-head">
        <span class="entry-name">🧬 Medição de ${fmtDateFull(currentDate)}</span>
        <div class="hist-actions">
          <button class="btn-tiny" title="Editar" onclick="bioEditing=true;renderCorpo()">✏️</button>
          <button class="btn-tiny danger" title="Apagar" onclick="deleteBio()">🗑</button>
        </div>
      </div>
      <div class="headline-weight">
        <b>${fmtNum(rec.w)}<small> kg</small></b>
        ${c ? `<span class="bio-tag ${c.tone}">${c.label}</span>` : ''}
      </div>
      ${refs.w ? rangeBarHtml(rec.w, refs.w, v => fmtNum(Math.round(v * 100) / 100))
               : '<p class="food-hint">Preencha a altura no perfil (aba Balanço) para ver a faixa do peso.</p>'}
      <div class="headline-stats">
        <div><span>Comparado com a última vez${prevD ? ` (${fmtDateFull(prevD)})` : ''}</span>
          <b>${delta !== null ? fmtSigned(delta, 1) + ' kg' : '--'}</b></div>
        <div><span>Melhor peso de 30 dias</span>
          <b>${best ? `${fmtNum(cache.weights[best].w)} kg <small>(${fmtDateShort(best)})</small>` : '--'}</b></div>
      </div>
    </div>`;
}

/* Tipo de corpo: IMC × % de gordura */
const BODY_TYPES = {
  // [linha do IMC: 0 baixo, 1 normal, 2 alto][coluna da gordura: 0 baixa, 1 padrão, 2 alta]
  grid: [
    ['Magro', 'Abaixo do peso', 'Magro com gordura alta'],
    ['Muscular esbelto', 'Saudável', 'Obesidade oculta'],
    ['Atlético', 'Muscular acima do peso', 'Obesidade']
  ],
  tips: {
    'Magro': 'Peso e gordura baixos. Foco: comer um pouco acima do gasto e treinar força para ganhar massa muscular.',
    'Abaixo do peso': 'Gordura na faixa, mas peso abaixo. Foco: superávit leve com treino de força e proteína para ganhar músculo.',
    'Magro com gordura alta': 'Peso baixo, mas gordura alta — sinal de pouca massa muscular. Foco: treino de força e proteína, sem cortar calorias.',
    'Muscular esbelto': 'Pouca gordura com peso normal. Foco: manter o treino e a proteína.',
    'Saudável': 'Peso e gordura na faixa saudável. Foco: manter e seguir ganhando força.',
    'Obesidade oculta': 'Peso normal, mas gordura alta e pouca massa muscular. Foco: ganhar músculo (força + proteína) mais do que baixar o peso.',
    'Atlético': 'IMC alto por causa da massa muscular, com pouca gordura. O IMC sozinho exagera aqui.',
    'Muscular acima do peso': 'IMC alto em parte por músculo, com gordura na faixa. Foco: manter o treino e reduzir gordura aos poucos.',
    'Obesidade': 'Peso e gordura acima da faixa. Foco: déficit moderado (300–500 kcal) com treino de força e proteína alta, para perder gordura preservando músculo.'
  }
};

function bioAnalysisHtml(rec) {
  const ctx = bioContext(rec, currentDate);
  const refs = bioRefs(rec, currentDate);
  const cards = [];
  const tag = (k, v) => { const c = classifyBio(k, v, refs); return c ? `<span class="bio-tag ${c.tone}">${c.label}</span>` : ''; };

  // 1) Composição: Peso = Água + Gordura + Proteína + Ossos
  const parts = [
    ['💧 Água', rec.waterKg, 'waterPct', rec.waterPct],
    ['🧈 Gordura', rec.fatKg !== undefined ? rec.fatKg : (rec.bf ? rec.w * rec.bf / 100 : undefined), 'bf', rec.bf],
    ['🥩 Proteína', rec.protein ? rec.w * rec.protein / 100 : undefined, 'protein', rec.protein],
    ['🦴 Ossos', rec.bone, 'bone', rec.bone]
  ].filter(p => p[1] !== undefined);
  if (parts.length >= 2) {
    const sum = parts.reduce((t, p) => t + Number(p[1]), 0);
    cards.push(`
      <div class="entry-card">
        <div class="entry-head"><span class="entry-name">🧪 Análise da composição</span></div>
        <p class="bal-sub">Peso = Água + Gordura + Proteína + Ossos</p>
        ${parts.map(([name, kg, key, val]) => `
          <div class="comp-row">
            <div class="comp-head"><span>${name}</span>${tag(key, val)}</div>
            <div class="comp-track"><div class="comp-fill" style="width:${Math.min(100, kg / rec.w * 100).toFixed(1)}%"></div>
              <b>${fmtNum(Math.round(kg * 10) / 10)} kg</b></div>
          </div>`).join('')}
        <p class="bio-sum-foot">Soma: ${fmtNum(Math.round(sum * 10) / 10)} de ${fmtNum(rec.w)} kg${Math.abs(sum - rec.w) >= 0.5
          ? ' — a balança estima cada parte separadamente, então a soma não fecha exata.' : '.'}</p>
      </div>`);
  }

  // 2) Tipo de corpo (precisa de IMC e % gordura)
  const bmi = rec.imc || (ctx.h ? rec.w / ctx.h / ctx.h : null);
  if (bmi && rec.bf) {
    const row = bmi < 18.5 ? 0 : bmi < 24.9 ? 1 : 2;
    const bfCuts = refs.bf.cuts;
    const col = rec.bf < bfCuts[0] ? 0 : rec.bf < bfCuts[1] ? 1 : 2;
    const type = BODY_TYPES.grid[row][col];
    cards.push(`
      <div class="entry-card">
        <div class="entry-head"><span class="entry-name">🧍 Tipo de corpo</span></div>
        <div class="body-type">
          <div class="bt-y">${['≥ 24,9', '18,5–24,9', '< 18,5'].map(l => `<span>${l}</span>`).join('')}</div>
          <div class="bt-grid">${[2, 1, 0].map(r => [0, 1, 2].map(cIdx =>
            `<div class="bt-cell ${r === row && cIdx === col ? 'active ' + (r === 1 && cIdx === 1 ? 'good' : 'warn') : ''}">${BODY_TYPES.grid[r][cIdx]}</div>`).join('')).join('')}</div>
          <div></div>
          <div class="bt-x"><span>gordura baixa</span><span>${bfCuts[0]}%</span><span>padrão</span><span>${bfCuts[1]}%</span><span>alta</span></div>
        </div>
        <p class="bt-axis-note">↕ IMC (${fmtNum(Math.round(bmi * 10) / 10)}) · ↔ % de gordura (${fmtNum(rec.bf)}%)</p>
        <div class="bal-note"><b>${type}:</b> ${BODY_TYPES.tips[type]}</div>
      </div>`);
  }

  // 3) Controle de peso: peso "ideal" pelo IMC × meta realista pela composição
  if (ctx.h) {
    const ideal = 21 * ctx.h * ctx.h;
    const rows = [`
      <div class="ctrl-row"><span>⚖️ Peso ideal pelo IMC (21)</span><b>${fmtNum(Math.round(ideal * 10) / 10)} kg</b></div>
      <p class="ctrl-sub">${rec.w > ideal ? `${fmtNum(Math.round((rec.w - ideal) * 10) / 10)} kg acima` : `${fmtNum(Math.round((ideal - rec.w) * 10) / 10)} kg abaixo`} — é a conta que a balança usa, mas ela não diferencia músculo de gordura.</p>`];
    if (rec.bf) {
      const targetBf = (refs.bf.cuts[0] + refs.bf.cuts[1]) / 2;
      const lean = rec.w * (1 - rec.bf / 100);
      const targetW = lean / (1 - targetBf / 100);
      const fatToLose = rec.w - targetW;
      if (fatToLose > 0.3) {
        const weeks = Math.ceil(fatToLose / 0.5);
        rows.push(`
          <div class="ctrl-row"><span>🎯 Meta pela composição</span><b>${fmtNum(Math.round(targetW * 10) / 10)} kg</b></div>
          <p class="ctrl-sub">Mantendo sua massa magra (${fmtNum(Math.round(lean * 10) / 10)} kg) e chegando a <b>${fmtNum(targetBf)}% de gordura</b> (meio da faixa saudável):
            perder <b>~${fmtNum(Math.round(fatToLose * 10) / 10)} kg de gordura</b>. No ritmo de 0,5 kg/semana, cerca de <b>${weeks} semanas</b>.
            Costuma ser uma meta mais realista que o peso do IMC, porque não pede para perder músculo.</p>`);
      } else {
        rows.push(`<p class="ctrl-sub">✅ Sua % de gordura já está na faixa saudável: o foco pode ser manter e ganhar massa muscular.</p>`);
      }
    }
    cards.push(`
      <div class="entry-card">
        <div class="entry-head"><span class="entry-name">💡 Controle de peso</span></div>
        ${rows.join('')}
        <p class="bio-sum-foot">Faixas de referência gerais (OMS para IMC; demais aproximadas por sexo). Não substituem avaliação de nutricionista ou médico.</p>
      </div>`);
  }
  return cards.join('');
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

// Nomes curtos para as abas de métrica
const BIO_SHORT = {
  w: 'Peso', imc: 'IMC', height: 'Altura', age: 'Idade', bf: 'Gordura', fatKg: 'Peso gordura',
  visceral: 'Visceral', obesity: 'Obesidade', musclePct: '% Músc. esquel.', muscleKg: 'Massa muscular',
  smm: 'Músc. esquelético', muscleRate: 'Reg. massa musc.', lbm: 'LBM', bone: 'Ossos', protein: 'Proteína',
  waterPct: 'Água', waterKg: 'Peso água', bmr: 'Metabolismo', metaAge: 'Idade metab.'
};
const MAX_POINTS = 16;

// Agrupa as medições para o gráfico não virar um borrão: por medição, semana, 2 semanas ou mês
function bioBuckets(series) {
  if (series.length <= MAX_POINTS) {
    return { by: 'medição', points: series.map(x => ({ label: fmtDateShort(x.date), title: fmtDateFull(x.date), v: x.v, n: 1 })) };
  }
  const t0 = parseDate(series[0].date), t1 = parseDate(series[series.length - 1].date);
  const span = (t1 - t0) / 864e5 + 1;
  const mode = span / 7 <= MAX_POINTS ? 7 : span / 14 <= MAX_POINTS ? 14 : 'mes';
  const monday = d => { const x = parseDate(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const ref = monday(series[0].date);
  const groups = new Map();
  series.forEach(x => {
    let key, start;
    if (mode === 'mes') { key = x.date.slice(0, 7); start = key + '-01'; }
    else {
      const idx = Math.floor(Math.round((monday(x.date) - ref) / 864e5) / mode);
      const s = new Date(ref); s.setDate(s.getDate() + idx * mode);
      key = idx; start = toDateStr(s);
    }
    if (!groups.has(key)) groups.set(key, { start, vals: [] });
    groups.get(key).vals.push(x.v);
  });
  const points = [...groups.values()].map(g => {
    const [y, mo] = g.start.split('-');
    return {
      label: mode === 'mes' ? `${MONTHS_SHORT[+mo - 1]}/${y.slice(2)}` : fmtDateShort(g.start),
      title: mode === 'mes' ? `${MONTHS[+mo - 1]} de ${y}` : `${mode === 7 ? 'Semana' : '2 semanas'} a partir de ${fmtDateFull(g.start)}`,
      v: g.vals.reduce((a, b) => a + b, 0) / g.vals.length, n: g.vals.length
    };
  });
  return { by: mode === 'mes' ? 'mês' : mode === 7 ? 'semana' : '2 semanas', points };
}

function bioChartCardHtml() {
  const available = BIO_METRICS.filter(m => bioDates().some(d => cache.weights[d][m.k] !== undefined));
  if (!available.length) return '';
  if (!available.some(m => m.k === bioChartKey)) bioChartKey = available[0].k;
  const m = bioMetric(bioChartKey);
  const series = bioSeries(bioChartKey);
  const tabs = available.map(a =>
    `<button class="metric-tab ${a.k === bioChartKey ? 'active' : ''}" onclick="bioChartKey='${a.k}';renderCorpo()">${BIO_SHORT[a.k] || a.label}</button>`).join('');
  const ranges = [['3', '3 meses'], ['6', '6 meses'], ['12', '1 ano'], ['tudo', 'Tudo']].map(([v, l]) =>
    `<button class="period-btn ${bioChartRange === v ? 'active' : ''}" onclick="bioChartRange='${v}';renderCorpo()">${l}</button>`).join('');

  let body = '<p class="bal-sub">Sem medições dessa métrica no intervalo.</p>';
  if (series.length) {
    const first = series[0], last = series[series.length - 1];
    const max = series.reduce((a, b) => b.v > a.v ? b : a), min = series.reduce((a, b) => b.v < a.v ? b : a);
    const avg = series.reduce((t, x) => t + x.v, 0) / series.length;
    const days = Math.round((parseDate(last.date) - parseDate(first.date)) / 864e5) + 1;
    const delta = last.v - first.v;
    const dir = !m.good || Math.abs(delta) < 1e-9 ? '' : (delta * m.good > 0 ? 'good' : 'bad');
    const arrow = Math.abs(delta) < 1e-9 ? '' : delta > 0 ? '↑' : '↓';
    const num = v => fmtNum(Math.round(v * 10 ** m.dec) / 10 ** m.dec);
    const unit = m.unit ? ` (${m.unit})` : '';
    const buckets = bioBuckets(series);
    body = `
      ${series.length > 1 ? '<div class="body-chart-wrap"><canvas id="body-chart"></canvas></div>' : ''}
      <div class="bio-summary">
        <div class="bio-sum-head">
          <span>${bioChartRange === 'tudo' ? 'Todo o período' : 'Nos últimos'} · ${days} dia${days === 1 ? '' : 's'}</span>
          <span>${fmtDateFull(first.date)} ~ ${fmtDateFull(last.date)}</span>
        </div>
        <div class="bio-sum-grid">
          <div><b>${num(avg)}</b><small>${m.k === 'w' ? 'Peso médio' : 'Média'}${unit}</small></div>
          <div class="right"><b class="bio-delta-big ${dir}">${arrow} ${num(Math.abs(delta))}</b><small>Variação</small></div>
          <div><b>${num(max.v)}</b><small>Máximo<br>${fmtDateFull(max.date)}</small></div>
          <div class="right"><b>${num(min.v)}</b><small>Mínimo<br>${fmtDateFull(min.date)}</small></div>
        </div>
        <p class="bio-sum-foot">${series.length} medições${buckets.by !== 'medição' ? ` · cada ponto do gráfico é a média por ${buckets.by}` : ''}</p>
      </div>`;
  }
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">📈 Evolução · ${m.label}</span></div>
      <div class="metric-tabs" id="metric-tabs">${tabs}</div>
      <div class="period-tabs full">${ranges}</div>
      ${body}
    </div>`;
}

// Escreve o valor em cima de cada ponto (pulando alguns se ficarem apertados)
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, args, opts) {
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;
    if (!meta.data.length) return;
    const gap = meta.data.length > 1 ? Math.abs(meta.data[1].x - meta.data[0].x) : 999;
    const step = Math.max(1, Math.ceil(34 / gap));
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = opts.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    meta.data.forEach((pt, i) => {
      const isLast = i === meta.data.length - 1;
      if (i % step && !isLast) return;
      if (!isLast && step > 1 && meta.data.length - 1 - i < step) return;  // evita colar no último
      const text = opts.format(data[i]);
      const half = ctx.measureText(text).width / 2;
      const x = Math.min(Math.max(pt.x, half + 2), chart.width - half - 2);  // não deixa cortar nas bordas
      ctx.fillText(text, x, pt.y - 7);
    });
    ctx.restore();
  }
};

function drawBodyChart() {
  if (bodyChart) { bodyChart.destroy(); bodyChart = null; }
  const canvas = document.getElementById('body-chart');
  // Mantém a aba de métrica ativa visível na barra rolável
  const tabsEl = document.getElementById('metric-tabs');
  const active = tabsEl && tabsEl.querySelector('.active');
  if (active) tabsEl.scrollLeft = active.offsetLeft - tabsEl.clientWidth / 2 + active.clientWidth / 2;
  if (!canvas) return;
  const m = bioMetric(bioChartKey);
  const { points } = bioBuckets(bioSeries(bioChartKey));
  const dark = document.body.classList.contains('dark');
  const muted = dark ? '#94a3b8' : '#6b7280';
  const fmt = v => fmtNum(Math.round(v * 10 ** m.dec) / 10 ** m.dec);
  bodyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.label),
      datasets: [{
        data: points.map(p => Math.round(p.v * 100) / 100),
        borderColor: '#ea580c', borderWidth: 2.5,
        backgroundColor: 'rgba(234,88,12,0.07)', fill: 'start', tension: 0.4,
        pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: dark ? '#1a1d27' : '#fff',
        pointBorderColor: '#ea580c', pointBorderWidth: 2
      }]
    },
    plugins: [valueLabelsPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 14, left: 4 } },
      plugins: {
        legend: { display: false },
        valueLabels: { color: muted, format: fmt },
        tooltip: { callbacks: {
          title: items => points[items[0].dataIndex].title,
          label: item => {
            const p = points[item.dataIndex];
            return `${p.n > 1 ? 'média ' : ''}${fmtBio(m, p.v)}${p.n > 1 ? ` (${p.n} medições)` : ''}`;
          }
        } }
      },
      scales: {
        y: { grace: '12%', border: { display: false },
             grid: { color: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' },
             ticks: { maxTicksLimit: 5, color: muted, callback: v => fmtNum(Math.round(v * 10) / 10) } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: muted, maxRotation: 0 } }
      }
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
  return `
    <div class="entry-card">
      <div class="entry-head"><span class="entry-name">🗂️ Histórico de medições</span></div>
      ${importUndo ? `
        <div class="bal-note import-done">✅ ${importUndo.count} medições importadas.
          <button class="btn-mini" onclick="undoImport()">↩ Desfazer</button></div>` : ''}
      <button class="btn-add-serie import-btn" onclick="document.getElementById('import-file').click()">📥 Importar planilha da balança (.xlsx / .csv)</button>
      ${dates.length ? '' : '<p class="meal-empty">Nenhuma medição registrada ainda.</p>'}
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
   IMPORTAR PLANILHA DE BIOIMPEDÂNCIA
══════════════════════════════════ */
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Nomes de coluna reconhecidos (já normalizados: minúsculas, sem acento, sem unidade entre parênteses)
const IMPORT_COLUMNS = {
  date:       ['data', 'date', 'dia'],
  year:       ['ano', 'year'],
  time:       ['tempo', 'hora', 'horario', 'time'],
  w:          ['peso', 'weight'],
  imc:        ['imc', 'bmi'],
  height:     ['altura', 'height'],
  age:        ['idade', 'idadereal', 'age'],
  bf:         ['percentagemdegordura', 'percentualdegordura', 'gordura', 'gorduracorporal', 'bodyfat'],
  fatKg:      ['pesodagordura', 'massagorda', 'fatmass'],
  visceral:   ['gorduravisceral', 'visceral', 'visceralfat'],
  obesity:    ['obesidade', 'percentualdeobesidade', 'obesity'],
  musclePct:  ['percentualdamassamuscularesqueletica', 'percentualdemassamuscularesqueletica', 'percentualdamassamuscular', 'percentualdemassamuscular'],
  muscleKg:   ['pesodamassamuscular', 'massamuscular', 'musclemass'],
  smm:        ['pesodamassamuscularesqueletica', 'massamuscularesqueletica', 'smm'],
  muscleRate: ['registrodemassamuscular'],
  lbm:        ['lbm', 'massamagra', 'massaisentadegordura'],
  bone:       ['ossos', 'massaossea', 'bone'],
  protein:    ['proteina', 'protein'],
  waterPct:   ['agua', 'percentualdeagua', 'water'],
  waterKg:    ['pesodaagua'],
  bmr:        ['metabolismo', 'metabolismobasal', 'tmb', 'bmr'],
  metaAge:    ['idademetabolica', 'metabolicage']
};

let importState = null;  // {fileName, header, rows, mapping[], order, conflict}
let importUndo = null;   // {count, backup} — cópia de weights antes da importação

function normHeader(h) {
  return String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
}

function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error('não foi possível carregar o leitor de planilhas (sem internet?)'));
    document.head.appendChild(s);
  });
}

async function handleImportFile(input) {
  const file = input.files[0];
  input.value = '';  // permite escolher o mesmo arquivo de novo
  if (!file) return;
  try {
    await loadXlsxLib();
    // raw: em CSV, não deixar a biblioteca converter "01/10/2025" como data americana (mês/dia)
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    // Linha de cabeçalho = primeira com pelo menos 3 textos
    const hi = all.findIndex(r => r.filter(c => typeof c === 'string' && c.trim() && isNaN(Number(c))).length >= 3);
    if (hi < 0) throw new Error('não encontrei a linha de títulos das colunas');
    const header = all[hi].map(h => String(h).trim());
    const rows = all.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== ''));
    importState = { fileName: file.name, header, rows, mapping: autoMapColumns(header, rows), order: null, conflict: 'merge' };
    importState.order = detectDateOrder();
    renderImportModal();
    document.getElementById('modal-import').classList.add('show');
  } catch (e) {
    alert('Não consegui ler a planilha: ' + e.message);
  }
}

function autoMapColumns(header, rows) {
  const used = new Set();
  const mapping = header.map(h => {
    const n = normHeader(h);
    const key = Object.keys(IMPORT_COLUMNS).find(k => !used.has(k) && IMPORT_COLUMNS[k].includes(n));
    if (key) used.add(key);
    return key || '';
  });
  // Coluna de ano sem título (como na exportação da balança): só números entre 1990 e 2100
  if (!used.has('year')) {
    header.forEach((h, i) => {
      if (mapping[i] || used.has('year')) return;
      const vals = rows.map(r => r[i]).filter(v => String(v).trim() !== '');
      if (vals.length && vals.every(v => { const n = Number(v); return Number.isInteger(n) && n >= 1990 && n <= 2100; })) {
        mapping[i] = 'year'; used.add('year');
      }
    });
  }
  return mapping;
}

function importNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[^\d.,\-]/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Partes de data de uma célula: {y,m,d} já resolvido, ou {a,b,y?} quando dia/mês é ambíguo
function dateParts(cell, yearCell) {
  if (typeof cell === 'number' && cell > 20000 && cell < 80000) {  // data serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const s = String(cell).trim();
  let r;
  if ((r = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return { y: +r[1], m: +r[2], d: +r[3] };
  if ((r = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) return { a: +r[1], b: +r[2], y: r[3].length === 2 ? 2000 + +r[3] : +r[3] };
  if ((r = s.match(/^(\d{1,2})[-\/.](\d{1,2})$/))) {
    const y = importNum(yearCell);
    return { a: +r[1], b: +r[2], y: y ? Math.round(y) : new Date().getFullYear() };
  }
  return null;
}

function colIndex(key) { return importState.mapping.indexOf(key); }

// Decide se "10-01" é mês-dia ou dia-mês olhando todas as linhas
function detectDateOrder() {
  const di = colIndex('date'), yi = colIndex('year');
  if (di < 0) return 'DM';
  return guessDateOrder(importState.rows.map(r => dateParts(r[di], yi >= 0 ? r[yi] : '')));
}

// Recebe partes de datas ({a,b,y} ambíguas ou {y,m,d}) e decide entre dia-mês e mês-dia
function guessDateOrder(parts) {
  const pairs = parts.filter(p => p && p.a !== undefined);
  if (!pairs.length) return 'DM';
  if (pairs.some(p => p.a > 12)) return 'DM';
  if (pairs.some(p => p.b > 12)) return 'MD';
  // Ambíguo: escolhe a leitura em que as medições ficam mais próximas umas das outras
  const span = order => {
    const t = pairs.map(p => new Date(p.y, (order === 'MD' ? p.a : p.b) - 1, order === 'MD' ? p.b : p.a).getTime());
    return Math.max(...t) - Math.min(...t);
  };
  return span('MD') < span('DM') ? 'MD' : 'DM';
}

function resolveDate(p, order) {
  if (!p) return null;
  const y = p.y, m = p.m !== undefined ? p.m : (order === 'MD' ? p.a : p.b), d = p.d !== undefined ? p.d : (order === 'MD' ? p.b : p.a);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;  // ex.: 31/02
  return toDateStr(dt);
}

// Converte as linhas em registros {data: {métricas}} usando o mapeamento atual
function computeImport() {
  const st = importState;
  const di = colIndex('date'), yi = colIndex('year'), ti = colIndex('time');
  const metricCols = st.mapping.map((k, i) => [k, i]).filter(([k]) => bioMetric(k));
  const parsed = [];
  let invalid = 0, zeros = 0;
  st.rows.forEach((r, idx) => {
    const date = di >= 0 ? resolveDate(dateParts(r[di], yi >= 0 ? r[yi] : ''), st.order) : null;
    if (!date) { invalid++; return; }
    const entry = {};
    metricCols.forEach(([k, i]) => {
      const v = importNum(r[i]);
      if (v === null) return;
      if (v === 0 && k !== 'visceral') { zeros++; return; }  // balança exporta 0,00 quando não mediu
      entry[k] = v;
    });
    if (Object.keys(entry).length) parsed.push({ date, time: ti >= 0 ? String(r[ti]) : '', idx, entry });
  });
  // Mais de uma medição no dia: fica a mais recente (pelo horário; empate = a de baixo na planilha)
  parsed.sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.idx - y.idx);
  const records = {};
  let multi = 0;
  parsed.forEach(p => { if (records[p.date]) multi++; records[p.date] = p.entry; });
  const dates = Object.keys(records).sort();
  return {
    records, dates, invalid, zeros, multi,
    noWeight: dates.filter(d => !records[d].w).length,
    conflicts: dates.filter(d => cache.weights[d]).length,
    metricCols
  };
}

function renderImportModal() {
  const st = importState;
  const res = computeImport();
  const opts = sel => [['', '— ignorar —'], ['date', '📅 Data'], ['year', '📅 Ano'], ['time', '🕒 Horário']]
    .concat(BIO_METRICS.map(m => [m.k, m.label + (m.unit ? ` (${m.unit})` : '')]))
    .map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
  const sample = st.rows[0] || [];
  const ambiguous = colIndex('date') >= 0 && st.rows.some(r => {
    const p = dateParts(r[colIndex('date')], ''); return p && p.a !== undefined;
  });
  const warnings = [];
  if (colIndex('date') < 0) warnings.push('⚠️ Escolha qual coluna é a <b>Data</b>.');
  if (res.invalid) warnings.push(`⚠️ ${res.invalid} linha${res.invalid > 1 ? 's' : ''} sem data válida ${res.invalid > 1 ? 'serão ignoradas' : 'será ignorada'}.`);
  if (res.multi) warnings.push(`ℹ️ ${plural(res.multi, 'medição extra', 'medições extras')} no mesmo dia: fica só a mais recente de cada dia.`);
  if (res.zeros) warnings.push(`ℹ️ ${plural(res.zeros, 'valor 0 tratado', 'valores 0 tratados')} como "não medido".`);
  if (res.noWeight) warnings.push(`⚠️ ${plural(res.noWeight, 'medição sem peso entra', 'medições sem peso entram')} só com as outras métricas.`);
  const CONFLICT_HINTS = {
    merge: 'A planilha atualiza as métricas que ela tem e mantém o resto do registro do app (ex.: gordura visceral anotada à mão).',
    replace: 'O registro do app nesse dia é apagado e fica só o que veio da planilha.',
    keep: 'Esses dias ficam como estão no app; a planilha só preenche os dias novos.'
  };

  document.getElementById('import-body').innerHTML = `
    <p class="bal-sub">📄 <b>${esc(st.fileName)}</b> · ${st.rows.length} linhas</p>
    ${res.dates.length ? `
      <div class="bal-note">Encontrei <b>${res.dates.length} medições</b>, de <b>${fmtDateFull(res.dates[0])}</b> a <b>${fmtDateFull(res.dates[res.dates.length - 1])}</b>, com ${res.metricCols.length} métricas.</div>` : ''}
    ${warnings.map(w => `<p class="import-warn">${w}</p>`).join('')}

    ${ambiguous ? `
      <p class="bio-group">📅 Formato da data</p>
      <div class="period-tabs full">
        <button class="period-btn ${st.order === 'DM' ? 'active' : ''}" onclick="importState.order='DM';renderImportModal()">dia-mês</button>
        <button class="period-btn ${st.order === 'MD' ? 'active' : ''}" onclick="importState.order='MD';renderImportModal()">mês-dia</button>
      </div>
      <p class="food-hint">Ex.: a primeira linha "${esc(String(sample[colIndex('date')]))}" vira <b>${res.dates.length ? fmtDateFull(resolveDate(dateParts(sample[colIndex('date')], colIndex('year') >= 0 ? sample[colIndex('year')] : ''), st.order) || res.dates[0]) : '—'}</b>.</p>` : ''}

    ${res.conflicts ? `
      <p class="bio-group">🔁 ${res.conflicts} data${res.conflicts > 1 ? 's' : ''} já ${res.conflicts > 1 ? 'têm' : 'tem'} registro no app</p>
      <select class="bio-select" onchange="importState.conflict=this.value;renderImportModal()">
        <option value="merge" ${st.conflict === 'merge' ? 'selected' : ''}>Mesclar (recomendado)</option>
        <option value="replace" ${st.conflict === 'replace' ? 'selected' : ''}>Substituir pelo da planilha</option>
        <option value="keep" ${st.conflict === 'keep' ? 'selected' : ''}>Manter o que já está no app</option>
      </select>
      <p class="food-hint">${CONFLICT_HINTS[st.conflict]}</p>` : ''}

    <p class="bio-group">🧩 Colunas da planilha</p>
    <p class="food-hint">Reconheci as colunas pelo nome. Confira e corrija se precisar.</p>
    <div class="bio-fields">
      ${st.header.map((h, i) => `
        <div class="import-col">
          <div class="import-col-name"><b>${esc(h) || '<i>(sem título)</i>'}</b><small>ex.: ${esc(String(sample[i] ?? ''))}</small></div>
          <select onchange="importState.mapping[${i}]=this.value;importState.order=detectDateOrder();renderImportModal()">${opts(st.mapping[i])}</select>
        </div>`).join('')}
    </div>

    <button class="btn-primary btn-block import-confirm" ${res.dates.length ? '' : 'disabled'} onclick="confirmImport()">
      Importar ${plural(res.dates.length, 'medição', 'medições')}</button>`;
}

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

function fmtDateFull(str) { return parseDate(str).toLocaleDateString('pt-BR'); }

function confirmImport() {
  const res = computeImport();
  const backup = JSON.parse(JSON.stringify(cache.weights || {}));
  if (!cache.weights) cache.weights = {};
  let count = 0;
  res.dates.forEach(d => {
    const cur = cache.weights[d];
    if (cur && importState.conflict === 'keep') return;
    cache.weights[d] = cur && importState.conflict === 'merge' ? { ...cur, ...res.records[d] } : res.records[d];
    count++;
  });
  saveToCloud('weights');
  importUndo = { count, backup };
  bioCmp = { a: null, b: null };
  bioChartRange = 'tudo';
  closeModal('modal-import');
  importState = null;
  currentDate = res.dates[res.dates.length - 1];  // abre na medição mais recente importada
  renderAll();
}

function undoImport() {
  if (!importUndo || !confirm(`Desfazer a importação de ${importUndo.count} medições?`)) return;
  cache.weights = importUndo.backup;
  saveToCloud('weights');
  importUndo = null;
  bioCmp = { a: null, b: null };
  renderAll();
}

/* ══════════════════════════════════
   IMPORTAR / EXPORTAR HISTÓRICO DE DIETA
   Formatos: planilha (uma linha por alimento), JSON ({days:[...]}) ou backup do próprio app.
   Em planilha/JSON, os nutrientes de cada linha são o TOTAL do que foi comido naquela linha.
══════════════════════════════════ */
const DIET_COLUMNS = {
  date:  ['data', 'date', 'dia'],
  year:  ['ano', 'year'],
  time:  ['hora', 'horario', 'tempo', 'time'],
  meal:  ['refeicao', 'refeicoes', 'meal', 'tipo', 'tipoderefeicao'],
  food:  ['alimento', 'alimentos', 'comida', 'food', 'item', 'nome', 'name', 'produto'],
  qty:   ['quantidade', 'qtd', 'qtde', 'porcao', 'porcoes', 'quantity', 'amount', 'qty', 'gramas'],
  kcal:  ['calorias', 'caloria', 'kcal', 'cal', 'energia', 'calories'],
  prot:  ['proteina', 'proteinas', 'protein', 'prot'],
  carb:  ['carboidrato', 'carboidratos', 'carbo', 'carbs', 'hidratos', 'carbohydrates', 'carb'],
  gord:  ['gordura', 'gorduras', 'gorduratotal', 'lipidios', 'fat', 'gord'],
  fib:   ['fibra', 'fibras', 'fiber', 'fib'],
  acuc:  ['acucar', 'acucares', 'sugar', 'acuc'],
  sodio: ['sodio', 'sodium'],
  water: ['agua', 'water', 'aguaml']
};
const MEAL_ALIASES = [
  [/cafe|desjejum|breakfast|manha/, '☕ Café da manhã'],
  [/almoco|lunch/, '🍽️ Almoço'],
  [/jantar|janta|dinner/, '🌙 Jantar'],
  [/ceia/, '🍎 Ceia'],
  [/lanche|snack|colacao/, '🥪 Lanche']
];
const DIET_JSON_EXAMPLE = `{
  "days": [
    {
      "date": "2025-10-06",
      "water": 2000,
      "meals": [
        {
          "name": "Café da manhã",
          "items": [
            { "food": "Ovo", "qty": "2 unidades", "kcal": 156, "prot": 12.6, "carb": 1.2, "gord": 10.6 },
            { "food": "Café", "qty": "200ml", "kcal": 6 }
          ]
        },
        {
          "name": "Almoço",
          "items": [
            { "food": "Peixe (tilápia)", "qty": "150g", "kcal": 192, "prot": 39, "gord": 4 }
          ]
        }
      ]
    }
  ]
}`;

let dietImport = null;  // {kind:'sheet'|'json'|'backup', fileName, header, rows, mapping, order, conflict, json}
let dietUndo = null;    // {count, nutrition, foods, templates}

const clone = o => JSON.parse(JSON.stringify(o));
const round2 = n => Math.round(n * 100) / 100;
function normName(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function normMealName(s) {
  const raw = String(s || '').trim();
  if (!raw) return '🍽️ Refeição';
  const n = normHeader(raw);
  const hit = MEAL_ALIASES.find(([re]) => re.test(n));
  return hit ? hit[1] : raw;
}

// "120g" → {n:120, unit:'g'}; "2" → {n:2, unit:''} (número puro = porções); "1,5 kg" → {n:1500, unit:'g'}
function parseAmount(s) {
  const m = String(s ?? '').trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*([a-zà-ú]*)/);
  if (!m) return null;
  const n = +m[1];
  let unit = m[2] || '';
  if (unit === 'kg') return { n: n * 1000, unit: 'g' };
  if (/^(l|litro|litros)$/.test(unit)) return { n: n * 1000, unit: 'ml' };
  if (/^(g|gr|grama|gramas)$/.test(unit)) unit = 'g';
  else if (/^(un|und|unid|unidade|unidades)$/.test(unit)) unit = 'un';
  return { n, unit };
}

/* ── Tela inicial: escolher arquivo, colar JSON, baixar modelo, exportar ── */
function openDietImport() {
  dietImport = null;
  document.getElementById('diet-import-body').innerHTML = `
    <p class="food-hint">Importe refeições antigas de outro app ou de uma planilha. Cada linha (ou item do JSON) é <b>o que você comeu</b>, com os nutrientes daquela quantidade.</p>
    <button class="btn-primary btn-block" onclick="document.getElementById('diet-import-file').click()">📄 Escolher arquivo (.xlsx, .csv ou .json)</button>
    <button class="btn-add-serie" onclick="downloadDietTemplate()">⬇️ Baixar planilha modelo</button>

    <p class="bio-group">📋 Ou cole um JSON</p>
    <textarea id="diet-json-text" class="json-input" rows="5" placeholder='{ "days": [ { "date": "2025-10-06", "meals": [ ... ] } ] }'></textarea>
    <button class="btn-add-serie" onclick="readPastedDietJson()">Ler JSON colado</button>
    <details class="json-help">
      <summary>Ver formato do JSON</summary>
      <pre>${esc(DIET_JSON_EXAMPLE)}</pre>
      <p class="food-hint">Nomes de campo em português também funcionam (data, refeicao, alimento, quantidade, calorias, proteina, carboidratos, gordura, fibra, acucar, sodio, agua). Só <b>food</b> é obrigatório; o resto é opcional.</p>
    </details>
    <button class="btn-add-serie" onclick="copyAiPrompt()">🤖 Copiar instruções para uma IA transcrever prints do outro app</button>

    <p class="bio-group">📤 Backup</p>
    <button class="btn-add-serie" onclick="exportDietBackup()">📤 Exportar backup da dieta (JSON)</button>
    <p class="food-hint">O backup inclui alimentos, refeições prontas, refeições de todos os dias, água e metas. Dá para importar ele aqui de volta.</p>`;
  document.getElementById('modal-diet-import').classList.add('show');
}

async function downloadDietTemplate() {
  try {
    await loadXlsxLib();
    const aoa = [
      ['Data', 'Refeição', 'Alimento', 'Quantidade', 'Calorias', 'Proteína', 'Carboidratos', 'Gordura', 'Fibra', 'Açúcar', 'Sódio', 'Água (ml)'],
      ['06/10/2025', 'Café da manhã', 'Ovo', '2 unidades', 156, 12.6, 1.2, 10.6, 0, 0, 124, ''],
      ['06/10/2025', 'Café da manhã', 'Pão francês', '1 unidade', 135, 4.5, 28, 1.5, 1.2, 1.5, 290, ''],
      ['06/10/2025', 'Almoço', 'Arroz', '150g', 195, 3.8, 42, 0.5, 0.6, 0, 2, ''],
      ['06/10/2025', '', '', '', '', '', '', '', '', '', '', 2000]
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Dieta');
    XLSX.writeFile(wb, 'modelo-dieta-gymtrack.xlsx');
  } catch (e) { alert('Não consegui gerar o modelo: ' + e.message); }
}

function copyAiPrompt() {
  const prompt = `Transcreva o histórico de alimentação dos prints que vou enviar para este formato JSON, sem comentários, só o JSON:\n\n${DIET_JSON_EXAMPLE}\n\nRegras: uma entrada em "days" por dia (data no formato AAAA-MM-DD); em cada refeição, um item por alimento com o nome ("food"), a quantidade como aparece no print ("qty", ex.: "60g", "300ml", "2 unidades") e os nutrientes daquela quantidade (kcal, prot, carb, gord, fib, acuc em gramas e sodio em mg) quando aparecerem. Omita os campos que não aparecerem no print.`;
  navigator.clipboard.writeText(prompt)
    .then(() => alert('Instruções copiadas! Cole numa IA junto com os prints e depois cole o JSON que ela gerar aqui.'))
    .catch(() => { document.getElementById('diet-json-text').value = prompt; alert('Não consegui copiar automaticamente; deixei as instruções no campo de JSON para você copiar.'); });
}

function exportDietBackup() {
  const data = { app: 'gymtrack', version: 1, exportedAt: new Date().toISOString(),
                 foods: cache.foods, templates: cache.templates, nutrition: cache.nutrition, settings: cache.settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gymtrack-dieta-${toDateStr(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ── Leitura do arquivo / texto ── */
async function handleDietFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    if (/\.json$/i.test(file.name)) { startJsonImport(await file.text(), file.name); return; }
    await loadXlsxLib();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    const hi = all.findIndex(r => r.filter(c => typeof c === 'string' && c.trim() && isNaN(Number(c))).length >= 2);
    if (hi < 0) throw new Error('não encontrei a linha de títulos das colunas');
    const header = all[hi].map(h => String(h).trim());
    const rows = all.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== ''));
    const mapping = autoMapDiet(header, rows);
    dietImport = { kind: 'sheet', fileName: file.name, header, rows, mapping, conflict: 'skip' };
    dietImport.order = sheetDateOrder();
    renderDietImport();
  } catch (e) { alert('Não consegui ler o arquivo: ' + e.message); }
}

function readPastedDietJson() {
  const text = document.getElementById('diet-json-text').value.trim();
  if (!text) { alert('Cole o JSON no campo primeiro.'); return; }
  startJsonImport(text, 'JSON colado');
}

function startJsonImport(text, name) {
  let json;
  try {
    // Aceita JSON dentro de bloco de código (como IAs costumam responder)
    json = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch (e) { alert('O JSON tem algum erro de formatação: ' + e.message); return; }
  const isBackup = json && !Array.isArray(json) && (json.app === 'gymtrack' || json.nutrition);
  dietImport = { kind: isBackup ? 'backup' : 'json', fileName: name, json, conflict: 'skip' };
  dietImport.order = jsonDateOrder();
  renderDietImport();
}

function autoMapDiet(header, rows) {
  const used = new Set();
  const mapping = header.map(h => {
    const n = normHeader(h);
    const key = Object.keys(DIET_COLUMNS).find(k => !used.has(k) && DIET_COLUMNS[k].includes(n));
    if (key) used.add(key);
    return key || '';
  });
  if (!used.has('year')) header.forEach((h, i) => {
    if (mapping[i] || used.has('year')) return;
    const vals = rows.map(r => r[i]).filter(v => String(v).trim() !== '');
    if (vals.length && vals.every(v => { const n = Number(v); return Number.isInteger(n) && n >= 1990 && n <= 2100; })) { mapping[i] = 'year'; used.add('year'); }
  });
  return mapping;
}

function dietCol(key) { return dietImport.mapping.indexOf(key); }

function sheetDateOrder() {
  const di = dietCol('date'), yi = dietCol('year');
  return di < 0 ? 'DM' : guessDateOrder(dietImport.rows.map(r => dateParts(r[di], yi >= 0 ? r[yi] : '')));
}

// Lê um campo de objeto JSON aceitando nomes em português/inglês (via DIET_COLUMNS)
function jget(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const k = Object.keys(obj).find(x => DIET_COLUMNS[key] ? DIET_COLUMNS[key].includes(normHeader(x)) || x === key : x === key);
  return k !== undefined ? obj[k] : undefined;
}

function jsonDays(json) {
  if (Array.isArray(json)) return json;
  return json.days || json.dias || json.historico || [];
}

function jsonDateOrder() {
  if (dietImport.kind === 'backup') return 'DM';
  const days = jsonDays(dietImport.json);
  const dates = Array.isArray(days) ? days.map(d => jget(d, 'date')) : [];
  return guessDateOrder(dates.map(d => dateParts(d, '')));
}

/* ── Normaliza tudo em "linhas": {date, time, meal, food, qtyText, nut, water} ── */
function dietRows() {
  const st = dietImport;
  const out = [];
  let invalid = 0;
  const pickNut = get => {
    const nut = {};
    let any = false;
    NUTRIENTS.forEach(n => { const v = importNum(get(n.k) ?? ''); if (v !== null) { nut[n.k] = v; any = true; } });
    return any ? nut : null;
  };
  if (st.kind === 'sheet') {
    const col = k => dietCol(k);
    const di = col('date'), yi = col('year');
    st.rows.forEach((r, idx) => {
      const date = di >= 0 ? resolveDate(dateParts(r[di], yi >= 0 ? r[yi] : ''), st.order) : null;
      if (!date) { invalid++; return; }
      const get = k => col(k) >= 0 ? r[col(k)] : undefined;
      const food = String(get('food') ?? '').trim();
      const water = importNum(get('water') ?? '');
      if (!food && !water) { invalid++; return; }
      out.push({ date, idx, time: String(get('time') ?? ''), meal: normMealName(get('meal')), food,
                 qtyText: String(get('qty') ?? '').trim(), nut: food ? pickNut(get) : null, water: water || 0 });
    });
  } else {
    const days = jsonDays(st.json);
    if (!Array.isArray(days)) return { rows: [], invalid: 1 };
    days.forEach((day, di) => {
      const date = resolveDate(dateParts(jget(day, 'date'), ''), st.order);
      if (!date) { invalid++; return; }
      const water = importNum(jget(day, 'water') ?? '') || 0;
      if (water) out.push({ date, idx: di * 1000, meal: '', food: '', water });
      const meals = day.meals || day.refeicoes || [];
      // Também aceita itens soltos no dia: {date, items:[...]} ou {date, food:...}
      const list = meals.length ? meals : [{ name: jget(day, 'meal'), items: day.items || day.itens || (jget(day, 'food') ? [day] : []) }];
      list.forEach((meal, mi) => (meal.items || meal.itens || meal.alimentos || []).forEach((it, ii) => {
        const food = String(jget(it, 'food') ?? '').trim();
        if (!food) { invalid++; return; }
        const qty = jget(it, 'qty');
        out.push({ date, idx: di * 1000 + mi * 50 + ii, meal: normMealName(meal.name ?? jget(meal, 'meal')), food,
                   qtyText: qty !== undefined ? String(qty).trim() : '', portionText: it.portion || it.porcao || '',
                   nut: pickNut(k => jget(it, k)), water: 0 });
      }));
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')) || a.idx - b.idx);
  return { rows: out, invalid };
}

/* ── Casa cada linha com um alimento do Cardápio (ou cria um novo) ── */
function resolveDietItem(row, registry, newFoods, stats) {
  const key = normName(row.food);
  const cands = registry.filter(f => normName(f.name) === key);
  const amt = parseAmount(row.qtyText);
  const use = (f, qty) => { if (!newFoods.includes(f)) stats.matched++; return { food: f, qty }; };
  for (const f of cands) {  // mesma unidade (g, ml, un): quantidade proporcional
    const fa = parseAmount(f.portion);
    if (amt && amt.unit && fa && fa.unit === amt.unit && fa.n > 0) return use(f, round2(amt.n / fa.n));
  }
  if (cands.length) {
    const f = cands[0];
    if (amt && !amt.unit) return use(f, amt.n);                                         // "2" = 2 porções
    if (row.nut && row.nut.kcal && f.kcal) return use(f, round2(row.nut.kcal / f.kcal));
    if (!row.nut) return use(f, 1);
  }
  // Novo alimento: a linha vira 1 porção (ou N porções se a quantidade for número puro)
  const pure = amt && !amt.unit ? amt.n : null;
  const div = pure || 1;
  const food = { id: uid(), name: row.food, portion: pure ? (row.portionText || '1 porção') : (row.qtyText || row.portionText || '1 porção') };
  NUTRIENTS.forEach(n => { food[n.k] = row.nut && row.nut[n.k] !== undefined ? round2(row.nut[n.k] / div) : 0; });
  registry.push(food); newFoods.push(food);
  if (!food.kcal) stats.noKcal++;
  return { food, qty: pure || 1 };
}

// Monta o plano: {days:{data:{water, meals}}, newFoods, stats}
function computeDietPlan() {
  const st = dietImport;
  if (st.kind === 'backup') return computeBackupPlan();
  const { rows, invalid } = dietRows();
  const registry = cache.foods.map(f => f);
  const newFoods = [];
  const stats = { matched: 0, noKcal: 0, items: 0, invalid };
  const days = {};
  rows.forEach(row => {
    const day = days[row.date] = days[row.date] || { water: 0, meals: [] };
    if (row.water) day.water += row.water;
    if (!row.food) return;
    let meal = day.meals.find(m => m.name === row.meal);
    if (!meal) { meal = { id: uid(), name: row.meal, items: [] }; day.meals.push(meal); }
    const { food, qty } = resolveDietItem(row, registry, newFoods, stats);
    meal.items.push({ foodId: food.id, qty });
    stats.items++;
  });
  return finishPlan(days, newFoods, stats, registry);
}

function computeBackupPlan() {
  const b = dietImport.json;
  const registry = cache.foods.map(f => f);
  const newFoods = [], idMap = {};
  const stats = { matched: 0, noKcal: 0, items: 0, invalid: 0, templates: 0 };
  (b.foods || []).forEach(f => {
    const same = registry.find(x => normName(x.name) === normName(f.name) && normName(x.portion) === normName(f.portion)
      && Math.abs((Number(x.kcal) || 0) - (Number(f.kcal) || 0)) < 1);
    if (same) { idMap[f.id] = same.id; stats.matched++; return; }
    const nf = { ...f, id: uid() };
    idMap[f.id] = nf.id; registry.push(nf); newFoods.push(nf);
  });
  const days = {};
  Object.entries(b.nutrition || {}).forEach(([date, d]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { stats.invalid++; return; }
    days[date] = { water: Number(d.water) || 0, meals: (d.meals || []).map(m => ({
      id: uid(), name: m.name, items: (m.items || []).filter(it => idMap[it.foodId]).map(it => { stats.items++; return { foodId: idMap[it.foodId], qty: it.qty }; })
    })) };
  });
  const templates = (b.templates || []).filter(t => !cache.templates.some(x => normName(x.name) === normName(t.name)))
    .map(t => ({ id: uid(), name: t.name, items: (t.items || []).filter(it => idMap[it.foodId]).map(it => ({ foodId: idMap[it.foodId], qty: it.qty })) }));
  stats.templates = templates.length;
  const plan = finishPlan(days, newFoods, stats, registry);
  plan.templates = templates;
  plan.goals = b.settings && b.settings.goals;
  plan.waterGoal = b.settings && b.settings.waterGoal;
  return plan;
}

function finishPlan(days, newFoods, stats, registry) {
  const dates = Object.keys(days).sort();
  const byId = new Map(registry.map(f => [f.id, f]));
  let kcal = 0, meals = 0;
  dates.forEach(d => days[d].meals.forEach(m => {
    meals++;
    m.items.forEach(it => { const f = byId.get(it.foodId); kcal += f ? (Number(f.kcal) || 0) * it.qty : 0; });
  }));
  const conflicts = dates.filter(d => (cache.nutrition[d] && (cache.nutrition[d].meals || []).some(m => (m.items || []).length))).length;
  return { days, dates, newFoods, stats, meals, kcal, conflicts, byId };
}

/* ── Prévia ── */
function renderDietImport() {
  const st = dietImport;
  const plan = computeDietPlan();
  const kindName = { sheet: 'Planilha', json: 'JSON', backup: 'Backup do GymTrack' }[st.kind];
  const warnings = [];
  if (st.kind === 'sheet' && dietCol('date') < 0) warnings.push('⚠️ Escolha qual coluna é a <b>Data</b>.');
  if (st.kind === 'sheet' && dietCol('food') < 0) warnings.push('⚠️ Escolha qual coluna é o <b>Alimento</b>.');
  if (plan.stats.invalid) warnings.push(`ℹ️ ${plural(plan.stats.invalid, 'linha sem data ou alimento válido será ignorada', 'linhas sem data ou alimento válido serão ignoradas')}.`);
  if (plan.stats.noKcal) warnings.push(`⚠️ ${plural(plan.stats.noKcal, 'alimento novo ficará sem calorias', 'alimentos novos ficarão sem calorias')} — dá para completar depois no 🥗 Cardápio.`);

  const ambiguous = st.kind !== 'backup' && (st.kind === 'sheet'
    ? dietCol('date') >= 0 && st.rows.some(r => { const p = dateParts(r[dietCol('date')], ''); return p && p.a !== undefined; })
    : jsonDays(st.json).some(d => { const p = dateParts(jget(d, 'date'), ''); return p && p.a !== undefined; }));

  const firstDate = plan.dates[0];
  const sample = firstDate ? plan.days[firstDate].meals.slice(0, 3).map(m =>
    `<p class="import-sample"><b>${esc(m.name)}:</b> ${m.items.slice(0, 4).map(it => {
      const f = plan.byId.get(it.foodId); return f ? `${esc(f.name)}${it.qty !== 1 ? ` ×${fmtNum(it.qty)}` : ''}` : '?';
    }).join(', ')}${m.items.length > 4 ? '…' : ''}</p>`).join('') : '';

  const opts = sel => [['', '— ignorar —'], ['date', '📅 Data'], ['year', '📅 Ano'], ['time', '🕒 Horário'], ['meal', '🍽️ Refeição'],
    ['food', '🥗 Alimento'], ['qty', '⚖️ Quantidade'], ...NUTRIENTS.map(n => [n.k, `${n.chip[0].toUpperCase() + n.chip.slice(1)} (${n.unit.trim() || 'kcal'})`]), ['water', '💧 Água (ml)']]
    .map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');

  document.getElementById('diet-import-body').innerHTML = `
    <p class="bal-sub">📄 <b>${esc(st.fileName)}</b> · ${kindName}</p>
    ${plan.dates.length ? `
      <div class="bal-note">
        <b>${plural(plan.dates.length, 'dia', 'dias')}</b> (${fmtDateFull(plan.dates[0])} a ${fmtDateFull(plan.dates[plan.dates.length - 1])}) ·
        ${plural(plan.meals, 'refeição', 'refeições')} · ${plural(plan.stats.items, 'item', 'itens')} · ${fmtKcal(plan.kcal)} kcal no total.<br>
        🥗 ${plan.stats.matched} reconhecido${plan.stats.matched === 1 ? '' : 's'} do seu Cardápio · ${plural(plan.newFoods.length, 'alimento novo', 'alimentos novos')}
        ${plan.templates ? ` · ${plural(plan.templates.length, 'refeição pronta', 'refeições prontas')}` : ''}
      </div>
      <p class="bio-group">👀 Prévia de ${fmtDateFull(firstDate)}</p>${sample}` : '<div class="bal-note">Nenhum dia válido encontrado ainda.</div>'}
    ${warnings.map(w => `<p class="import-warn">${w}</p>`).join('')}

    ${ambiguous ? `
      <p class="bio-group">📅 Formato da data</p>
      <div class="period-tabs full">
        <button class="period-btn ${st.order === 'DM' ? 'active' : ''}" onclick="dietImport.order='DM';renderDietImport()">dia/mês</button>
        <button class="period-btn ${st.order === 'MD' ? 'active' : ''}" onclick="dietImport.order='MD';renderDietImport()">mês/dia</button>
      </div>` : ''}

    ${plan.conflicts ? `
      <p class="bio-group">🔁 ${plural(plan.conflicts, 'dia já tem', 'dias já têm')} refeições no app</p>
      <select class="bio-select" onchange="dietImport.conflict=this.value;renderDietImport()">
        <option value="skip" ${st.conflict === 'skip' ? 'selected' : ''}>Pular esses dias (recomendado)</option>
        <option value="append" ${st.conflict === 'append' ? 'selected' : ''}>Juntar com o que já existe</option>
        <option value="replace" ${st.conflict === 'replace' ? 'selected' : ''}>Substituir pelo importado</option>
      </select>
      <p class="food-hint">${{ skip: 'Os dias que você já registrou ficam como estão; só entram dias novos.',
        append: 'As refeições importadas são somadas às do dia (cuidado para não duplicar se importar o mesmo arquivo duas vezes).',
        replace: 'As refeições desses dias no app são trocadas pelas importadas.' }[st.conflict]}</p>` : ''}

    ${st.kind === 'sheet' ? `
      <p class="bio-group">🧩 Colunas da planilha</p>
      <div class="bio-fields">${st.header.map((h, i) => `
        <div class="import-col">
          <div class="import-col-name"><b>${esc(h) || '<i>(sem título)</i>'}</b><small>ex.: ${esc(String((st.rows[0] || [])[i] ?? ''))}</small></div>
          <select onchange="dietImport.mapping[${i}]=this.value;dietImport.order=sheetDateOrder();renderDietImport()">${opts(st.mapping[i])}</select>
        </div>`).join('')}
      </div>` : ''}

    <button class="btn-primary btn-block import-confirm" ${plan.dates.length ? '' : 'disabled'} onclick="confirmDietImport()">
      Importar ${plural(plan.dates.length, 'dia', 'dias')}</button>
    <button class="btn-add-serie" onclick="openDietImport()">← Voltar</button>`;
  document.getElementById('modal-diet-import').classList.add('show');
}

function confirmDietImport() {
  const plan = computeDietPlan();
  dietUndo = { nutrition: clone(cache.nutrition), foods: clone(cache.foods), templates: clone(cache.templates), settings: clone(cache.settings || {}) };
  const conflict = dietImport.conflict;
  const usedFoods = new Set();
  let count = 0;
  plan.dates.forEach(date => {
    const imp = plan.days[date];
    const cur = cache.nutrition[date];
    const hasMeals = cur && (cur.meals || []).some(m => (m.items || []).length);
    if (hasMeals && conflict === 'skip') return;
    if (!cur || !hasMeals || conflict === 'replace') {
      cache.nutrition[date] = { water: imp.water || (cur && Number(cur.water)) || 0, meals: imp.meals };
    } else {
      imp.meals.forEach(m => {
        const same = (cur.meals || []).find(x => x.name === m.name);
        if (same) same.items = (same.items || []).concat(m.items); else (cur.meals = cur.meals || []).push(m);
      });
      if (imp.water && !Number(cur.water)) cur.water = imp.water;
    }
    imp.meals.forEach(m => m.items.forEach(it => usedFoods.add(it.foodId)));
    count++;
  });
  cache.foods.push(...plan.newFoods.filter(f => usedFoods.has(f.id) || dietImport.kind === 'backup'));
  if (plan.templates && plan.templates.length) { cache.templates.push(...plan.templates); saveToCloud('templates'); }
  if (!cache.settings) cache.settings = {};
  if (plan.goals && !(cache.settings.goals && cache.settings.goals.kcal)) cache.settings.goals = plan.goals;
  if (plan.waterGoal && !cache.settings.waterGoal) cache.settings.waterGoal = plan.waterGoal;
  saveToCloud('settings');
  saveToCloud('foods');
  saveNutrition();
  dietUndo.count = count;
  closeModal('modal-diet-import');
  dietImport = null;
  if (plan.dates.length) currentDate = plan.dates[plan.dates.length - 1];
  renderAll();
  renderDietUndoNote();
}

function renderDietUndoNote() {
  const el = document.getElementById('diet-import-note');
  if (!el) return;
  el.innerHTML = dietUndo ? `
    <div class="bal-note import-done">✅ ${plural(dietUndo.count, 'dia importado', 'dias importados')}.
      <button class="btn-mini" onclick="undoDietImport()">↩ Desfazer</button></div>` : '';
}

function undoDietImport() {
  if (!dietUndo || !confirm(`Desfazer a importação de ${plural(dietUndo.count, 'dia', 'dias')}?`)) return;
  cache.nutrition = dietUndo.nutrition;
  cache.foods = dietUndo.foods;
  cache.templates = dietUndo.templates;
  cache.settings = dietUndo.settings;
  ['nutrition', 'foods', 'templates', 'settings'].forEach(saveToCloud);
  dietUndo = null;
  renderAll();
  renderDietUndoNote();
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
