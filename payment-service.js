/* Browser adapter for the secure Supabase checkout Edge Function. */
(() => {
  const config = window.RIFADOS_SUPABASE || {};
  const request = async body => {
    const form = body instanceof FormData;
    const response = await fetch(`${config.url}/functions/v1/checkout`, { method:'POST', headers: form ? { apikey:config.publishableKey } : { apikey:config.publishableKey, 'Content-Type':'application/json' }, body:form ? body : JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'checkout_failed');
    return result;
  };
  window.rifadosPaymentService = {
    quote: ({raffleId,tickets}) => request({action:'quote',raffleId,tickets}),
    submit: ({quoteId,requestId,buyer,receipt}) => { const form=new FormData(); form.set('quoteId',quoteId); form.set('requestId',requestId); form.set('name',buyer.name); form.set('email',buyer.email); form.set('phone',buyer.phone); form.set('receipt',receipt); return request(form); }
  };
})();
