alter table public.players
  add column if not exists avatar_type text not null default 'male',
  add column if not exists avatar_path text not null default '/avatars/male.png';

drop function if exists public.create_game_room(text, text, int, text[]);
create function public.create_game_room(
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
  if p_total_rounds not in (5, 10, 15, 20) then raise exception 'invalid_round_count'; end if;
  if cardinality(p_question_ids) <> p_total_rounds then raise exception 'invalid_questions'; end if;
  if p_avatar_type not in ('male', 'female') then raise exception 'invalid_avatar'; end if;
  if p_avatar_path not in ('/avatars/male.png', '/avatars/female.png') then raise exception 'invalid_avatar'; end if;
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
  insert into public.players(room_id, user_id, display_name, player_number, avatar_type, avatar_path)
  values(v_room.id, auth.uid(), trim(p_display_name), 1, p_avatar_type, p_avatar_path);
  return public.room_payload(v_room.id);
end;
$$;

drop function if exists public.join_game_room(text, text);
create function public.join_game_room(
  p_display_name text,
  p_code text,
  p_avatar_type text,
  p_avatar_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid_name'; end if;
  if p_avatar_type not in ('male', 'female') then raise exception 'invalid_avatar'; end if;
  if p_avatar_path not in ('/avatars/male.png', '/avatars/female.png') then raise exception 'invalid_avatar'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) for update;
  if v_room.id is null then raise exception 'room_not_found'; end if;
  if v_room.expires_at <= now() then raise exception 'room_expired'; end if;
  if v_room.status <> 'lobby' then raise exception 'already_started'; end if;
  if exists(select 1 from public.players where room_id=v_room.id and user_id=auth.uid()) then
    return public.room_payload(v_room.id);
  end if;
  if (select count(*) from public.players where room_id=v_room.id) >= 2 then raise exception 'room_full'; end if;
  insert into public.players(room_id,user_id,display_name,player_number,avatar_type,avatar_path)
  values(v_room.id,auth.uid(),trim(p_display_name),2,p_avatar_type,p_avatar_path);
  return public.room_payload(v_room.id);
exception when unique_violation then raise exception 'room_full';
end;
$$;

grant execute on function public.create_game_room(text,text,int,text[],text,text),
  public.join_game_room(text,text,text,text) to authenticated;
