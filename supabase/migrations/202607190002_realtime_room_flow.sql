-- Complete server-authoritative room flow for two-device play.

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.players
    where room_id = p_room and user_id = auth.uid()
  );
$$;

drop policy if exists room_member_read on public.rooms;
create policy room_member_read on public.rooms
for select using (public.is_room_member(id));

drop policy if exists player_member_read on public.players;
create policy player_member_read on public.players
for select using (public.is_room_member(room_id));

create or replace function public.room_payload(p_room uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'room', to_jsonb(r),
    'players', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.player_number)
      from public.players p where p.room_id = r.id
    ), '[]'::jsonb)
  )
  from public.rooms r where r.id = p_room;
$$;

create or replace function public.create_game_room(
  p_display_name text,
  p_category text,
  p_total_rounds int,
  p_question_ids text[]
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
  if p_total_rounds not in (5, 10, 15, 20) then raise exception 'invalid_round_count'; end if;
  if cardinality(p_question_ids) <> p_total_rounds then raise exception 'invalid_questions'; end if;

  loop
    v_attempt := v_attempt + 1;
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into public.rooms(code, host_user_id, category, total_rounds, question_ids)
      values(v_code, auth.uid(), p_category, p_total_rounds, p_question_ids)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise exception 'room_creation_failed'; end if;
    end;
  end loop;

  insert into public.players(room_id, user_id, display_name, player_number)
  values(v_room.id, auth.uid(), trim(p_display_name), 1);
  return public.room_payload(v_room.id);
end;
$$;

create or replace function public.join_game_room(p_display_name text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid_name'; end if;

  select * into v_room from public.rooms
  where code = upper(trim(p_code)) for update;
  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.expires_at <= now() then raise exception 'room_expired'; end if;
  if v_room.status <> 'lobby' then raise exception 'already_started'; end if;

  if exists(select 1 from public.players where room_id=v_room.id and user_id=auth.uid()) then
    return public.room_payload(v_room.id);
  end if;
  if (select count(*) from public.players where room_id=v_room.id) >= 2 then
    raise exception 'room_full';
  end if;

  insert into public.players(room_id, user_id, display_name, player_number)
  values(v_room.id, auth.uid(), trim(p_display_name), 2);
  return public.room_payload(v_room.id);
exception when unique_violation then
  raise exception 'room_full';
end;
$$;

create or replace function public.get_room_state(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not_a_member'; end if;
  return public.room_payload(p_room);
end;
$$;

create or replace function public.start_game(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id=p_room for update;
  if v_room.host_user_id <> auth.uid() then raise exception 'host_only'; end if;
  if v_room.status <> 'lobby' then return; end if;
  if (select count(*) from public.players where room_id=p_room) <> 2 then raise exception 'not_ready'; end if;
  update public.rooms set status='playing', updated_at=now() where id=p_room;
end;
$$;

create or replace function public.submit_round_answer(
  p_room uuid,
  p_round int,
  p_personal text,
  p_prediction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_room public.rooms;
  v_first public.round_submissions;
  v_second public.round_submissions;
begin
  if p_personal not in ('A','B') or p_prediction not in ('A','B') then raise exception 'invalid_choice'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if v_room.current_round <> p_round or v_room.status <> 'playing' then raise exception 'wrong_round'; end if;
  select id into v_player from public.players where room_id=p_room and user_id=auth.uid();
  if v_player is null then raise exception 'not_a_member'; end if;
  if exists(select 1 from public.round_submissions where room_id=p_room and round_index=p_round and player_id=v_player) then
    raise exception 'already_locked';
  end if;

  insert into public.round_submissions(room_id,round_index,player_id,personal_choice,partner_prediction)
  values(p_room,p_round,v_player,p_personal,p_prediction);

  if (select count(*) from public.round_submissions where room_id=p_room and round_index=p_round and locked)=2 then
    select s.* into v_first from public.round_submissions s join public.players p on p.id=s.player_id
      where s.room_id=p_room and s.round_index=p_round and p.player_number=1;
    select s.* into v_second from public.round_submissions s join public.players p on p.id=s.player_id
      where s.room_id=p_room and s.round_index=p_round and p.player_number=2;
    update public.players set score=score+1 where id=v_first.player_id and v_first.partner_prediction=v_second.personal_choice;
    update public.players set score=score+1 where id=v_second.player_id and v_second.partner_prediction=v_first.personal_choice;
    update public.rooms set submitted_count=2,status='reveal',updated_at=now() where id=p_room;
  else
    update public.rooms set submitted_count=1,updated_at=now() where id=p_room;
  end if;
end;
$$;

drop function if exists public.get_round_reveal(uuid, int);
create function public.get_round_reveal(p_room uuid,p_round int)
returns table(player_id uuid,player_number int,personal_choice text,partner_prediction text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not_a_member'; end if;
  if (select status from public.rooms where id=p_room) not in ('reveal','finished') then return; end if;
  if (select count(*) from public.round_submissions where room_id=p_room and round_index=p_round and locked)<>2 then return; end if;
  return query select p.id,p.player_number,s.personal_choice,s.partner_prediction
    from public.round_submissions s join public.players p on p.id=s.player_id
    where s.room_id=p_room and s.round_index=p_round order by p.player_number;
end;
$$;

create or replace function public.advance_game_round(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id=p_room for update;
  if v_room.host_user_id <> auth.uid() then raise exception 'host_only'; end if;
  if v_room.status = 'finished' then return; end if;
  if v_room.status <> 'reveal' or v_room.submitted_count <> 2 then raise exception 'not_ready'; end if;
  update public.rooms set
    current_round=case when current_round+1<total_rounds then current_round+1 else current_round end,
    submitted_count=0,
    status=case when current_round+1>=total_rounds then 'finished'::public.game_status else 'playing'::public.game_status end,
    updated_at=now()
  where id=p_room;
end;
$$;

revoke all on function public.room_payload(uuid) from public;
grant execute on function public.create_game_room(text,text,int,text[]), public.join_game_room(text,text),
  public.get_room_state(uuid), public.start_game(uuid), public.submit_round_answer(uuid,int,text,text),
  public.get_round_reveal(uuid,int), public.advance_game_round(uuid) to authenticated;
