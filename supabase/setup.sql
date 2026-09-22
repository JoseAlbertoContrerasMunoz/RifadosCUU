-- Ejecuta este archivo en Supabase: SQL Editor > New query.
-- Después crea tu primer usuario en Authentication > Users y registra su UUID abajo.
create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','manager')),
  created_at timestamptz not null default now()
);

create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  category text not null check (category in ('autos','motos','tecnologia','videojuegos','hogar','ymas')),
  description text not null check (char_length(description) between 10 and 800),
  price_cents integer not null check (price_cents >= 100),
  total_tickets integer not null check (total_tickets between 1 and 100000),
  draw_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','paused','closed')),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  ticket_number integer not null check (ticket_number > 0),
  status text not null default 'available' check (status in ('available','reserved','paid','cancelled')),
  created_at timestamptz not null default now(),
  unique (raffle_id, ticket_number)
);

create index if not exists raffles_public_index on public.raffles (status, draw_at);
create index if not exists tickets_raffle_status_index on public.tickets (raffle_id, status, ticket_number);

alter table public.staff enable row level security;
alter table public.raffles enable row level security;
alter table public.tickets enable row level security;

-- Permisos de API. RLS debajo decide qué filas puede ver o cambiar cada rol.
grant usage on schema public to anon, authenticated;
grant select on public.raffles, public.tickets to anon;
grant select on public.staff, public.raffles, public.tickets to authenticated;
grant insert, update, delete on public.raffles, public.tickets to authenticated;
grant usage, select on sequence public.tickets_id_seq to authenticated;

-- Cada organizador sólo puede ver su propia asignación; esto permite a RLS validar su rol.
create policy "Staff read own assignment" on public.staff for select to authenticated using ((select auth.uid()) = user_id);

create policy "Public read published raffles" on public.raffles for select to anon, authenticated using (status = 'published');
create policy "Organizers manage raffles" on public.raffles for all to authenticated using (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
) with check (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
);

create policy "Public read published raffle tickets" on public.tickets for select to anon, authenticated using (
  exists (select 1 from public.raffles where id = raffle_id and status = 'published')
);
create policy "Organizers manage tickets" on public.tickets for all to authenticated using (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
) with check (
  exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
);

-- Imagenes de premios (nunca comprobantes de pago): crea un bucket PUBLICO llamado raffle-images.
-- Desde Storage crea el bucket y activa "Public bucket". Despues ejecuta estas politicas.
create policy "Public read raffle images" on storage.objects for select to public using (bucket_id = 'raffle-images');
create policy "Organizers upload raffle images" on storage.objects for insert to authenticated with check (
  bucket_id = 'raffle-images' and exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
);
create policy "Organizers update raffle images" on storage.objects for update to authenticated using (
  bucket_id = 'raffle-images' and exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
) with check (
  bucket_id = 'raffle-images' and exists (select 1 from public.staff where user_id = (select auth.uid()) and role in ('admin','manager'))
);

-- 1) Crea un usuario en Authentication > Users.
-- 2) Sustituye el UUID y ejecuta una sola vez:
-- insert into public.staff (user_id, role) values ('PEGA-EL-UUID-AQUI', 'admin');
