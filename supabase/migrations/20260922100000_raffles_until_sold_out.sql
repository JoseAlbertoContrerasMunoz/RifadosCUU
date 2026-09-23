-- Allows a published raffle to remain available until every ticket is sold.
alter table public.raffles
  add column if not exists ends_when_sold_out boolean not null default false;

alter table public.raffles
  alter column draw_at drop not null;

alter table public.raffles
  drop constraint if exists raffles_schedule_or_stock_check;

alter table public.raffles
  add constraint raffles_schedule_or_stock_check
  check (ends_when_sold_out or draw_at is not null);

create or replace function public.available_ticket_numbers(p_raffle_id uuid)
returns table(ticket_number integer)
language sql
security invoker
set search_path = public
as $$
  select t.ticket_number
  from public.tickets t
  join public.raffles r on r.id = t.raffle_id
  where t.raffle_id = p_raffle_id
    and t.status = 'available'
    and r.status = 'published'
    and (r.ends_when_sold_out or r.draw_at > now())
  order by t.ticket_number;
$$;

create or replace function public.create_checkout_quote(
  p_raffle_id uuid,
  p_ticket_numbers integer[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.raffles;
  q uuid := gen_random_uuid();
  n integer;
  expiry timestamptz := now() + interval '15 minutes';
begin
  select * into r
  from public.raffles
  where id = p_raffle_id
    and status = 'published'
    and (ends_when_sold_out or draw_at > now())
  for share;

  if not found then raise exception 'raffle unavailable'; end if;
  if cardinality(p_ticket_numbers) is null or cardinality(p_ticket_numbers) < 1 or cardinality(p_ticket_numbers) > 10 then
    raise exception 'invalid ticket count';
  end if;
  if (select count(distinct x) from unnest(p_ticket_numbers) x) <> cardinality(p_ticket_numbers) then raise exception 'duplicate tickets'; end if;

  foreach n in array p_ticket_numbers loop
    if not exists (select 1 from public.tickets where raffle_id = p_raffle_id and ticket_number = n and status = 'available') then
      raise exception 'ticket unavailable';
    end if;
  end loop;

  insert into public.checkout_quotes (id, raffle_id, ticket_numbers, total_cents, expires_at)
  values (q, p_raffle_id, p_ticket_numbers, r.price_cents * cardinality(p_ticket_numbers), expiry);
  return q;
end;
$$;
