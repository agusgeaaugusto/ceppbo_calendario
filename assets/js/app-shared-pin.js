// assets/js/app-shared-pin.js — ReadOnly + PIN Edit Mode
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

// ====== CONFIGURABLE ======
const EDIT_PIN = '123'; // Cambia aquí tu PIN
// ==========================

// DOM
const grid = document.getElementById('grid');
const mesActualEl = document.getElementById('mesActual');
const btnPrev = document.getElementById('prevMes');
const btnNext = document.getElementById('nextMes');
const btnHoy  = document.getElementById('btnHoy');
const btnBorrarTodo = document.getElementById('btnBorrarTodo');
const btnToggleEdit = document.getElementById('toggleEdit');
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
const dot = document.getElementById('dot'); const statustext = document.getElementById('statustext');

// State
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  events: {},
  editing: null,
  canEdit: false
};

// Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const docRef = doc(db, 'calendars', 'ceppbo');

onAuthStateChanged(auth, (u) => {
  if (u) { dot.classList.replace('offline','online'); statustext.textContent = 'Conectado'; }
  else { dot.classList.replace('online','offline'); statustext.textContent = 'Desconectado'; }
});
signInAnonymously(auth).catch(()=>{});

// Load + realtime
(async function init(){
  const snap = await getDoc(docRef);
  if (!snap.exists()) await setDoc(docRef, { events: {} });
  else state.events = snap.data().events || {};

  renderCalendar();
  onSnapshot(docRef, (s) => {
    const data = s.data();
    if (!data) return;
    state.events = data.events || {};
    renderCalendar();
  });
  updateEditUI();
})();

// UI helpers
function updateEditUI(){
  btnBorrarTodo.disabled = !state.canEdit;
  btnToggleEdit.classList.toggle('unlocked', state.canEdit);
  btnToggleEdit.textContent = state.canEdit ? '🔓 Editando' : '🔒 Editar';
}

// Edit mode toggle
btnToggleEdit.addEventListener('click', ()=>{
  if (state.canEdit){
    state.canEdit = false; state.editing = null; modal.close();
  } else {
    const pin = prompt('PIN de edición:');
    if (pin === EDIT_PIN){ state.canEdit = true; } else { alert('PIN incorrecto'); }
  }
  updateEditUI();
});

// Calendar render
function fmtDate(d){ return d.toISOString().slice(0,10); }
function formatearFechaBonita(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const f = new Date(y, m-1, d);
  const opts = { weekday:'short', year:'numeric', month:'short', day:'numeric' };
  return f.toLocaleDateString('es-ES', opts);
}

function renderCalendar(){
  const d = new Date(state.year, state.month, 1);
  const year = d.getFullYear(); const month = d.getMonth();
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  mesActualEl.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  grid.innerHTML = '';
  for (let i=0; i<42; i++){
    const cell = document.createElement('div'); cell.className = 'cell';
    const num = document.createElement('div'); num.className = 'num';
    let dayNum, dateObj;
    if (i < startOffset){ dayNum = prevLastDate - startOffset + i + 1; dateObj = new Date(year, month-1, dayNum); cell.classList.add('prev-next'); }
    else if (i >= startOffset + lastDate){ dayNum = i - (startOffset + lastDate) + 1; dateObj = new Date(year, month+1, dayNum); cell.classList.add('prev-next'); }
    else { dayNum = i - startOffset + 1; dateObj = new Date(year, month, dayNum); }
    num.textContent = dayNum; cell.appendChild(num);

    const key = fmtDate(dateObj);
    const todayKey = fmtDate(new Date());
    if (key === todayKey) cell.classList.add('hoy');

    const badges = document.createElement('div'); badges.className = 'badges';
    (state.events[key] || []).forEach(ev => {
      const b = document.createElement('span'); b.className = 'badge ' + (ev.tipo || 'otro'); if (ev.color) b.style.background = ev.color;
      badges.appendChild(b);
    });
    cell.appendChild(badges);

    cell.addEventListener('click', ()=>{
      if (!state.canEdit){ alert('Modo lectura. Pulsa 🔒 Editar e ingresa el PIN.'); return; }
      openModalForDate(key);
    });
    grid.appendChild(cell);
  }
  renderCards();
}

// Cards
function renderCards(){
  cards.innerHTML = '';
  const all = [];
  for (const [date, list] of Object.entries(state.events)) list.forEach((ev, idx) => all.push({date, idx, ...ev}));
  all.sort((a,b)=> a.date.localeCompare(b.date));
  if (!all.length){ const p=document.createElement('p'); p.className='muted'; p.textContent='Sin fechas conmemorativas todavía.'; cards.appendChild(p); return; }

  for (const item of all){
    const card = document.createElement('div'); card.className='card'; card.dataset.tipo=item.tipo;
    const img = document.createElement('img'); img.className='thumb'; img.alt='Foto'; img.src=item.imgData || 'assets/img/logo.png';
    const content = document.createElement('div');
    const h4 = document.createElement('h4'); h4.textContent=item.titulo;
    const p = document.createElement('p'); p.textContent=item.descripcion || '—';
    const meta = document.createElement('div'); meta.className='meta';
    const date = document.createElement('span'); date.className='date'; date.textContent=formatearFechaBonita(item.date);
    const tools = document.createElement('div'); tools.className='tools';

    const edit = document.createElement('button'); edit.className='iconbtn'; edit.textContent='Editar';
    edit.addEventListener('click', ()=>{
      if (!state.canEdit){ alert('Modo lectura. Pulsa 🔒 Editar e ingresa el PIN.'); return; }
      editar(item.date,item.idx);
    });
    const del = document.createElement('button'); del.className='iconbtn'; del.textContent='Eliminar';
    del.addEventListener('click', ()=>{
      if (!state.canEdit){ alert('Modo lectura. Pulsa 🔒 Editar e ingresa el PIN.'); return; }
      eliminar(item.date,item.idx);
    });

    // Ocultar botones en modo lectura
    if (!state.canEdit){ edit.style.display='none'; del.style.display='none'; }

    tools.append(edit, del); meta.append(date, tools);
    content.append(h4, p, meta);
    if (item.color) card.style.borderLeftColor = item.color;
    card.append(img, content); cards.appendChild(card);
  }
}

// Modal & form
function openModalForDate(dateStr){
  state.editing = null; fechaInput.value = dateStr; tipoInput.value='conmemorativa';
  tituloInput.value=''; descInput.value=''; fotoInput.value=''; colorInput.value='';
  modal.showModal();
}
closeModal.addEventListener('click', ()=> modal.close());

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!state.canEdit){ alert('Modo lectura. Pulsa 🔒 Editar e ingresa el PIN.'); return; }
  const dateStr = fechaInput.value;
  const data = {
    tipo: tipoInput.value,
    titulo: (tituloInput.value||'').trim(),
    descripcion: (descInput.value||'').trim(),
    color: colorInput.value || null,
    imgData: null
  };
  if (!dateStr || !data.titulo) return;
  if (fotoInput.files && fotoInput.files[0]) data.imgData = await fileToDataURL(fotoInput.files[0]);

  if (state.editing){ await updateEvent(state.editing.date, state.editing.idx, data); }
  else { await pushEvent(dateStr, data); }
  state.editing = null; modal.close();
});

function editar(date, idx){
  state.editing = {date, idx};
  const ev = state.events[date][idx];
  fechaInput.value = date; tipoInput.value = ev.tipo; tituloInput.value = ev.titulo;
  descInput.value = ev.descripcion || ''; colorInput.value = ev.color || ''; fotoInput.value='';
  modal.showModal();
}

async function eliminar(date, idx){
  if (!confirm('¿Eliminar esta indicación?')) return;
  await removeEvent(date, idx);
}

// Firestore ops
async function pushEvent(dateStr, ev){
  const snap = await getDoc(docRef); const data = snap.data() || {events:{}};
  const events = data.events || {}; if (!events[dateStr]) events[dateStr]=[]; events[dateStr].push(ev);
  await setDoc(docRef, { events }, { merge:true });
}
async function updateEvent(dateStr, idx, ev){
  const snap = await getDoc(docRef); const data = snap.data() || {events:{}};
  const events = data.events || {}; if (!events[dateStr]) return; events[dateStr][idx]=ev;
  await setDoc(docRef, { events }, { merge:true });
}
async function removeEvent(dateStr, idx){
  const snap = await getDoc(docRef); const data = snap.data() || {events:{}};
  const events = data.events || {}; if (!events[dateStr]) return; events[dateStr].splice(idx,1); if (events[dateStr].length===0) delete events[dateStr];
  await setDoc(docRef, { events }, { merge:true });
}

// Nav
btnPrev.addEventListener('click', ()=> navMonth(-1));
btnNext.addEventListener('click', ()=> navMonth(+1));
btnHoy.addEventListener('click', ()=>{ const now=new Date(); state.year=now.getFullYear(); state.month=now.getMonth(); renderCalendar(); });
btnBorrarTodo.addEventListener('click', async ()=>{
  if (!state.canEdit){ alert('Modo lectura. Pulsa 🔒 Editar e ingresa el PIN.'); return; }
  if (!confirm('¿Seguro que quieres borrar todas las fechas?')) return;
  await setDoc(docRef, { events:{} }, { merge:true });
});

function navMonth(delta){ let m=state.month+delta,y=state.year; if(m<0){m=11;y--} if(m>11){m=0;y++} state.month=m; state.year=y; renderCalendar(); }
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
