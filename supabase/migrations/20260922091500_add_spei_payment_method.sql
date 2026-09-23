-- Payment instructions are stored in Supabase, not in public HTML.
insert into public.payment_methods (name, kind, instructions, is_active, sort_order)
select
  'Transferencia SPEI',
  'transfer',
  E'Institución: Mercado Pago W\nBeneficiario: Jose Alberto Contreras Muñoz\nCLABE: 722969010938078555\nConcepto: escribe tu nombre y los números elegidos.\nDespués adjunta aquí tu comprobante para revisión.',
  true,
  1
where not exists (
  select 1 from public.payment_methods where name = 'Transferencia SPEI'
);
