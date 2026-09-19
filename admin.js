import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const config = window.RIFADOS_SUPABASE || {};
const isConfigured = /^https:\/\/.+\.supabase\.co$/i.test(String(config.url || '')) && Boolean(config.publishableKey);
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:0 }).format((cents || 0) / 100);
const dateLabel = value => new Date(value).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
const dateTimeLocal = value => { const d = new Date(value); const off = d.getTimezoneOffset() * 60000; return new Date(d - off).toISOString().slice(0,16); };
const statusText = { draft:'Borrador', published:'Publicada', paused:'Pausada', closed:'Cerrada' };
const kindText = { transfer:'Transferencia', cash:'Efectivo', card:'Tarjeta', wallet:'Billetera digital', other:'Otro' };
let supabase, raffles = [], payments = [], ticketStats = new Map(), activeUser;

// Orders are injected here so existing deployments receive the review queue without a markup migration.
const paymentsNav = document.querySelector('[data-view="payments"]');
paymentsNav.insertAdjacentHTML('beforebegin', '<button class="nav-item" data-view="orders" type="button"><span class="nav-icon">✓</span>Pedidos <span id="orderNavCount" class="nav-count">0</span></button>');
$('paymentsView').insertAdjacentHTML('beforebegin', '<section class="view" id="ordersView"><div class="section-bar"><div><p class="eyebrow">REVISIÓN</p><h2>Pedidos pendientes</h2><p class="section-description">Aprueba sólo después de verificar el comprobante. Rechazar libera los boletos.</p></div><button id="refreshOrders" class="small-button" type="button">↻ Actualizar</button></div><section class="panel table-panel"><div id="orderList" class="raffle-list" aria-live="polite"></div></section></section>');
document.querySelector('#raffleForm .form-footer').insertAdjacentHTML('beforebegin', '<section id="raffleVideos" class="raffle-videos-editor" hidden><p class="hint"><strong>Transparencia después del sorteo.</strong> Estos videos se muestran públicamente y sólo se pueden adjuntar cuando la rifa está cerrada.</p><div class="form-two"><label>Video del live del ganador<input name="drawVideo" type="file" accept="video/mp4,video/webm,video/quicktime"></label><label>Video de entrega del premio<input name="deliveryVideo" type="file" accept="video/mp4,video/webm,video/quicktime"></label></div></section>');

function setStatus(id, text = '', type = '') { const el = $(id); el.textContent = text; el.className = `status ${type}`; }
function emptyState(title, note) { const el = document.createElement('div'); el.className = 'empty-state'; const strong = document.createElement('strong'); strong.textContent = title; const p = document.createElement('p'); p.textContent = note; el.append(strong,p); return el; }
function setSync(text = 'Actualizado ahora') { $('syncStatus').textContent = text; }

if (!isConfigured) {
  $('setupNotice').hidden = false;
  $('loginForm').querySelector('button').disabled = true;
  setStatus('loginStatus', 'El panel se activará cuando GitHub publique supabase-config.js.', 'error');
} else {
  supabase = createClient(config.url, config.publishableKey, { auth:{ persistSession:true, autoRefreshToken:true } });
  const { data:{ session } } = await supabase.auth.getSession();
  if (session) await showApp(session.user);
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return setStatus('loginStatus', 'La configuración no se cargó. Actualiza la página e inténtalo otra vez.', 'error');
  const values = new FormData(event.currentTarget);
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  setStatus('loginStatus', 'Verificando acceso…');
  submitButton.disabled = true;
  try {
    const { data, error } = await Promise.race([
      supabase.auth.signInWithPassword({ email:values.get('email'), password:values.get('password') }),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 15000))
    ]);
    if (error || !data.user) return setStatus('loginStatus', 'No fue posible iniciar sesión. Revisa tus datos.', 'error');
    await showApp(data.user);
  } catch (error) {
    setStatus('loginStatus', 'No se pudo contactar el acceso. Revisa tu conexión y vuelve a intentarlo.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

$('signOut').addEventListener('click', async () => { if (!supabase) return; await supabase.auth.signOut(); $('appView').hidden = true; $('loginView').hidden = false; $('loginForm').reset(); });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => { setView(button.dataset.go); if (button.dataset.new) resetRaffleForm(); }));
$('quickNewRaffle').addEventListener('click', () => { setView('raffles'); resetRaffleForm(); });
$('newRaffleButton').addEventListener('click', resetRaffleForm);
$('cancelRaffleEdit').addEventListener('click', resetRaffleForm);
$('cancelPaymentEdit').addEventListener('click', resetPaymentForm);
$('refreshRaffles').addEventListener('click', loadDashboard);
$('refreshPayments').addEventListener('click', loadPayments);
$('refreshOrders').addEventListener('click', loadOrders);
$('raffleForm').elements.status.addEventListener('change', updateVideoFields);

function setView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const copy = { overview:['VISTA GENERAL','Buenos días, organizador'], raffles:['CATÁLOGO','Administración de rifas'], orders:['REVISIÓN','Pedidos pendientes'], payments:['COBROS','Métodos de pago'] }[view];
  $('viewKicker').textContent = copy[0]; $('viewTitle').textContent = copy[1];
}

async function showApp(user) {
  activeUser = user; $('loginView').hidden = true; $('appView').hidden = false;
  $('adminEmail').textContent = user.email || '';
  $('adminName').textContent = (user.email || 'Organizador').split('@')[0];
  $('profileInitial').textContent = (user.email || 'R').charAt(0).toUpperCase();
  await Promise.all([loadDashboard(), loadPayments(), loadOrders()]);
}

async function loadOrders() {
  if (!supabase) return;
  const { data, error } = await supabase.from('orders').select('id,buyer_name,buyer_email,buyer_phone,total_cents,status,receipt_path,created_at,raffles(title)').order('created_at', { ascending:false });
  const list = $('orderList');
  if (error) { list.replaceChildren(emptyState('No fue posible cargar pedidos', 'Confirma que la migración de checkout y los permisos de administrador estén activos.')); return; }
  const orders = data || [], pending = orders.filter(order => order.status === 'pending_review');
  $('orderNavCount').textContent = String(pending.length);
  if (!orders.length) { list.replaceChildren(emptyState('Aún no hay pedidos', 'Los comprobantes recibidos aparecerán aquí para su revisión.')); return; }
  list.replaceChildren(...orders.map(order => {
    const row = document.createElement('article'); row.className='raffle-row';
    const info = document.createElement('div'); const title=document.createElement('h3'); title.textContent=`${order.raffles?.title || 'Rifa'} · ${money(order.total_cents)}`; const meta=document.createElement('p'); meta.className='raffle-meta'; meta.textContent=`${order.buyer_name} · ${order.buyer_email} · ${order.buyer_phone} · ${dateLabel(order.created_at)}`; info.append(title,meta);
    const actions=document.createElement('div'); actions.className='row-actions'; const badge=document.createElement('span'); badge.className=`badge ${order.status === 'approved' ? 'published' : order.status === 'rejected' ? 'closed' : 'draft'}`; badge.textContent=order.status === 'pending_review' ? 'Pendiente' : order.status === 'approved' ? 'Aprobado' : 'Rechazado'; actions.append(badge);
    const receipt=document.createElement('button'); receipt.className='row-action'; receipt.type='button'; receipt.textContent='Ver comprobante'; receipt.onclick=async()=>{ const {data:signed,error:signedError}=await supabase.storage.from('payment-receipts').createSignedUrl(order.receipt_path,60); if(signedError||!signed?.signedUrl) return alert('No se pudo abrir el comprobante.'); window.open(signed.signedUrl,'_blank','noopener'); }; actions.append(receipt);
    if(order.status === 'pending_review') ['approved','rejected'].forEach(status => { const button=document.createElement('button'); button.className='row-action'; button.type='button'; button.textContent=status === 'approved' ? 'Aprobar' : 'Rechazar'; button.onclick=async()=>{ if(!confirm(`${status === 'approved' ? '¿Aprobar' : '¿Rechazar'} este pedido?`)) return; const {error:reviewError}=await supabase.rpc('review_order',{p_order_id:order.id,p_status:status,p_note:null}); if(reviewError) return alert('No fue posible actualizar el pedido.'); await Promise.all([loadOrders(),loadDashboard()]); }; actions.append(button); });
    row.append(info,actions); return row;
  }));
}

async function loadDashboard() {
  if (!supabase) return; setSync('Actualizando…');
  const { data, error } = await supabase.from('raffles').select('id,title,category,description,price_cents,total_tickets,draw_at,status,image_path,draw_video_path,delivery_video_path,created_at').order('created_at', { ascending:false });
  if (error) {
    $('raffleList').replaceChildren(emptyState('No fue posible cargar rifas', 'Confirma que esta cuenta esté registrada como administrador.'));
    $('raffleListSummary').textContent = 'Acceso pendiente'; setSync('Revisa permisos'); return;
  }
  raffles = data || [];
  ticketStats = new Map(await Promise.all(raffles.map(async raffle => {
    const [all, paid] = await Promise.all([
      supabase.from('tickets').select('*', { count:'exact', head:true }).eq('raffle_id', raffle.id),
      supabase.from('tickets').select('*', { count:'exact', head:true }).eq('raffle_id', raffle.id).eq('status','paid')
    ]);
    return [raffle.id, { total:all.count || raffle.total_tickets, paid:paid.count || 0 }];
  })));
  renderRaffles(); renderOverview(); setSync();
}

function renderOverview() {
  const paid = raffles.reduce((sum, raffle) => sum + (ticketStats.get(raffle.id)?.paid || 0), 0);
  const total = raffles.reduce((sum, raffle) => sum + raffle.total_tickets, 0);
  const revenue = raffles.reduce((sum, raffle) => sum + (ticketStats.get(raffle.id)?.paid || 0) * raffle.price_cents, 0);
  const published = raffles.filter(r => r.status === 'published');
  const drafts = raffles.filter(r => r.status === 'draft');
  const next = raffles.filter(r => new Date(r.draw_at) > new Date() && r.status !== 'closed').sort((a,b) => new Date(a.draw_at)-new Date(b.draw_at))[0];
  $('metricRevenue').textContent = money(revenue); $('metricRevenueNote').textContent = paid ? 'Importe de boletos pagados' : 'Sin boletos pagados aún';
  $('metricPaid').textContent = paid.toLocaleString('es-MX'); $('metricPaidNote').textContent = `De ${total.toLocaleString('es-MX')} boletos creados`;
  $('metricLive').textContent = published.length; $('metricLiveNote').textContent = `${drafts.length} en borrador`;
  $('metricNext').textContent = next ? dateLabel(next.draw_at) : '—'; $('metricNextNote').textContent = next ? next.title : 'Programa una rifa';
  const list = $('progressList');
  if (!raffles.length) { list.replaceChildren(emptyState('Aún no hay actividad', 'Crea una rifa para ver sus métricas aquí.')); return; }
  list.replaceChildren(...raffles.slice(0,5).map(raffle => {
    const stat = ticketStats.get(raffle.id) || { paid:0 }; const percentage = raffle.total_tickets ? Math.min(100, Math.round(stat.paid / raffle.total_tickets * 100)) : 0;
    const row = document.createElement('article'); row.className = 'progress-row';
    const title = document.createElement('div'); title.className = 'progress-title'; const name = document.createElement('span'); name.textContent = raffle.title; const percent = document.createElement('span'); percent.textContent = `${percentage}% vendido`; title.append(name,percent);
    const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('i'); fill.style.width = `${percentage}%`; bar.append(fill);
    const sub = document.createElement('p'); sub.className = 'progress-sub'; sub.textContent = `${stat.paid.toLocaleString('es-MX')} de ${raffle.total_tickets.toLocaleString('es-MX')} boletos pagados · ${money(raffle.price_cents)} c/u`;
    row.append(title,bar,sub); return row;
  }));
}

function renderRaffles() {
  $('raffleNavCount').textContent = raffles.length; $('raffleListSummary').textContent = raffles.length ? `${raffles.length} rifa${raffles.length === 1 ? '' : 's'} registrada${raffles.length === 1 ? '' : 's'}` : 'Sin rifas registradas';
  const list = $('raffleList');
  if (!raffles.length) { list.replaceChildren(emptyState('Aún no hay rifas', 'Crea la primera desde el formulario.')); return; }
  list.replaceChildren(...raffles.map(raffle => {
    const row = document.createElement('article'); row.className = 'raffle-row';
    const thumb = document.createElement('div'); thumb.className = 'raffle-thumb'; thumb.textContent = raffle.title.charAt(0).toUpperCase();
    const info = document.createElement('div'); const title = document.createElement('h3'); title.textContent = raffle.title; const meta = document.createElement('p'); meta.className = 'raffle-meta'; meta.textContent = `${money(raffle.price_cents)} · ${raffle.total_tickets.toLocaleString('es-MX')} boletos · ${dateLabel(raffle.draw_at)}`; info.append(title,meta);
    const actions = document.createElement('div'); actions.className = 'row-actions'; const badge = document.createElement('span'); badge.className = `badge ${raffle.status}`; badge.textContent = statusText[raffle.status]; const edit = document.createElement('button'); edit.className = 'row-action'; edit.type = 'button'; edit.textContent = 'Editar'; edit.onclick = () => editRaffle(raffle.id); const toggle = document.createElement('button'); toggle.className = 'row-action'; toggle.type = 'button'; toggle.textContent = raffle.status === 'published' ? 'Pausar' : 'Publicar'; toggle.onclick = () => updateRaffleStatus(raffle, raffle.status === 'published' ? 'paused' : 'published'); actions.append(badge,edit,toggle); row.append(thumb,info,actions); return row;
  }));
}

function resetRaffleForm() {
  const form = $('raffleForm'); form.reset(); $('raffleId').value = ''; form.elements.totalTickets.disabled = false;
  $('raffleFormKicker').textContent = 'NUEVA RIFA'; $('raffleFormTitle').textContent = 'Crea una rifa'; $('saveRaffle').textContent = 'Crear rifa y boletos'; $('cancelRaffleEdit').hidden = true; setStatus('raffleStatus'); updateVideoFields();
  $('raffleEditor').scrollIntoView({ behavior:'smooth', block:'start' });
}

function editRaffle(id) {
  const raffle = raffles.find(item => item.id === id); if (!raffle) return; setView('raffles'); const form = $('raffleForm');
  $('raffleId').value = raffle.id; form.elements.title.value = raffle.title; form.elements.category.value = raffle.category; form.elements.price.value = (raffle.price_cents / 100).toFixed(2); form.elements.totalTickets.value = raffle.total_tickets; form.elements.totalTickets.disabled = true; form.elements.drawAt.value = dateTimeLocal(raffle.draw_at); form.elements.description.value = raffle.description; form.elements.status.value = raffle.status;
  $('raffleFormKicker').textContent = 'EDITANDO RIFA'; $('raffleFormTitle').textContent = raffle.title; $('saveRaffle').textContent = 'Guardar cambios'; $('cancelRaffleEdit').hidden = false; setStatus('raffleStatus', 'El total de boletos no se modifica después de crearlo.'); updateVideoFields(); $('raffleEditor').scrollIntoView({ behavior:'smooth', block:'start' });
}

function updateVideoFields() { const form=$('raffleForm'); $('raffleVideos').hidden=!(form.elements.id.value && form.elements.status.value === 'closed'); }

async function updateRaffleStatus(raffle, status) {
  const { error } = await supabase.from('raffles').update({ status }).eq('id', raffle.id); if (error) return alert('No se pudo modificar el estado.'); await loadDashboard();
}

$('raffleForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!supabase) return; const form = new FormData(event.currentTarget); const id = String(form.get('id')); const title = String(form.get('title')).trim(); const priceCents = Math.round(Number(form.get('price')) * 100); const totalTickets = Number(form.get('totalTickets')); const button = $('saveRaffle');
  if (!title || !Number.isSafeInteger(priceCents) || priceCents < 100 || (!id && (!Number.isInteger(totalTickets) || totalTickets < 1 || totalTickets > 100000))) return setStatus('raffleStatus','Revisa el precio y total de boletos.','error');
  button.disabled = true; setStatus('raffleStatus', id ? 'Guardando cambios…' : 'Creando rifa…'); let imagePath;
  try {
    const image = form.get('image');
    if (image && image.size) { if (!['image/jpeg','image/png','image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) throw new Error('Usa una imagen JPG, PNG o WEBP de máximo 5 MB.'); imagePath = `raffles/${crypto.randomUUID()}.${image.name.split('.').pop().toLowerCase()}`; const { error } = await supabase.storage.from('raffle-images').upload(imagePath,image,{contentType:image.type,upsert:false}); if (error) throw new Error('No pudimos subir la imagen. Crea primero el bucket raffle-images en Storage.'); }
    const payload = { title, category:form.get('category'), description:String(form.get('description')).trim(), price_cents:priceCents, draw_at:new Date(String(form.get('drawAt'))).toISOString(), status:form.get('status') }; if (imagePath) payload.image_path = imagePath;
    if (id) { for (const [field,column,label] of [['drawVideo','draw_video_path','live'],['deliveryVideo','delivery_video_path','entrega']]) { const video=form.get(field); if (!video || !video.size) continue; if (!['video/mp4','video/webm','video/quicktime'].includes(video.type) || video.size > 500*1024*1024) throw new Error('Cada video debe ser MP4, WEBM o MOV de máximo 500 MB.'); const ext=video.name.split('.').pop().toLowerCase(), path=`raffles/${id}/${label}-${crypto.randomUUID()}.${ext}`; const {error:videoError}=await supabase.storage.from('raffle-videos').upload(path,video,{contentType:video.type,upsert:false}); if(videoError) throw new Error('No pudimos subir el video. Confirma que la migración de videos está activa.'); payload[column]=path; } const { error } = await supabase.from('raffles').update(payload).eq('id',id); if (error) throw error; setStatus('raffleStatus','Cambios y videos guardados.','ok'); }
    else { payload.total_tickets = totalTickets; const { data:raffle, error } = await supabase.from('raffles').insert(payload).select('id').single(); if (error) throw error; for (let start=1; start<=totalTickets; start+=500) { const tickets = Array.from({length:Math.min(500,totalTickets-start+1)},(_,index)=>({raffle_id:raffle.id,ticket_number:start+index,status:'available'})); const { error:ticketsError } = await supabase.from('tickets').insert(tickets); if (ticketsError) throw ticketsError; } setStatus('raffleStatus','Rifa creada correctamente.','ok'); }
    await loadDashboard(); if (!id) resetRaffleForm();
  } catch (error) { setStatus('raffleStatus', error.message || 'No fue posible guardar la rifa.', 'error'); } finally { button.disabled = false; }
});

async function loadPayments() {
  if (!supabase) return; const { data, error } = await supabase.from('payment_methods').select('id,name,kind,instructions,is_active,sort_order,created_at').order('sort_order').order('created_at');
  if (error) { $('paymentList').replaceChildren(emptyState('Métodos aún sin configurar', 'Ejecuta el archivo supabase/admin-upgrade.sql en SQL Editor para activarlos.')); return; }
  payments = data || []; renderPayments();
}

function renderPayments() {
  const list = $('paymentList'); if (!payments.length) { list.replaceChildren(emptyState('No hay métodos de pago', 'Agrega el primero desde el formulario.')); return; }
  list.replaceChildren(...payments.map(method => { const row = document.createElement('article'); row.className = 'payment-row'; const info = document.createElement('div'); const title = document.createElement('h3'); title.textContent = method.name; const note = document.createElement('p'); note.textContent = `${kindText[method.kind]} · ${method.instructions}`; info.append(title,note); const actions = document.createElement('div'); actions.className = 'row-actions'; const badge = document.createElement('span'); badge.className = `badge ${method.is_active ? 'published':'draft'}`; badge.textContent = method.is_active ? 'Activo':'Oculto'; const edit = document.createElement('button'); edit.className = 'row-action'; edit.type='button'; edit.textContent='Editar'; edit.onclick = () => editPayment(method.id); const toggle = document.createElement('button'); toggle.className='row-action'; toggle.type='button'; toggle.textContent=method.is_active?'Ocultar':'Activar'; toggle.onclick=async()=>{await supabase.from('payment_methods').update({is_active:!method.is_active}).eq('id',method.id);await loadPayments();}; actions.append(badge,edit,toggle); row.append(info,actions); return row; }));
}

function resetPaymentForm() { $('paymentForm').reset(); $('paymentId').value = ''; $('paymentForm').elements.isActive.checked = true; $('paymentFormKicker').textContent='NUEVO MÉTODO'; $('paymentFormTitle').textContent='Agregar método'; $('cancelPaymentEdit').hidden=true; setStatus('paymentStatus'); }
function editPayment(id) { const method = payments.find(item=>item.id===id); if (!method) return; setView('payments'); const form=$('paymentForm'); $('paymentId').value=method.id; form.elements.name.value=method.name; form.elements.kind.value=method.kind; form.elements.instructions.value=method.instructions; form.elements.isActive.checked=method.is_active; $('paymentFormKicker').textContent='EDITANDO MÉTODO'; $('paymentFormTitle').textContent=method.name; $('cancelPaymentEdit').hidden=false; }
$('paymentForm').addEventListener('submit', async event => { event.preventDefault(); if (!supabase) return; const form = new FormData(event.currentTarget); const id=String(form.get('id')); const payload={name:String(form.get('name')).trim(),kind:form.get('kind'),instructions:String(form.get('instructions')).trim(),is_active:form.get('isActive')==='on'}; if (!payload.name || !payload.instructions) return; setStatus('paymentStatus','Guardando…'); const response=id ? await supabase.from('payment_methods').update(payload).eq('id',id) : await supabase.from('payment_methods').insert(payload); if(response.error) return setStatus('paymentStatus','No fue posible guardar. Ejecuta primero la actualización SQL.','error'); setStatus('paymentStatus','Método guardado.','ok'); resetPaymentForm(); await loadPayments(); });
