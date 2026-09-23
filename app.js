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
  foods:     [],  // [{id, name, portion, kcal, prot, carb, gord, fib}] — valores por porção
  nutrition: {},  // {'YYYY-MM-DD': {water: ml, meals: [{id, name, items:[{foodId, qty}]}]}}
  settings:  {}   // {waterGoal: ml}
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
    renderAll();
  } else {
    currentUid = null;
    cache = { exercises: [], sessions: [], foods: [], nutrition: {}, settings: {} };
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

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
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
let foodsOpen = false;
let pickerMealIdx = null;
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

// Macros de um item do prato = valores do alimento × quantidade de porções
function itemMacros(item) {
  const f = getFood(item.foodId) || {};
  const q = Number(item.qty) || 0;
  const v = k => (Number(f[k]) || 0) * q;
  return { kcal: v('kcal'), prot: v('prot'), carb: v('carb'), gord: v('gord'), fib: v('fib') };
}

function sumMacros(list) {
  return list.reduce((t, m) => ({
    kcal: t.kcal + m.kcal, prot: t.prot + m.prot, carb: t.carb + m.carb,
    gord: t.gord + m.gord, fib: t.fib + m.fib
  }), { kcal: 0, prot: 0, carb: 0, gord: 0, fib: 0 });
}

function mealMacros(meal) { return sumMacros((meal.items || []).map(itemMacros)); }
function dayMacros(day)   { return sumMacros((day.meals || []).map(mealMacros)); }

function fmtG(n) { return fmtNum(Math.round(Number(n) * 10) / 10); }

function macroLine(m) {
  return `${fmtG(m.kcal)} kcal · P ${fmtG(m.prot)} · C ${fmtG(m.carb)} · G ${fmtG(m.gord)} · F ${fmtG(m.fib)}`;
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
    summary.innerHTML = `
      <div class="sum-chip"><b>${fmtG(t.kcal)}</b><small>kcal</small></div>
      <div class="sum-chip"><b>${fmtG(t.prot)}g</b><small>prot</small></div>
      <div class="sum-chip"><b>${fmtG(t.carb)}g</b><small>carbo</small></div>
      <div class="sum-chip"><b>${fmtG(t.gord)}g</b><small>gord</small></div>
      <div class="sum-chip"><b>${fmtG(t.fib)}g</b><small>fibra</small></div>`;
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
    wrap.innerHTML = meals.map((meal, mi) => {
      const items = meal.items || [];
      const itemsHtml = items.map((item, ii) => {
        const f = getFood(item.foodId);
        return `
          <div class="meal-item">
            <div class="meal-item-top">
              <input type="number" step="0.5" min="0" inputmode="decimal" value="${item.qty}"
                onchange="updQty(${mi},${ii},this.value)">
              <span class="unit">×</span>
              <span class="meal-item-name">${f ? esc(f.name) : '(excluído)'}${f && f.portion ? ` <small>${esc(f.portion)}</small>` : ''}</span>
              <button class="btn-tiny danger" title="Remover do prato" onclick="removeMealItem(${mi},${ii})">✕</button>
            </div>
            <div class="meal-item-macros">${macroLine(itemMacros(item))}</div>
          </div>`;
      }).join('');
      const totalHtml = items.length
        ? `<div class="meal-total">Total: <b>${fmtG(mealMacros(meal).kcal)} kcal</b> · ${macroLine(mealMacros(meal)).split(' · ').slice(1).join(' · ')}</div>`
        : '<p class="meal-empty">Prato vazio — adicione alimentos.</p>';
      return `
        <div class="entry-card">
          <div class="entry-head">
            <span class="entry-name">${esc(meal.name)}</span>
            <button class="btn-del" title="Remover refeição" onclick="removeMeal(${mi})">🗑</button>
          </div>
          ${itemsHtml}
          ${totalHtml}
          <button class="btn-add-serie" onclick="openFoodPicker(${mi})">＋ Alimento</button>
        </div>`;
    }).join('');
  }

  // Meus alimentos
  const foods = cache.foods;
  let foodsHtml = '';
  if (foodsOpen) {
    foodsHtml = foods.map(f => `
      <div class="food-row">
        <div class="food-row-info">
          <b>${esc(f.name)}</b> <small>${esc(f.portion || '')}</small>
          <div class="meal-item-macros">${macroLine(f)}</div>
        </div>
        <button class="btn-tiny" title="Editar" onclick="openFoodForm('${f.id}')">✏️</button>
        <button class="btn-tiny danger" title="Excluir" onclick="deleteFood('${f.id}')">🗑</button>
      </div>`).join('') || '<p class="meal-empty">Nenhum alimento cadastrado ainda.</p>';
    foodsHtml += `<button class="btn-add-serie" onclick="pickerMealIdx=null;openFoodForm(null)">＋ Novo alimento</button>`;
  }
  document.getElementById('foods-section').innerHTML = `
    <div class="foods-toggle" onclick="toggleFoods()">🥗 Meus alimentos (${foods.length}) ${foodsOpen ? '▲' : '▼'}</div>
    ${foodsHtml}`;
}

function toggleFoods() { foodsOpen = !foodsOpen; renderDieta(); }

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
  document.getElementById('modal-meal-list').innerHTML = MEAL_SUGGESTIONS.map(n =>
    `<button class="ex-pick" onclick="addMeal('${n}')">${n}</button>`).join('');
  document.getElementById('modal-meal-name').value = '';
  document.getElementById('modal-meal').classList.add('show');
}

function addMeal(name) {
  getOrCreateDay(currentDate).meals.push({ id: uid(), name, items: [] });
  saveNutrition(); closeModal('modal-meal'); renderDieta();
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
function openFoodPicker(mi) {
  pickerMealIdx = mi;
  const list = document.getElementById('modal-food-list');
  list.innerHTML = cache.foods.length
    ? cache.foods.map(f => `
        <button class="ex-pick" onclick="pickFood('${f.id}')">${esc(f.name)} <small>${fmtG(f.kcal || 0)}kcal</small></button>`).join('')
    : '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:8px">Nenhum alimento cadastrado — crie o primeiro abaixo.</p>';
  document.getElementById('modal-food-picker').classList.add('show');
}

function pickFood(foodId) {
  const meal = currentMeals()[pickerMealIdx];
  if (!meal) return;
  if (!meal.items) meal.items = [];
  meal.items.push({ foodId, qty: 1 });
  saveNutrition(); closeModal('modal-food-picker'); renderDieta();
}

function updQty(mi, ii, value) {
  currentMeals()[mi].items[ii].qty = parseFloat(String(value).replace(',', '.')) || 0;
  saveNutrition(); renderDieta();
}

function removeMealItem(mi, ii) {
  currentMeals()[mi].items.splice(ii, 1);
  saveNutrition(); renderDieta();
}

/* ── Cadastro de alimentos ── */
function openFoodForm(foodId) {
  editingFoodId = foodId;
  const f = foodId ? getFood(foodId) : null;
  document.getElementById('food-form-title').textContent = f ? 'Editar alimento' : 'Novo alimento';
  document.getElementById('ff-name').value = f ? f.name : '';
  document.getElementById('ff-portion').value = f ? (f.portion || '') : '';
  ['kcal', 'prot', 'carb', 'gord', 'fib'].forEach(k => {
    document.getElementById('ff-' + k).value = f ? (f[k] || 0) : '';
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
    kcal: num('ff-kcal'), prot: num('ff-prot'), carb: num('ff-carb'),
    gord: num('ff-gord'), fib: num('ff-fib')
  };
  if (!data.name) return;
  if (editingFoodId) {
    Object.assign(getFood(editingFoodId), data);
  } else {
    const food = { id: uid(), ...data };
    cache.foods.push(food);
    // Se veio do picker de uma refeição, já adiciona ao prato
    if (pickerMealIdx !== null && currentMeals()[pickerMealIdx]) {
      const meal = currentMeals()[pickerMealIdx];
      if (!meal.items) meal.items = [];
      meal.items.push({ foodId: food.id, qty: 1 });
      saveNutrition();
    }
  }
  saveToCloud('foods');
  closeModal('modal-food-form');
  renderDieta();
}

function deleteFood(id) {
  const used = Object.values(cache.nutrition).some(d =>
    (d.meals || []).some(m => (m.items || []).some(it => it.foodId === id)));
  const msg = used
    ? 'Este alimento aparece em refeições registradas. Excluir mesmo assim? (os pratos antigos mostrarão "(excluído)")'
    : 'Excluir este alimento?';
  if (!confirm(msg)) return;
  cache.foods = cache.foods.filter(f => f.id !== id);
  saveToCloud('foods');
  renderDieta();
}

/* ══════════════════════════════════
   FECHAR MODAL AO CLICAR FORA
══════════════════════════════════ */
document.addEventListener('click', ev => {
  if (ev.target.classList && ev.target.classList.contains('modal')) {
    ev.target.classList.remove('show');
  }
});
