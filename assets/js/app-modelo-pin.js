// assets/js/app-modelo-pin.js — Firebase + PIN + anti-doble-agregado + filtros + color-thumb
import { firebaseConfig } from './firebase-config.js';

const EDIT_PIN = '123'; // cámbialo si quieres

// Utilidad opcional (no ampliamos imagen, comprimimos si quieres usarla)
async function resizeImageToDataURL(file, maxW = 800, maxH = 800, quality = 0.8) {
  const imgURL = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imgURL;
  });

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1); // no ampliar
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  URL.revokeObjectURL(imgURL);
  // JPEG más liviano; si necesitas transparencia usa "image/png" (más pesado)
  return canvas.toDataURL('image/jpeg', quality);
}

// ---------------- DOM ----------------
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
const dot = document.getElementById('dot');
const statustext = document.getElementById('statustext');

// ---- Filtros (si no existen en el HTML, los creo dinámicamente) ----
let filterTipo  = document.getElementById('filterTipo');
let filterDesde = document.getElementById('filterDesde');
let filterHasta = document.getElementById('filterHasta');
let filterClear = document.getElementById('filterClear');

(function ensureFiltersUI(){
  if (filterTipo && filterDesde && filterHasta && filterClear) return;
  // Busco dónde ponerlos: dentro de .aside-header si existe
  const asideHeader = document.querySelector('.aside-header') || document.querySelector('.sidebar') || document.body;
  const wrapper = document.createElement('div');
  wrapper.className = 'filters';
  wrapper.innerHTML = `
    <select id="filterTipo" aria-label="Filtrar por tipo">
      <option value="all">Todos los tipos</option>
      <option value="conmemorativa">Conmemorativa</option>
      <option value="acto">Acto/Evento</option>
      <option value="feriado">Feriado</option>
      <option value="otro">Otro</option>
    </select>
    <input type="date" id="filterDesde" aria-label="Desde fecha">
    <span>→</span>
    <input type="date" id="filterHasta" aria-label="Hasta fecha">
    <button class="btn ghost" id="filterClear" type="button">Limpiar</button>
  `;
  // Lo inserto al final del header/aside para no romper tu layout
  asideHeader.appendChild(wrapper);

  // Vuelvo a tomar referencias
  filterTipo  = document.getElementById('filterTipo');
  filterDesde = document.getElementById('filterDesde');
  filterHasta = document.getElementById('filterHasta');
  filterClear = document.getElementById('filterClear');
})();

// ---------------- STATE ----------------
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  events: {},
  editing: null,
  canEdit: false,
  isSaving: false, // anti multi-agregado
  filters: { tipo: 'all', desde: null, hasta: null }
};

// ---------------- CALENDARIO ----------------
function renderCalendar(){
  const d = new Date(state.year, state.month, 1);
  const y = d.getFullYear(); const m = d.getMonth();
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  mesActualEl.textContent = `${names[m]} ${y}`;
  const first = new Date(y,m,1); const off=(first.getDay()+6)%7;
  const last = new Date(y,m+1,0).getDate(); const prevLast=new Date(y,m,0).getDate();
  grid.innerHTML='';

  for (let i=0;i<42;i++){
    const cell=document.createElement('div'); cell.className='cell';
    const num=document.createElement('div'); num.className='num';
    let dn, dt;
    if (i<off){ dn=prevLast-off+i+1; dt=new Date(y,m-1,dn); cell.classList.add('prev-next'); }
    else if (i>=off+last){ dn=i-(off+last)+1; dt=new Date(y,m+1,dn); cell.classList.add('prev-next'); }
    else { dn=i-off+1; dt=new Date(y,m,dn); }
    num.textContent=dn; cell.appendChild(num);

    const key = dt.toISOString().slice(0,10);
    const today = new Date().toISOString().slice(0,10);
    if (key===today) cell.classList.add('hoy');

    const badges=document.createElement('div'); badges.className='badges';
    (state.events[key]||[]).forEach(ev=>{
      const b=document.createElement('span');
      b.className='badge '+(ev.tipo||'otro');
      if (ev.color) b.style.background=ev.color;
      badges.appendChild(b);
    });
    cell.appendChild(badges);

    cell.addEventListener('click', ()=>{
      if (!state.canEdit) return alert('Modo lectura. Pulsa 🔒 Editar.');
      openModalForDate(key);
    });

    grid.appendChild(cell);
  }

  renderCards();
}

// ---------------- RENDER CARDS + FILTROS ----------------
function normalizarFechaStr(v){
  // "YYYY-MM-DD" → Date al mediodía para evitar TZ raras
  const [Y,M,D] = v.split('-').map(Number);
  return new Date(Y, M-1, D, 12, 0, 0, 0);
}

function renderCards(){
  cards.innerHTML='';

  // Aplanar events a lista
  const all = [];
  for (const [date,list] of Object.entries(state.events)) {
    list.forEach((ev,idx)=>all.push({date,idx,...ev}));
  }
  // Orden por fecha asc
  all.sort((a,b)=>a.date.localeCompare(b.date));

  // Aplicar filtros
  const { tipo, desde, hasta } = state.filters;
  const enRango = (fechaStr)=>{
    const [Y,M,D] = fechaStr.split('-').map(Number);
    const dt = new Date(Y, M-1, D, 12, 0, 0, 0);
    if (desde && dt < desde) return false;
    if (hasta && dt > hasta) return false;
    return true;
  };

  const filtrados = all.filter(item=>{
    const pasaTipo = (tipo === 'all') || ((item.tipo||'otro') === tipo);
    const pasaRango = enRango(item.date);
    return pasaTipo && pasaRango;
  });

  const lista = filtrados;

  if (!lista.length){
    const p=document.createElement('p');
    p.className='muted';
    p.textContent='Sin resultados para el filtro aplicado.';
    cards.appendChild(p);
    return;
  }

  for (const item of lista){
    const card=document.createElement('div');
    card.className='card';
    card.dataset.tipo=item.tipo;

    // THUMB: si hay imagen, mostrarla. Si no, usar bloque pintado con el color elegido.
    let thumbEl;
    if (item.imgData){
      const img=document.createElement('img');
      img.className='thumb';
      img.alt='Foto';
      img.src = item.imgData;
      thumbEl = img;
    } else {
      const colorBox = document.createElement('div');
      colorBox.className = 'thumb color-thumb';
      colorBox.style.background = item.color || '#444'; // fallback si no hay color
      thumbEl = colorBox;
    }

    const content=document.createElement('div');
    const h4=document.createElement('h4'); h4.textContent=item.titulo;
    const p=document.createElement('p'); p.textContent=item.descripcion || '—';

    const meta=document.createElement('div'); meta.className='meta';
    const date=document.createElement('span'); date.className='date';
    date.textContent=new Date(item.date).toLocaleDateString('es-ES',{
      weekday:'short',day:'2-digit',month:'short',year:'numeric'
    });

    const tools=document.createElement('div'); tools.className='tools';
    const edit=document.createElement('button'); edit.className='iconbtn'; edit.textContent='Editar';
    edit.addEventListener('click',()=>{ if(!state.canEdit) return alert('Modo lectura'); editar(item.date,item.idx); });
    const del=document.createElement('button'); del.className='iconbtn'; del.textContent='Eliminar';
    del.addEventListener('click',()=>{ if(!state.canEdit) return alert('Modo lectura'); eliminar(item.date,item.idx); });
    if (!state.canEdit){ edit.style.display='none'; del.style.display='none'; }

    tools.append(edit,del);
    meta.append(date,tools);
    content.append(h4,p,meta);

    if (item.color) card.style.borderLeftColor=item.color;

    card.append(thumbEl,content);
    cards.appendChild(card);
  }
}

// ---------------- MODAL ----------------
function openModalForDate(dateStr){
  state.editing=null;
  fechaInput.value=dateStr;
  tipoInput.value='conmemorativa';
  tituloInput.value='';
  descInput.value='';
  fotoInput.value='';
  colorInput.value='';
  modal.showModal();
}
closeModal.addEventListener('click', ()=>modal.close());

// ---------------- FORM SUBMIT (anti doble) ----------------
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!state.canEdit) return alert('Modo lectura');
  if (state.isSaving) return; // evita doble clic

  const saveBtn = document.getElementById('saveEvento');
  saveBtn.disabled = true;
  state.isSaving = true;

  try{
    const dateStr=fechaInput.value;
    const data={
      tipo: (tipoInput.value || 'otro').toLowerCase(),
      titulo: tituloInput.value.trim(),
      descripcion: descInput.value.trim(),
      color: colorInput.value || null,
      imgData: null
    };
    if (!dateStr || !data.titulo){ return; }

    if (fotoInput.files && fotoInput.files[0]){
      // Puedes alternar entre fileToDataURL y resizeImageToDataURL si querés comprimir
      // data.imgData = await fileToDataURL(fotoInput.files[0]);
      data.imgData = await resizeImageToDataURL(fotoInput.files[0], 800, 800, 0.8);
    }

    // Dedupe: no permitir mismo título en la misma fecha al crear (no al editar)
    const currentList = state.events[dateStr] || [];
    if (!state.editing && currentList.some(ev => (ev.titulo||'').toLowerCase() === data.titulo.toLowerCase())){
      alert('Ya existe una actividad con ese título en esa fecha.');
      return;
    }

    if (state._ops){
      if (state.editing) await state._ops.updateEvent(state.editing.date, state.editing.idx, data);
      else await state._ops.pushEvent(dateStr, data);
    } else {
      alert('No conectado a Firestore (revisa firebase-config / Auth anónima / Firestore).');
    }
    state.editing=null; modal.close();
  } finally {
    state.isSaving = false;
    saveBtn.disabled = false;
  }
});

function editar(date,idx){
  state.editing={date,idx};
  const ev=state.events[date][idx];
  fechaInput.value=date;
  tipoInput.value=ev.tipo || 'conmemorativa';
  tituloInput.value=ev.titulo || '';
  descInput.value=ev.descripcion||'';
  colorInput.value=ev.color||'';
  fotoInput.value='';
  modal.showModal();
}
async function eliminar(date,idx){
  if(!confirm('¿Eliminar?')) return;
  if (state._ops) await state._ops.removeEvent(date,idx);
}

// ---------------- NAVEGACIÓN + PIN ----------------
btnPrev.addEventListener('click', ()=>nav(-1));
btnNext.addEventListener('click', ()=>nav(+1));
btnHoy.addEventListener('click', ()=>{
  const n=new Date();
  state.year=n.getFullYear();
  state.month=n.getMonth();
  renderCalendar();
});
btnToggleEdit.addEventListener('click', ()=>{
  if (state.canEdit){
    state.canEdit=false;
  } else {
    const pin=prompt('PIN de edición');
    if (pin===EDIT_PIN) state.canEdit=true;
    else alert('PIN incorrecto');
  }
  btnToggleEdit.classList.toggle('unlocked', state.canEdit);
  btnToggleEdit.textContent = state.canEdit ? '🔓 Editando' : '🔒 Editar';
  btnBorrarTodo.disabled = !state.canEdit;
});
btnBorrarTodo.addEventListener('click', async ()=>{
  if (!state.canEdit) return;
  if (!confirm('¿Borrar todo?')) return;
  if (state._ops) await state._ops.clearAll();
});

function nav(delta){
  let m=state.month+delta,y=state.year;
  if(m<0){m=11;y--}
  if(m>11){m=0;y++}
  state.month=m; state.year=y;
  renderCalendar();
}
function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

// ---------------- FILTROS: listeners ----------------
function attachFilterListeners(){
  if (!filterTipo || !filterDesde || !filterHasta || !filterClear) return;

  filterTipo.addEventListener('change', ()=>{
    state.filters.tipo = filterTipo.value;
    renderCards();
  });

  const setFecha = (el, key)=>{
    const v = el.value;
    state.filters[key] = v ? normalizarFechaStr(v) : null;
    renderCards();
  };
  filterDesde.addEventListener('change', ()=>setFecha(filterDesde,'desde'));
  filterHasta.addEventListener('change', ()=>setFecha(filterHasta,'hasta'));

  filterClear.addEventListener('click', ()=>{
    filterTipo.value  = 'all';
    filterDesde.value = '';
    filterHasta.value = '';
    state.filters = { tipo:'all', desde:null, hasta:null };
    renderCards();
  });
}
attachFilterListeners();

// ---------------- PINTAR INICIAL ----------------
renderCalendar();

// ---------------- FIREBASE INIT ----------------
(async ()=>{
  try{
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js');
    const { getFirestore, doc, setDoc, getDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js');
    const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js');

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const ref = doc(db, 'calendars', 'ceppbo');

    onAuthStateChanged(auth,(u)=>{
      if(u){
        dot.classList.replace('offline','online');
        statustext.textContent='Conectado';
      } else {
        dot.classList.replace('online','offline');
        statustext.textContent='Desconectado';
      }
    });

    await signInAnonymously(auth).catch((e)=>{
      statustext.textContent='Auth error: '+(e.code||'auth');
    });

    const s = await getDoc(ref);
    if (!s.exists()) await setDoc(ref,{events:{}});
    else state.events = s.data().events || {};
    renderCalendar();

    onSnapshot(ref,(snap)=>{
      const data=snap.data();
      if(!data) return;
      state.events = data.events || {};
      renderCalendar();
    });

    state._ops = {
      async pushEvent(dateStr, ev){
        const s=await getDoc(ref);
        const d=s.data()||{events:{}};
        const e=d.events||{};
        if(!e[dateStr]) e[dateStr]=[];
        e[dateStr].push(ev);
        await setDoc(ref,{events:e},{merge:true});
      },
      async updateEvent(dateStr, idx, ev){
        const s=await getDoc(ref);
        const d=s.data()||{events:{}};
        const e=d.events||{};
        if(!e[dateStr]) return;
        e[dateStr][idx]=ev;
        await setDoc(ref,{events:e},{merge:true});
      },
      async removeEvent(dateStr, idx){
        const s=await getDoc(ref);
        const d=s.data()||{events:{}};
        const e=d.events||{};
        if(!e[dateStr]) return;
        e[dateStr].splice(idx,1);
        if(!e[dateStr].length) delete e[dateStr];
        await setDoc(ref,{events:e},{merge:true});
      },
      async clearAll(){
        await setDoc(ref,{events:{}},{merge:true});
      }
    };
  }catch(e){
    console.error(e);
    statustext.textContent='Error Firebase (revisa config/servicios)';
  }
})();
