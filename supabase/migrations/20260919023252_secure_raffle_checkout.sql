-- RifadosCUU: schema, least-privilege RLS, and atomic ticket reservations.
create extension if not exists pgcrypto;

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.raffles (
 id uuid primary key default gen_random_uuid(), title text not null check (char_length(title) between 1 and 120), category text not null check (category in ('autos','motos','tecnologia','videojuegos','hogar','ymas')), description text not null check (char_length(description) between 1 and 800), price_cents integer not null check (price_cents >= 100), total_tickets integer not null check (total_tickets between 1 and 100000), draw_at timestamptz not null, status text not null default 'draft' check (status in ('draft','published','paused','closed')), image_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tickets (
 id bigint generated always as identity primary key, raffle_id uuid not null references public.raffles(id) on delete cascade, ticket_number integer not null check (ticket_number > 0), status text not null default 'available' check (status in ('available','reserved','paid')), reservation_id uuid, reservation_expires_at timestamptz, order_id uuid, unique (raffle_id,ticket_number)
);
create table if not exists public.payment_methods (id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 80), kind text not null check (kind in ('transfer','cash','card','wallet','other')), instructions text not null check (char_length(instructions) between 1 and 1500), is_active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.checkout_quotes (id uuid primary key default gen_random_uuid(), raffle_id uuid not null references public.raffles(id), ticket_numbers integer[] not null check (cardinality(ticket_numbers) between 1 and 10), total_cents integer not null check (total_cents > 0), expires_at timestamptz not null, submitted_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.orders (id uuid primary key default gen_random_uuid(), quote_id uuid not null unique references public.checkout_quotes(id), raffle_id uuid not null references public.raffles(id), request_id uuid not null unique, buyer_name text not null, buyer_email text not null, buyer_phone text not null, total_cents integer not null, receipt_path text not null, status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','cancelled')), review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now());
-- The first site version already created tickets. Extend it without replacing any data.
alter table public.tickets add column if not exists reservation_id uuid;
alter table public.tickets add column if not exists reservation_expires_at timestamptz;
alter table public.tickets add column if not exists order_id uuid;
do $$ begin
 if not exists (select 1 from pg_constraint where conname='tickets_order_id_fkey' and conrelid='public.tickets'::regclass) then
   alter table public.tickets add constraint tickets_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
 end if;
end $$;
create index if not exists tickets_raffle_status_idx on public.tickets(raffle_id,status,ticket_number);
create index if not exists orders_status_idx on public.orders(status,created_at desc);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists (select 1 from public.admins where user_id=(select auth.uid())) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security; alter table public.raffles enable row level security; alter table public.tickets enable row level security; alter table public.payment_methods enable row level security; alter table public.checkout_quotes enable row level security; alter table public.orders enable row level security;
revoke all on all tables in schema public from anon,authenticated;
grant select on public.raffles,public.payment_methods to anon;
grant select,insert,update,delete on public.admins,public.raffles,public.tickets,public.payment_methods,public.orders to authenticated;
-- Remove legacy policies on these Rifados tables so old permissive rules cannot survive alongside RLS.
do $$ declare p record; begin
 for p in select polname, polrelid::regclass as table_name from pg_policy where polrelid in ('public.admins'::regclass,'public.raffles'::regclass,'public.tickets'::regclass,'public.payment_methods'::regclass,'public.checkout_quotes'::regclass,'public.orders'::regclass) loop
   execute format('drop policy %I on %s',p.polname,p.table_name);
 end loop;
end $$;
create policy "public sees published raffles" on public.raffles for select to anon using (status='published');
create policy "admins manage raffles" on public.raffles for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "public sees active payment instructions" on public.payment_methods for select to anon using (is_active);
create policy "admins manage payment methods" on public.payment_methods for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage admins" on public.admins for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage tickets" on public.tickets for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins see orders" on public.orders for select to authenticated using ((select public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('raffle-images','raffle-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('payment-receipts','payment-receipts',false,10485760,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
do $$ declare p record; begin for p in select polname from pg_policy where polrelid='storage.objects'::regclass and polname in ('admins manage raffle images','admins read payment receipts') loop execute format('drop policy %I on storage.objects',p.polname); end loop; end $$;
create policy "admins manage raffle images" on storage.objects for all to authenticated using (bucket_id='raffle-images' and (select public.is_admin())) with check (bucket_id='raffle-images' and (select public.is_admin()));
create policy "admins read payment receipts" on storage.objects for select to authenticated using (bucket_id='payment-receipts' and (select public.is_admin()));

create or replace function public.create_checkout_quote(p_raffle_id uuid,p_ticket_numbers integer[])
returns table(id uuid,total_cents integer,expires_at timestamptz,instructions text) language plpgsql security definer set search_path=public as $$
declare r public.raffles; q uuid:=gen_random_uuid(); n integer; expiry timestamptz:=now()+interval '15 minutes';
begin
 if cardinality(p_ticket_numbers) not between 1 and 10 or cardinality(p_ticket_numbers)<>cardinality(array(select distinct unnest(p_ticket_numbers))) then raise exception 'invalid ticket selection'; end if;
 update public.tickets set status='available',reservation_id=null,reservation_expires_at=null where status='reserved' and reservation_expires_at<now();
 select * into r from public.raffles where id=p_raffle_id and status='published' and draw_at>now() for share; if not found then raise exception 'raffle unavailable'; end if;
 select count(*) into n from (select ticket_number from public.tickets where raffle_id=p_raffle_id and ticket_number=any(p_ticket_numbers) and status='available' for update) as locked; if n<>cardinality(p_ticket_numbers) then raise exception 'tickets unavailable'; end if;
 insert into public.checkout_quotes(id,raffle_id,ticket_numbers,total_cents,expires_at) values(q,p_raffle_id,p_ticket_numbers,r.price_cents*cardinality(p_ticket_numbers),expiry);
 update public.tickets set status='reserved',reservation_id=q,reservation_expires_at=expiry where raffle_id=p_raffle_id and ticket_number=any(p_ticket_numbers);
 return query select q,r.price_cents*cardinality(p_ticket_numbers),expiry,coalesce((select string_agg(name||': '||instructions,E'\n') from public.payment_methods where is_active),'Comunícate con el organizador para recibir instrucciones de pago.');
end $$;
create or replace function public.submit_checkout_order(p_quote_id uuid,p_request_id uuid,p_name text,p_email text,p_phone text,p_receipt_path text)
returns table(order_id uuid,status text) language plpgsql security definer set search_path=public as $$
declare q public.checkout_quotes; o uuid; s text;
begin
 select id,status into o,s from public.orders where request_id=p_request_id; if found then return query select o,s; return; end if;
 if char_length(trim(p_name)) not between 2 and 120 or char_length(trim(p_email)) not between 5 and 254 or char_length(trim(p_phone)) not between 7 and 25 or p_receipt_path !~ '^orders/[0-9a-f-]+/' then raise exception 'invalid order details'; end if;
 select * into q from public.checkout_quotes where id=p_quote_id for update; if not found or q.expires_at<now() or q.submitted_at is not null then raise exception 'quote expired'; end if;
 insert into public.orders(quote_id,raffle_id,request_id,buyer_name,buyer_email,buyer_phone,total_cents,receipt_path) values(q.id,q.raffle_id,p_request_id,trim(p_name),lower(trim(p_email)),trim(p_phone),q.total_cents,p_receipt_path) returning id into o;
 update public.checkout_quotes set submitted_at=now() where id=q.id; update public.tickets set order_id=o,reservation_expires_at=null where reservation_id=q.id;
 return query select o,'pending_review'::text;
end $$;
revoke all on function public.create_checkout_quote(uuid,integer[]) from public; revoke all on function public.submit_checkout_order(uuid,uuid,text,text,text,text) from public;
grant execute on function public.create_checkout_quote(uuid,integer[]) to service_role; grant execute on function public.submit_checkout_order(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.available_ticket_numbers(p_raffle_id uuid) returns table(ticket_number integer) language sql stable security definer set search_path=public as $$
 select t.ticket_number from public.tickets t join public.raffles r on r.id=t.raffle_id where t.raffle_id=p_raffle_id and t.status='available' and r.status='published' and r.draw_at>now() order by t.ticket_number
$$;
revoke all on function public.available_ticket_numbers(uuid) from public; grant execute on function public.available_ticket_numbers(uuid) to anon;

create or replace function public.review_order(p_order_id uuid,p_status text,p_note text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'not authorized'; end if; if p_status not in ('approved','rejected') then raise exception 'invalid status'; end if;
 update public.orders set status=p_status,review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p_order_id and status='pending_review'; if not found then raise exception 'order is not awaiting review'; end if;
 if p_status='approved' then update public.tickets set status='paid' where order_id=p_order_id; else update public.tickets set status='available',order_id=null,reservation_id=null,reservation_expires_at=null where order_id=p_order_id; end if;
end $$;
revoke all on function public.review_order(uuid,text,text) from public; grant execute on function public.review_order(uuid,text,text) to authenticated;
