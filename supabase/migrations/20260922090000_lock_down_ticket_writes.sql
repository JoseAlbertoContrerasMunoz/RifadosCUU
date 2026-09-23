-- Security hardening: ticket availability and ownership are server-controlled.
-- Apply after the existing checkout migrations.

alter table public.raffles enable row level security;
alter table public.tickets enable row level security;
alter table public.payment_methods enable row level security;

-- Browsers never write tickets directly, including authenticated organizer sessions.
revoke all on table public.tickets from anon, authenticated;
revoke all on sequence public.tickets_id_seq from anon, authenticated;
grant select on table public.tickets to authenticated;

drop policy if exists "admins manage tickets" on public.tickets;
drop policy if exists "Organizers manage tickets" on public.tickets;
drop policy if exists "Public read published raffle tickets" on public.tickets;
drop policy if exists "admins view tickets" on public.tickets;
create policy "admins view tickets"
  on public.tickets for select to authenticated
  using ((select public.is_admin()));

-- Bank instructions are delivered only through the secure checkout quote.
revoke all on table public.payment_methods from anon;
grant select, insert, update, delete on table public.payment_methods to authenticated;
drop policy if exists "public sees active payment instructions" on public.payment_methods;
drop policy if exists "Public read active payment methods" on public.payment_methods;
drop policy if exists "admins manage payment methods" on public.payment_methods;
drop policy if exists "Organizers manage payment methods" on public.payment_methods;
create policy "admins manage payment methods"
  on public.payment_methods for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- A raffle's ticket count is permanent once tickets have been generated.
create or replace function public.prevent_ticket_count_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.total_tickets is distinct from old.total_tickets then
    raise exception 'total_tickets cannot be changed after raffle creation';
  end if;
  return new;
end;
$$;

drop trigger if exists raffles_ticket_count_immutable on public.raffles;
create trigger raffles_ticket_count_immutable
  before update on public.raffles
  for each row execute function public.prevent_ticket_count_change();

-- This is the only browser-accessible way an organizer can create tickets.
create or replace function public.create_raffle_with_tickets(
  p_title text,
  p_category text,
  p_description text,
  p_price_cents integer,
  p_total_tickets integer,
  p_draw_at timestamptz,
  p_status text,
  p_image_path text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  raffle_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_total_tickets is null or p_total_tickets not between 1 and 100000 then
    raise exception 'invalid ticket count';
  end if;

  insert into public.raffles (title, category, description, price_cents, total_tickets, draw_at, status, image_path)
  values (trim(p_title), p_category, trim(p_description), p_price_cents, p_total_tickets, p_draw_at, p_status, nullif(trim(p_image_path), ''))
  returning id into raffle_id;

  insert into public.tickets (raffle_id, ticket_number, status)
  select raffle_id, ticket_number, 'available'
  from generate_series(1, p_total_tickets) as ticket_number;

  return raffle_id;
end;
$$;

revoke all on function public.create_raffle_with_tickets(text,text,text,integer,integer,timestamptz,text,text) from public;
grant execute on function public.create_raffle_with_tickets(text,text,text,integer,integer,timestamptz,text,text) to authenticated;

-- Defensive default: every future exposed table needs explicit grants and RLS.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
