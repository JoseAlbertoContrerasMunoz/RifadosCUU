import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const config = window.RIFADOS_SUPABASE || {};
const ready = /^https:\/\/.+\.supabase\.co$/i.test(config.url || '') && Boolean(config.publishableKey);
const $ = id => document.getElementById(id);
const loginView = $('loginView'), appView = $('appView'), setupNotice = $('setupNotice');
let supabase;

const setStatus = (id, message, type = '') => { const el = $(id); el.textContent = message; el.className = `status ${type}`; };
const mxn = cents => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(cents / 100);

if (!ready) {
  setupNotice.hidden = false;
  $('loginForm').querySelector('button').disabled = true;
  setStatus('loginStatus', 'El panel se activará al configurar Supabase.', 'error');
} else {
  supabase = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data: { session } } = await supabase.auth.getSession();
  if (session) showApp(session.user); else loginView.hidden = false;
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!supabase) return;
  const form = new FormData(event.currentTarget);
  setStatus('loginStatus', 'Verificando acceso…');
  const { data, error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  if (error) return setStatus('loginStatus', 'No fue posible iniciar sesión. Revisa tus datos o permisos.', 'error');
  showApp(data.user);
});

$('signOut').addEventListener('click', async () => { if (!supabase) return; await supabase.auth.signOut(); appView.hidden = true; loginView.hidden = false; $('loginForm').reset(); });
$('refreshRaffles').addEventListener('click', loadRaffles);

async function showApp(user) { loginView.hidden = true; appView.hidden = false; $('adminEmail').textContent = user.email || ''; await loadRaffles(); }

async function loadRaffles() {
  if (!supabase) return;
  const list = $('raffleList'); list.textContent = 'Cargando rifas…';
  const { data, error } = await supabase.from('raffles').select('id,title,price_cents,total_tickets,draw_at,status,created_at').order('created_at',{ascending:false});
  if (error) { list.textContent = 'No se pudieron cargar. Esta cuenta quizá no tiene permiso de organizador.'; return; }
  if (!data.length) { list.textContent = 'Aún no hay rifas. Crea la primera a la izquierda.'; return; }
  list.replaceChildren(...data.map(raffle => raffleRow(raffle)));
}

function raffleRow(raffle) {
  const row = document.createElement('article'); row.className = 'raffle-row';
  const date = new Date(raffle.draw_at).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});
  row.innerHTML = `<h3></h3><p class="raffle-meta"></p><div class="raffle-actions"><button type="button" class="secondary"></button></div>`;
  row.querySelector('h3').textContent = raffle.title;
  row.querySelector('.raffle-meta').textContent = `${mxn(raffle.price_cents)} por boleto · ${raffle.total_tickets} boletos · ${date} · ${raffle.status}`;
  const action = row.querySelector('button'); const next = raffle.status === 'published' ? 'paused' : 'published';
  action.textContent = next === 'published' ? 'Publicar' : 'Pausar';
  action.addEventListener('click', async () => {
    action.disabled = true;
    const { error } = await supabase.from('raffles').update({status:next}).eq('id',raffle.id);
    if (error) alert('No fue posible cambiar el estado.');
    await loadRaffles();
  });
  return row;
}

$('raffleForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!supabase) return;
  const form = new FormData(event.currentTarget), button = $('saveRaffle');
  const title = String(form.get('title')).trim(); const totalTickets = Number(form.get('totalTickets')); const priceCents = Math.round(Number(form.get('price')) * 100);
  if (!title || !Number.isInteger(totalTickets) || totalTickets < 1 || totalTickets > 100000 || !Number.isSafeInteger(priceCents) || priceCents < 100) return setStatus('raffleStatus','Revisa título, precio y número de boletos.','error');
  button.disabled = true; setStatus('raffleStatus','Creando rifa…');
  let imagePath = null;
  try {
    const image = form.get('image');
    if (image && image.size) {
      if (!['image/jpeg','image/png','image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) throw new Error('La imagen debe ser JPG, PNG o WEBP y pesar máximo 5 MB.');
      const extension = image.name.split('.').pop().toLowerCase(); imagePath = `raffles/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('raffle-images').upload(imagePath, image, { contentType:image.type, upsert:false });
      if (uploadError) throw uploadError;
    }
    const { data: raffle, error: raffleError } = await supabase.from('raffles').insert({title,category:form.get('category'),description:String(form.get('description')).trim(),price_cents:priceCents,total_tickets:totalTickets,draw_at:new Date(String(form.get('drawAt'))).toISOString(),status:form.get('status'),image_path:imagePath}).select('id').single();
    if (raffleError) throw raffleError;
    const batchSize = 500;
    for (let start = 1; start <= totalTickets; start += batchSize) {
      const tickets = Array.from({length:Math.min(batchSize,totalTickets-start+1)},(_,index)=>({raffle_id:raffle.id,ticket_number:start+index,status:'available'}));
      const { error: ticketsError } = await supabase.from('tickets').insert(tickets);
      if (ticketsError) throw ticketsError;
    }
    event.currentTarget.reset(); setStatus('raffleStatus','Rifa creada. Puedes publicarla cuando esté lista.','ok'); await loadRaffles();
  } catch (error) {
    setStatus('raffleStatus', error.message || 'No fue posible crear la rifa.', 'error');
  } finally { button.disabled = false; }
});
