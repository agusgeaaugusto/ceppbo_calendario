// CEPPBO Calendario — sin dependencias, listo para GitHub Pages
const grid = document.getElementById('grid');
const mesActualEl = document.getElementById('mesActual');
const btnPrev = document.getElementById('prevMes');
const btnNext = document.getElementById('nextMes');
const btnHoy  = document.getElementById('btnHoy');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const importFile = document.getElementById('importFile');
const btnBorrarTodo = document.getElementById('btnBorrarTodo');

const modal = document.getElementById('modal');
const form = document.getElementById('formEvento');
const closeModal = document.getElementById('closeModal');
const fechaInput = document.getElementById('fecha');
const tipoInput = document.getElementById('tipo');
const tituloInput = document.getElementById('titulo');
const descInput = document.getElementById('descripcion');
const fotoInput = document.getElementById('foto');
const colorInput = document.getElementById('color');
const cards = document.getElementById('cards');

document.getElementById('year').textContent = new Date().getFullYear();

const STORAGE_KEY = 'ceppbo_calendario_v1';
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  events: {} // { "YYYY-MM-DD": [ {tipo, titulo, descripcion, imgData, color} ] }
};

// Load state
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && saved.events) {
    state.events = saved.events;
  }
} catch (e) {}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({events: state.events}));
}

function fmtDate(d) {
  return d.toISOString().slice(0,10);
}

function pad(n){ return n.toString().padStart(2,'0'); }

function renderCalendar() {
  const d = new Date(state.year, state.month, 1);
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  mesActualEl.textContent = `${monthNames[month]} ${year}`;

  // Calc grid
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday=0
  const lastDate = new Date(year, month + 1, 0).getDate();

  // Previous month trailing
  const prevLastDate = new Date(year, month, 0).getDate();

  grid.innerHTML = '';
  const totalCells = 42; // 6 weeks grid
  for (let i=0; i<totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const num = document.createElement('div');
    num.className = 'num';

    let dayNum, dateObj, inThisMonth = true;
    if (i < startOffset) {
      // prev month
      dayNum = prevLastDate - startOffset + i + 1;
      dateObj = new Date(year, month - 1, dayNum);
      inThisMonth = false;
      cell.classList.add('prev-next');
    } else if (i >= startOffset + lastDate) {
      // next month
      dayNum = i - (startOffset + lastDate) + 1;
      dateObj = new Date(year, month + 1, dayNum);
      inThisMonth = false;
      cell.classList.add('prev-next');
    } else {
      dayNum = i - startOffset + 1;
      dateObj = new Date(year, month, dayNum);
    }

    num.textContent = dayNum;
    cell.appendChild(num);

    const key = fmtDate(dateObj);
    const badges = document.createElement('div');
    badges.className = 'badges';
    (state.events[key] || []).forEach(ev => {
      const b = document.createElement('span');
      b.className = 'badge ' + (ev.tipo || 'otro');
      if (ev.color) b.style.background = ev.color;
      badges.appendChild(b);
    });
    cell.appendChild(badges);

    const todayKey = fmtDate(new Date());
    if (key === todayKey) cell.classList.add('hoy');

    cell.addEventListener('click', () => openModalForDate(key));
    grid.appendChild(cell);
  }

  renderCards();
}

function openModalForDate(dateStr) {
  fechaInput.value = dateStr;
  tipoInput.value = 'conmemorativa';
  tituloInput.value = '';
  descInput.value = '';
  fotoInput.value = '';
  colorInput.value = '';
  modal.showModal();
}

closeModal.addEventListener('click', () => modal.close());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateStr = fechaInput.value;
  const tipo = tipoInput.value;
  const titulo = tituloInput.value.trim();
  const descripcion = descInput.value.trim();
  const color = colorInput.value || null;

  if (!dateStr || !titulo) return;

  let imgData = null;
  if (fotoInput.files && fotoInput.files[0]) {
    imgData = await fileToDataURL(fotoInput.files[0]);
  }

  const ev = {tipo, titulo, descripcion, imgData, color};
  if (!state.events[dateStr]) state.events[dateStr] = [];
  state.events[dateStr].push(ev);
  saveState();
  modal.close();
  renderCalendar();
});

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function renderCards() {
  cards.innerHTML = '';
  const all = [];
  for (const [date, list] of Object.entries(state.events)) {
    list.forEach((ev, idx) => all.push({date, idx, ...ev}));
  }
  // sort by date ascending
  all.sort((a,b) => a.date.localeCompare(b.date));

  if (all.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Sin fechas conmemorativas todavía.';
    cards.appendChild(empty);
    return;
  }

  for (const item of all) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.tipo = item.tipo;

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = 'Foto del evento';
    img.src = item.imgData || 'assets/img/logo.png';

    const content = document.createElement('div');
    const h4 = document.createElement('h4');
    h4.textContent = item.titulo;
    const p = document.createElement('p');
    p.textContent = item.descripcion || '—';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = formatearFechaBonita(item.date);
    const tools = document.createElement('div');
    tools.className = 'tools';

    const edit = document.createElement('button');
    edit.className = 'iconbtn';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => editar(item.date, item.idx));

    const del = document.createElement('button');
    del.className = 'iconbtn';
    del.textContent = 'Eliminar';
    del.addEventListener('click', () => eliminar(item.date, item.idx));

    tools.append(edit, del);
    meta.append(date, tools);
    content.append(h4, p, meta);

    card.append(img, content);
    if (item.color) card.style.borderLeftColor = item.color;
    cards.appendChild(card);
  }
}

function formatearFechaBonita(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  const f = new Date(y, m-1, d);
  const opts = { weekday: 'long', year:'numeric', month:'long', day:'numeric' };
  return f.toLocaleDateString('es-ES', opts);
}

function editar(date, idx) {
  const ev = state.events[date][idx];
  fechaInput.value = date;
  tipoInput.value = ev.tipo;
  tituloInput.value = ev.titulo;
  descInput.value = ev.descripcion || '';
  colorInput.value = ev.color || '';
  fotoInput.value = '';
  modal.showModal();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const tipo = tipoInput.value;
    const titulo = tituloInput.value.trim();
    const descripcion = descInput.value.trim();
    const color = colorInput.value || null;
    let imgData = ev.imgData;
    if (fotoInput.files && fotoInput.files[0]) {
      imgData = await fileToDataURL(fotoInput.files[0]);
    }
    state.events[date][idx] = {tipo, titulo, descripcion, imgData, color};
    saveState();
    modal.close();
    form.onsubmit = defaultSubmit;
    renderCalendar();
  }
}

function eliminar(date, idx) {
  if (!confirm('¿Eliminar esta indicación?')) return;
  state.events[date].splice(idx, 1);
  if (state.events[date].length === 0) delete state.events[date];
  saveState();
  renderCalendar();
}

// Navigation
btnPrev.addEventListener('click', () => { navMonth(-1); });
btnNext.addEventListener('click', () => { navMonth(+1); });
btnHoy.addEventListener('click', () => {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth();
  renderCalendar();
});

function navMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11){ m = 0;  y++; }
  state.month = m; state.year = y;
  renderCalendar();
}

// Export/Import/Borrar
btnExport.addEventListener('click', () => {
  const data = JSON.stringify({events: state.events}, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calendario_ceppbo.json';
  a.click();
  URL.revokeObjectURL(url);
});
btnImport.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.events && typeof data.events === 'object') {
      state.events = data.events;
      saveState();
      renderCalendar();
      alert('Datos importados correctamente.');
    } else {
      alert('Archivo inválido.');
    }
  } catch (e) {
    alert('No se pudo leer el archivo.');
  } finally {
    importFile.value = '';
  }
});
btnBorrarTodo.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todas las fechas?')) return;
  state.events = {};
  saveState();
  renderCalendar();
});

// Restore default submit (used in edit override)
function defaultSubmit(e) {
  e.preventDefault();
  const fake = new Event('submit');
  form.dispatchEvent(fake);
}
form.onsubmit = defaultSubmit;

// Init
renderCalendar();
