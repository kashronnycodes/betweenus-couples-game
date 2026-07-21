-- Stable category ids and history-aware question selection support.

update public.rooms set category = case lower(trim(category))
  when 'mixed' then 'mixed'
  when 'cute and romantic' then 'cute-romantic'
  when 'cute-romantic' then 'cute-romantic'
  when 'funny and random' then 'funny-random'
  when 'funny-random' then 'funny-random'
  when 'dates and activities' then 'dates-activities'
  when 'dates-activities' then 'dates-activities'
  when 'food' then 'food'
  when 'future together' then 'future-together'
  when 'future-together' then 'future-together'
  when 'relationship preferences' then 'relationship-preferences'
  when 'relationship-preferences' then 'relationship-preferences'
  when 'deep questions' then 'deep'
  when 'deep' then 'deep'
  else 'mixed'
end;

alter table public.rooms drop constraint if exists rooms_category_check;
alter table public.rooms add constraint rooms_category_check check (category in (
  'mixed','cute-romantic','funny-random','dates-activities','food',
  'future-together','relationship-preferences','deep'
));

create table if not exists public.player_question_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question_id text not null check (char_length(trim(question_id)) > 0),
  times_seen int not null default 1 check (times_seen >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists player_question_history_user_last_seen_idx
  on public.player_question_history(user_id, last_seen_at);

alter table public.player_question_history enable row level security;
drop policy if exists question_history_own_read on public.player_question_history;
create policy question_history_own_read on public.player_question_history
  for select using (user_id = auth.uid());

create table if not exists public.completed_question_views (
  user_id uuid not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_index int not null check (round_index >= 0),
  question_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, room_id, round_index)
);

alter table public.completed_question_views enable row level security;
drop policy if exists completed_question_own_read on public.completed_question_views;
create policy completed_question_own_read on public.completed_question_views
  for select using (user_id = auth.uid());

create or replace function public.create_game_room(
  p_display_name text,
  p_category text,
  p_total_rounds int,
  p_question_ids text[],
  p_avatar_type text,
  p_avatar_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid_name'; end if;
  if p_category not in ('mixed','cute-romantic','funny-random','dates-activities','food','future-together','relationship-preferences','deep') then
    raise exception 'invalid_category';
  end if;
  if p_total_rounds not in (5, 10, 15, 20) then raise exception 'invalid_round_count'; end if;
  if p_avatar_type not in ('male', 'female') then raise exception 'invalid_avatar'; end if;
  if p_avatar_path not in ('/avatars/male.png', '/avatars/female.png') then raise exception 'invalid_avatar'; end if;
  loop
    v_attempt := v_attempt + 1;
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into public.rooms(code, host_user_id, category, total_rounds, question_ids)
      values(v_code, auth.uid(), p_category, p_total_rounds, '{}'::text[])
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise exception 'room_creation_failed'; end if;
    end;
  end loop;
  insert into public.players(room_id,user_id,display_name,player_number,avatar_type,avatar_path)
  values(v_room.id,auth.uid(),trim(p_display_name),1,p_avatar_type,p_avatar_path);
  return public.room_payload(v_room.id);
end;
$$;

drop function if exists public.start_game(uuid);
create function public.start_game(p_room uuid, p_question_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id=p_room for update;
  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> auth.uid() then raise exception 'host_only'; end if;
  if v_room.status <> 'lobby' then return; end if;
  if (select count(*) from public.players where room_id=p_room) <> 2 then raise exception 'not_ready'; end if;
  if cardinality(p_question_ids) <> v_room.total_rounds then raise exception 'invalid_questions'; end if;
  if exists(select 1 from unnest(p_question_ids) id group by id having count(*) > 1) then raise exception 'duplicate_questions'; end if;
  if exists(select 1 from unnest(p_question_ids) id where nullif(trim(id), '') is null) then raise exception 'invalid_questions'; end if;
  update public.rooms set question_ids=p_question_ids,status='playing',updated_at=now() where id=p_room;
end;
$$;

create or replace function public.get_room_question_history(p_room uuid)
returns table(question_id text, seen_by_players int, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not_a_member'; end if;
  return query
    select h.question_id, count(distinct h.user_id)::int, max(h.last_seen_at)
    from public.player_question_history h
    join public.players p on p.user_id=h.user_id and p.room_id=p_room
    group by h.question_id;
end;
$$;

create or replace function public.record_completed_question(p_room uuid, p_round int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_question_id text;
  v_inserted int;
begin
  select * into v_room from public.rooms where id=p_room;
  if v_room.id is null or not public.is_room_member(p_room) then raise exception 'not_a_member'; end if;
  if v_room.status not in ('reveal','finished') then raise exception 'not_completed'; end if;
  if p_round < 0 or p_round >= cardinality(v_room.question_ids) then raise exception 'invalid_round'; end if;
  v_question_id := v_room.question_ids[p_round + 1];
  if v_question_id is null then raise exception 'invalid_questions'; end if;
  insert into public.completed_question_views(user_id,room_id,round_index,question_id)
  values(auth.uid(),p_room,p_round,v_question_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    insert into public.player_question_history(user_id,question_id,times_seen,first_seen_at,last_seen_at)
    values(auth.uid(),v_question_id,1,now(),now())
    on conflict (user_id,question_id) do update
      set times_seen=public.player_question_history.times_seen+1,last_seen_at=now();
  end if;
  return v_inserted = 1;
end;
$$;

revoke all on public.player_question_history, public.completed_question_views from anon, authenticated;
grant select on public.player_question_history, public.completed_question_views to authenticated;
grant execute on function public.create_game_room(text,text,int,text[],text,text),
  public.start_game(uuid,text[]), public.get_room_question_history(uuid),
  public.record_completed_question(uuid,int) to authenticated;
