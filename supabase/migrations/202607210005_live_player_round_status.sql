-- Server-confirmed, realtime per-player progress for the current round.
alter table public.players
  add column if not exists round_status text not null default 'thinking';

alter table public.players drop constraint if exists players_round_status_check;
alter table public.players add constraint players_round_status_check
  check (round_status in ('thinking', 'submitted'));

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
  update public.players set round_status='submitted' where id=v_player;

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
  if v_room.current_round+1 < v_room.total_rounds then
    update public.players set round_status='thinking' where room_id=p_room;
  end if;
end;
$$;

grant execute on function public.submit_round_answer(uuid,int,text,text),
  public.advance_game_round(uuid) to authenticated;
