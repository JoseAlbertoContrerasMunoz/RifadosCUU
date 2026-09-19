// UI independiente del proveedor de pagos y almacenamiento.
// Integrar window.rifadosPaymentService según CHECKOUT.md para habilitar envíos.
(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'checkout-dialog';
  dialog.setAttribute('aria-labelledby', 'checkoutTitle');
  dialog.innerHTML = `
    <div class="checkout-head">
      <div><small>RifadosCUU · Tu pedido</small><h2 id="checkoutTitle">Finalizar compra</h2></div>
      <button type="button" class="cart-close" aria-label="Cerrar pago" id="closeCheckout">✕</button>
    </div>
    <div class="checkout-layout">
      <form id="paymentForm">
        <div class="checkout-block"><h3>1. Tus datos</h3>
          <label>Nombre completo<input name="name" autocomplete="name" required maxlength="120"></label>
          <label>Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
          <label>Teléfono<input name="phone" type="tel" autocomplete="tel" required maxlength="25"></label>
        </div>
        <div class="checkout-block"><h3>2. Realiza tu pago</h3>
          <p id="paymentInstructions">Los datos bancarios y el importe estarán disponibles cuando se habilite el pago de esta rifa.</p>
        </div>
        <div class="checkout-block"><h3>3. Adjunta tu comprobante</h3>
          <div class="checkout-upload"><label>Comprobante de transferencia o depósito
            <input id="receiptFile" name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required>
          </label><p>JPG, PNG o PDF · máximo 10 MB</p></div>
          <p id="receiptStatus" class="checkout-status" role="status">El archivo se enviará al confirmar el pedido.</p>
        </div>
        <button class="btn btn-primary" type="submit" id="submitPayment" disabled>Enviar comprobante para revisión</button>
        <p class="checkout-status" id="paymentStatus" role="status">Recepción de pagos pendiente de habilitar.</p>
      </form>
      <aside class="checkout-block checkout-summary"><h3>Resumen de tu pedido</h3>
        <img src="assets/nintendo-switch-2-rifa.png" alt="Nintendo Switch 2">
        <strong id="checkoutRaffle"></strong><p id="checkoutQuantity"></p>
        <div class="checkout-tickets" id="checkoutTickets"></div>
        <div class="checkout-price"><span>Total</span><strong id="checkoutTotal">Por definir</strong></div>
        <p>El comprobante se revisará antes de confirmar tus boletos. Seleccionar números no los reserva.</p>
      </aside>
    </div>`;
  document.body.append(dialog);
  const get = id => dialog.querySelector('#' + id);
  let selection, quote, receipt, requestId;
  get('closeCheckout').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    document.body.classList.toggle('modal-open', !!document.querySelector('.raffle-modal.open, .cart-panel.open'));
  });
  const money = value => new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(value / 100);
  const configuredMethods = async () => {
    const config = window.RIFADOS_SUPABASE || {};
    if (!config.url || !config.publishableKey) return [];
    try {
      const response = await fetch(`${config.url}/rest/v1/payment_methods?select=name,instructions&is_active=eq.true&order=sort_order.asc,created_at.asc`, {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }
      });
      if (!response.ok) return [];
      const methods = await response.json();
      return Array.isArray(methods) ? methods : [];
    } catch { return []; }
  };
  window.openRaffleCheckout = async cart => {
    selection = cart; quote = null; receipt = null; requestId = null;
    get('paymentForm').reset();
    get('receiptFile').disabled = false;
    get('receiptFile').setCustomValidity('');
    get('paymentInstructions').textContent = 'Los datos bancarios y el importe estarán disponibles cuando se habilite el pago de esta rifa.';
    get('receiptStatus').textContent = 'El archivo se enviará al confirmar el pedido.';
    get('submitPayment').disabled = true;
    get('checkoutTotal').textContent = 'Por definir';
    get('paymentStatus').textContent = 'Recepción de pagos pendiente de habilitar.';
    get('checkoutRaffle').textContent = cart.title;
    get('checkoutQuantity').textContent = cart.tickets.length + ' boletos seleccionados';
    get('checkoutTickets').replaceChildren(...cart.tickets.map(number => {
      const chip = document.createElement('span'); chip.textContent = '#' + number; return chip;
    }));
    dialog.showModal(); document.body.classList.add('modal-open');
    const service = window.rifadosPaymentService;
    if (!service) {
      const methods = await configuredMethods();
      if (selection !== cart || !dialog.open) return;
      const testMethods = [
        { name:'Transferencia SPEI (prueba)', instructions:'PRUEBA: no deposites. Banco demo · CLABE 000 000 000000000000 · titular RifadosCUU Pruebas.' },
        { name:'Depósito OXXO (prueba)', instructions:'PRUEBA: no deposites. Solicita una referencia demo al organizador.' }
      ];
      const visibleMethods = methods.length ? methods : testMethods;
      get('paymentInstructions').textContent = visibleMethods.map(method => `${method.name}: ${method.instructions}`).join(' · ');
      get('paymentStatus').textContent = methods.length ? 'Métodos de pago actualizados por el organizador. La recepción automática aún está pendiente de habilitar.' : 'Estás viendo métodos de prueba; no realices ningún depósito.';
      return;
    }
    try {
      const response = await service.quote({raffleId:cart.raffleId,tickets:cart.tickets});
      if (selection !== cart || !dialog.open) return;
      if (!response.id || !Number.isSafeInteger(response.totalCents) || response.totalCents <= 0 || !response.instructions) throw new Error();
      quote = response;
      get('checkoutTotal').textContent = money(quote.totalCents);
      get('paymentInstructions').textContent = quote.instructions;
      get('paymentStatus').textContent = 'Adjunta el comprobante para enviar tu pedido a revisión.';
      get('submitPayment').disabled = !receipt;
    } catch { get('paymentStatus').textContent = 'No fue posible confirmar disponibilidad e importe. Cierra y vuelve a intentarlo.'; }
  };
  get('receiptFile').addEventListener('change', event => {
    receipt = null;
    const file = event.target.files[0];
    const valid = file && ['image/jpeg','image/png','application/pdf'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024;
    event.target.setCustomValidity(file && !valid ? 'Selecciona un JPG, PNG o PDF de hasta 10 MB.' : '');
    if (valid) receipt = file;
    get('receiptStatus').textContent = valid ? file.name + ' · listo para adjuntar; todavía no enviado.' : 'Selecciona un JPG, PNG o PDF de hasta 10 MB.';
    get('submitPayment').disabled = !quote || !receipt;
  });
  get('paymentForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!quote || !receipt || !window.rifadosPaymentService || get('submitPayment').disabled) return;
    const form = new FormData(event.target);
    requestId ||= crypto.randomUUID();
    get('submitPayment').disabled = true;
    get('paymentStatus').textContent = 'Enviando comprobante…';
    try {
      const result = await window.rifadosPaymentService.submit({quoteId:quote.id,requestId,buyer:{name:form.get('name'),email:form.get('email'),phone:form.get('phone')},receipt});
      if (!result.orderId || result.status !== 'pending_review') throw new Error();
      get('paymentStatus').textContent = 'Pedido ' + result.orderId + ' recibido. Tu comprobante está pendiente de revisión.';
      get('receiptFile').disabled = true;
    } catch {
      get('paymentStatus').textContent = 'No pudimos confirmar la recepción. Intenta de nuevo; conservaremos la referencia para evitar duplicados.';
      get('submitPayment').disabled = false;
    }
  });
})();
