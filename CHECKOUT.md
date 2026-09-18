# Conexión del flujo de pago

El sitio conserva la selección de números localmente. El checkout permite capturar datos y seleccionar un archivo, pero NO recibe pagos, reserva números ni almacena comprobantes todavía. No guarda datos personales ni archivos en localStorage.

Para habilitar el envío, proporcionar `window.rifadosPaymentService` con dos métodos asíncronos:

- `quote({raffleId, tickets})` devuelve `{id, totalCents, instructions}`. El servidor valida números y disponibilidad, calcula el precio real en centavos MXN y entrega instrucciones bancarias. El cliente no determina el importe.
- `submit({quoteId, requestId, buyer: {name, email, phone}, receipt})` recibe un File y devuelve `{orderId, status: 'pending_review'}` sólo tras persistir pedido y comprobante. `requestId` debe ser idempotente para evitar duplicados al reintentar.

El adaptador puede usar fetch con FormData para el comprobante. Los endpoints deben validar tipo real, tamaño (10 MB máximo), datos del comprador, vencimiento de cotización y disponibilidad. Guardar archivos en almacenamiento privado y permitir acceso sólo al administrador autorizado. Reservar números de forma atómica en el servidor, con vencimiento; nunca confiar en la lista local. No confirmar boletos sólo por recibir un archivo.

Pendiente de implementar en servidor: pedidos, reservas, almacenamiento privado, panel autenticado de revisión/aprobación/rechazo y confirmación al comprador. No colocar credenciales administrativas en el HTML o JavaScript público.

Datos necesarios para activar: precio por boleto, números reales, cuenta/CLABE y titular, condiciones de pago y servicio de backend elegido.
