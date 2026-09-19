import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const config = window.RIFADOS_SUPABASE || {};
const validConfig = /^https:\/\/.+\.supabase\.co$/i.test(config.url || '') && Boolean(config.publishableKey);
if (validConfig) loadPublishedRaffles();

async function loadPublishedRaffles() {
  const supabase = createClient(config.url, config.publishableKey);
  const { data: raffles, error } = await supabase.from('raffles')
    .select('id,title,category,description,price_cents,total_tickets,draw_at,image_path,status,draw_video_path,delivery_video_path')
    .eq('status', 'published').order('created_at', { ascending: false });
  if (error || !raffles?.length) return;
  const grid = document.getElementById('catalogGrid');
  raffles.forEach(raffle => grid.prepend(buildCard(raffle, supabase)));
  window.dispatchEvent(new Event('rifados:catalog-updated'));
}

function buildCard(raffle, supabase) {
  const card = document.createElement('article');
  card.className = 'raffle-card'; card.dataset.category = raffle.category; card.dataset.name = raffle.title.toLowerCase();
  const imageUrl = raffle.image_path ? supabase.storage.from('raffle-images').getPublicUrl(raffle.image_path).data.publicUrl : 'assets/nintendo-switch-2-rifa.png';
  const draw = new Date(raffle.draw_at).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
  const price = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(raffle.price_cents / 100);
  card.innerHTML = `<div class="raffle-visual"><img alt="" loading="lazy"></div><div class="raffle-info"><span class="status live">En vivo</span><h3></h3><p></p><div class="raffle-meta"><span></span><span></span></div><div class="raffle-price"><strong></strong><small> / boleto</small></div><button class="btn btn-wa btn-sm btn-block" type="button">Elegir boletos</button></div>`;
  card.querySelector('img').src = imageUrl; card.querySelector('img').alt = raffle.title;
  card.querySelector('h3').textContent = raffle.title; card.querySelector('p').textContent = raffle.description;
  card.querySelectorAll('.raffle-meta span')[0].textContent = `${raffle.total_tickets} boletos`;
  card.querySelectorAll('.raffle-meta span')[1].textContent = `Sorteo: ${draw}`;
  card.querySelector('.raffle-price strong').textContent = price;
  card.querySelector('button').addEventListener('click', () => openRaffle(raffle, imageUrl, supabase));
  const videos = [
    ['Video del sorteo en vivo', raffle.draw_video_path],
    ['Video de entrega del premio', raffle.delivery_video_path]
  ].filter(([, path]) => path);
  if (videos.length) {
    const evidence = document.createElement('section'); evidence.className = 'raffle-videos';
    const heading = document.createElement('h4'); heading.textContent = 'Evidencia de la rifa'; evidence.append(heading);
    videos.forEach(([label, path]) => { const item=document.createElement('div'); const title=document.createElement('p'); title.textContent=label; const video=document.createElement('video'); video.controls=true; video.preload='metadata'; video.src=supabase.storage.from('raffle-videos').getPublicUrl(path).data.publicUrl; item.append(title,video); evidence.append(item); });
    card.querySelector('.raffle-info').append(evidence);
  }
  return card;
}

async function openRaffle(raffle, imageUrl, supabase) {
  const { data, error } = await supabase.rpc('available_ticket_numbers', { p_raffle_id: raffle.id });
  if (error || !data?.length) return alert('Esta rifa no tiene boletos disponibles por el momento.');
  const digits = String(raffle.total_tickets).length;
  window.rifadosOpenRaffle({ id:raffle.id, title:raffle.title, imageUrl, availableNumbers:data.map(ticket => String(ticket.ticket_number).padStart(digits, '0')) });
}
