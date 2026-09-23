# Publicación segura de RifadosCUU

Antes de publicar, aplica las migraciones de `supabase/migrations/` en orden en el SQL Editor de Supabase. La migración `20260922090000_lock_down_ticket_writes.sql` impide que el navegador modifique, cree o pague boletos directamente; la siguiente agrega el método SPEI y sólo entrega sus datos dentro del checkout seguro.

En Supabase configura:

1. En **Authentication > Providers**, desactiva el registro público. Sólo crea manualmente la cuenta de organización.
2. Activa la confirmación de correo para esa cuenta y usa una contraseña única y larga. Activa MFA para la cuenta organizadora cuando esté disponible.
3. En **Edge Functions > Secrets**, define `ALLOWED_ORIGINS` exactamente como `https://rifadoscuu.com,https://www.rifadoscuu.com`.
4. Despliega de nuevo la función `checkout` después de aplicar las migraciones.
5. Crea los buckets `raffle-images` (público) y `payment-receipts` (privado). No hagas público `payment-receipts`.
6. Crea una sola cuenta organizadora en Auth e inserta su UUID en `public.admins`. No compartas esa cuenta ni copies una clave `service_role` al sitio.

Prueba obligatoria antes de anunciar:

- Un visitante puede ver una rifa publicada, pero no insertar, actualizar ni borrar rifas, boletos, pedidos o métodos de pago.
- Un boleto elegido se reserva sólo al pedir cotización y el importe lo calcula el servidor.
- Un comprobante queda privado; sólo la cuenta organizadora puede revisarlo.
- Desde otro dominio, el checkout responde `origin_not_allowed`.
