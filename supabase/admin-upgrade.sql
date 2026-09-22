-- Ejecuta este bloque UNA sola vez en Supabase > SQL Editor.
-- Añade métodos de pago configurables para el panel administrativo.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('transfer','cash','card','wallet','other')),
  instructions text not null check (char_length(instructions) between 3 and 1500),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_methods_active_order_index on public.payment_methods (is_active, sort_order);
alter table public.payment_methods enable row level security;

grant select on public.payment_methods to anon, authenticated;
grant insert, update, delete on public.payment_methods to authenticated;

create policy "Public read active payment methods" on public.payment_methods for select to anon, authenticated using (is_active = true);
create policy "Organizers manage payment methods" on public.payment_methods for all to authenticated using (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
) with check (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
);
