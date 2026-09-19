-- Public evidence videos are allowed only once the raffle is closed.
alter table public.raffles add column if not exists draw_video_path text;
alter table public.raffles add column if not exists delivery_video_path text;

create or replace function public.raffles_require_closed_for_videos()
returns trigger language plpgsql set search_path=public as $$
begin
  if (new.draw_video_path is not null or new.delivery_video_path is not null) and new.status <> 'closed' then
    raise exception 'videos can only be attached to closed raffles';
  end if;
  return new;
end $$;
drop trigger if exists raffles_require_closed_for_videos on public.raffles;
create trigger raffles_require_closed_for_videos before insert or update on public.raffles for each row execute function public.raffles_require_closed_for_videos();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('raffle-videos','raffle-videos',true,524288000,array['video/mp4','video/webm','video/quicktime']) on conflict(id) do nothing;
drop policy if exists "admins manage raffle videos" on storage.objects;
create policy "admins manage raffle videos" on storage.objects for all to authenticated using (bucket_id='raffle-videos' and (select public.is_admin())) with check (bucket_id='raffle-videos' and (select public.is_admin()));

-- Clearly marked fixtures for validating the participant payment UI. They can be hidden in admin.html.
insert into public.payment_methods(name,kind,instructions,is_active,sort_order)
select 'Transferencia SPEI (prueba)','transfer','PRUEBA: no deposites. Banco demo · CLABE 000 000 000000000000 · titular RifadosCUU Pruebas.',true,10
where not exists (select 1 from public.payment_methods where name='Transferencia SPEI (prueba)');
insert into public.payment_methods(name,kind,instructions,is_active,sort_order)
select 'Depósito OXXO (prueba)','cash','PRUEBA: no deposites. Solicita una referencia demo al organizador.',true,20
where not exists (select 1 from public.payment_methods where name='Depósito OXXO (prueba)');
