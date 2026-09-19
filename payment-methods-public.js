(() => {
  const config = window.RIFADOS_SUPABASE || {}, list = document.getElementById('publicPaymentMethods');
  if (!list || !config.url || !config.publishableKey) return;
  fetch(`${config.url}/rest/v1/payment_methods?select=name,instructions&is_active=eq.true&order=sort_order.asc,created_at.asc`, { headers:{ apikey:config.publishableKey, Authorization:`Bearer ${config.publishableKey}` } })
    .then(response => response.ok ? response.json() : [])
    .then(methods => { if (!Array.isArray(methods) || !methods.length) return; list.replaceChildren(...methods.map(method => { const card=document.createElement('article'); card.className='pay-card reveal'; const title=document.createElement('h3'); title.textContent=method.name; const note=document.createElement('p'); note.textContent=method.instructions; card.append(title,note); return card; })); })
    .catch(() => {});
})();
