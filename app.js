// --- Utils ---
function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $all(sel, ctx=document){ return [...ctx.querySelectorAll(sel)]; }

// --- Estado ---
let EDIT_ENABLED = false;
let CURRENT_FILTER = 'all';
let unsubSnapshot = null;

// --- Login anónimo para permitir lectura (y escritura si reglas lo dejan) ---
auth.signInAnonymously().catch(console.error);

// --- PIN simple (cámbialo a tu gusto/seguridad) ---
const EDIT_PIN = '123'; // puedes cambiar a '000' o el que quieras

// --- Referencias DOM ---
const editToggle = $('#editToggle');
const wipeAll = $('#wipeAll');
const editorModal = $('#editorModal');
const pinModal = $('#pinModal');
const pinForm = $('#pinForm');
const pinInput = $('#pinInput');
const eventForm = $('#eventForm');
const cancelEdit = $('#cancelEdit');
const closeEditor = $('#closeEditor');
const eventList = $('#eventList');
const filtersBox = $('#filters');

// --- Resize helper ---
async function resizeImageToDataURL(file, maxW = 800, maxH = 800, quality = 0.8) {
  const img = await createImageBitmap(file);
  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return await new Promise(res => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(blob);
  });
}

// --- Render tarjeta ---
function renderEventCard(doc) {
  const data = doc.data();
  const date = data.date || '';
  const title = data.title || '—';
  const type = data.type || 'otro';
  const desc = data.desc || '';
  const img = data.bannerUrl || 'assets/banner-fallback.png';

  const card = document.createElement('article');
  card.className = 'event-card';
  card.dataset.type = type;
  card.innerHTML = `
    <div class="event-card__banner">
      <img src="${img}" alt="Banner">
    </div>
    <div class="event-card__body">
      <div class="event-card__meta">${new Date(date).toLocaleDateString()}</div>
      <h4 class="event-card__title">${title}</h4>
      ${desc ? `<p>${desc}</p>` : ''}
      ${EDIT_ENABLED ? `
        <div class="event-card__actions">
          <button class="btn btn-primary" data-action="edit">Editar</button>
          <button class="btn btn-danger" data-action="del">Eliminar</button>
        </div>` : ''}
    </div>
  `;

  if (EDIT_ENABLED) {
    card.querySelector('[data-action="edit"]').onclick = () => openEditor(doc.id, data);
    card.querySelector('[data-action="del"]').onclick = async () => {
      if(!confirm('¿Eliminar esta fecha?')) return;
      await db.collection('calendars').doc(doc.id).delete();
      // Borrar banner del Storage (si existe)
      try { await storage.ref(`events/${doc.id}/banner.jpg`).delete(); } catch(e){}
    };
  }

  return card;
}

// --- Carga y escucha de eventos según filtro ---
function attachSnapshot() {
  if (unsubSnapshot) unsubSnapshot();

  let query = db.collection('calendars').orderBy('date', 'asc');
  if (CURRENT_FILTER !== 'all') {
    query = query.where('type', '==', CURRENT_FILTER);
  }
  unsubSnapshot = query.onSnapshot(snap => {
    eventList.innerHTML = '';
    snap.forEach(doc => eventList.appendChild(renderEventCard(doc)));
  });
}

// --- Filtros UI ---
filtersBox.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  $all('.filter-btn', filtersBox).forEach(b => b.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');
  CURRENT_FILTER = btn.dataset.filter;
  attachSnapshot();
});

// --- Botón editar ---
editToggle.addEventListener('click', () => {
  if (!EDIT_ENABLED) {
    pinModal.showModal();
  } else {
    EDIT_ENABLED = false;
    editToggle.textContent = 'Editar';
    attachSnapshot();
  }
});

// --- PIN modal ---
pinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pin = pinInput.value.trim();
  if (pin === EDIT_PIN) {
    EDIT_ENABLED = true;
    editToggle.textContent = 'Edición ON';
    pinModal.close();
    openEditor(); // abre directamente el editor para crear
    attachSnapshot();
  } else {
    alert('PIN incorrecto');
  }
});
$('#cancelPin').onclick = () => pinModal.close();

// --- Abrir editor ---
function openEditor(id=null, data={}) {
  eventForm.dataset.id = id || '';
  $('#editorTitle').textContent = id ? 'Editar fecha' : 'Nueva fecha';
  $('#title').value = data.title || '';
  $('#date').value = data.date || '';
  $('#type').value = data.type || 'comm';
  $('#desc').value = data.desc || '';
  $('#photo').value = '';
  editorModal.showModal();
}

// --- Cerrar editor ---
cancelEdit.onclick = () => editorModal.close();
closeEditor.onclick = () => editorModal.close();

// --- Guardar ---
eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = eventForm.dataset.id || db.collection('calendars').doc().id;
  const ref = db.collection('calendars').doc(id);

  const title = $('#title').value.trim();
  const date = $('#date').value;
  const type = $('#type').value;
  const desc = $('#desc').value.trim();
  const file = $('#photo').files[0];

  let bannerUrl = null;

  if (file) {
    // Redimensiona y sube al Storage
    const dataUrl = await resizeImageToDataURL(file, 800, 800, 0.8);
    // Subir como bytes
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const storageRef = storage.ref(`events/${id}/banner.jpg`);
    await storageRef.put(blob, { contentType: 'image/jpeg' });
    bannerUrl = await storageRef.getDownloadURL();
  }

  const payload = { title, date, type, desc, updatedAt: Date.now() };
  if (bannerUrl) payload.bannerUrl = bannerUrl;

  await ref.set(payload, { merge: true });
  editorModal.close();
});

// --- Borrar todo (con confirmación doble) ---
wipeAll.addEventListener('click', async () => {
  if (!EDIT_ENABLED) return alert('Activa Edición para poder borrar.');
  if (!confirm('¿Seguro que deseas borrar todos los eventos?')) return;
  const snap = await db.collection('calendars').get();
  const batch = db.batch();
  snap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  alert('Listo. Se borraron todas las fechas.');
});

// --- Inicio ---
attachSnapshot();
