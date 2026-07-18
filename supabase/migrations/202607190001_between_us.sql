create extension if not exists pgcrypto;

create type public.game_status as enum('lobby', 'playing', 'reveal', 'finished');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_user_id uuid not null,
  status game_status not null default 'lobby',
  category text not null,
  total_rounds int not null check (total_rounds in (5, 10, 15, 20)),
  current_round int not null default 0,
  question_ids text[] not null,
  submitted_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  player_number int not null check (player_number in (1, 2)),
  score int not null default 0,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, player_number)
);

create table public.round_submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms on delete cascade,
  round_index int not null,
  player_id uuid references public.players on delete cascade,
  personal_choice text not null check (personal_choice in ('A', 'B')),
  partner_prediction text not null check (partner_prediction in ('A', 'B')),
  locked boolean not null default true,
  submitted_at timestamptz not null default now(),
  unique (room_id, round_index, player_id)
);

alter table public.rooms enable row level security;

alter table public.players enable row level security;

alter table public.round_submissions enable row level security;

create policy room_member_read on public.rooms for
select
  using (
    exists (
      select
        1
      from
        public.players p
      where
        p.room_id = id
        and p.user_id = auth.uid ()
    )
  );

create policy player_member_read on public.players for
select
  using (
    exists (
      select
        1
      from
        public.players me
      where
        me.room_id = players.room_id
        and me.user_id = auth.uid ()
    )
  );

create or replace function public.submit_round_answer (
  p_room uuid,
  p_round int,
  p_personal text,
  p_prediction text
) returns void language plpgsql security definer
set
  search_path = public as $$declare v_player uuid;v_room rooms;begin if p_personal not in('A','B') or p_prediction not in('A','B') then raise exception 'invalid choice';end if;select * into v_room from rooms where id=p_room for update;if v_room.current_round<>p_round or v_room.status<>'playing' then raise exception 'wrong round';end if;select id into v_player from players where room_id=p_room and user_id=auth.uid();if v_player is null then raise exception 'not a member';end if;if exists(select 1 from round_submissions where room_id=p_room and round_index=p_round and player_id=v_player and locked) then raise exception 'already locked';end if;insert into round_submissions(room_id,round_index,player_id,personal_choice,partner_prediction)values(p_room,p_round,v_player,p_personal,p_prediction);update rooms set submitted_count=submitted_count+1,status=case when submitted_count+1=2 then 'reveal'::game_status else status end,updated_at=now() where id=p_room;end$$;

create or replace function public.get_round_reveal (p_room uuid, p_round int) returns table (
  player_number int,
  personal_choice text,
  partner_prediction text
) language plpgsql security definer
set
  search_path = public as $$begin if not exists(select 1 from players where room_id=p_room and user_id=auth.uid()) then raise exception 'not a member';end if;if(select count(*) from round_submissions where room_id=p_room and round_index=p_round and locked)<>2 then return;end if;return query select p.player_number,s.personal_choice,s.partner_prediction from round_submissions s join players p on p.id=s.player_id where s.room_id=p_room and s.round_index=p_round;end$$;

create or replace function public.advance_game_round (p_room uuid) returns void language plpgsql security definer
set
  search_path = public as $$declare r rooms;begin select * into r from rooms where id=p_room for update;if r.host_user_id<>auth.uid() then raise exception 'host only';end if;if r.status<>'reveal' or r.submitted_count<>2 then raise exception 'not ready';end if;update rooms set current_round=case when current_round+1<total_rounds then current_round+1 else current_round end,submitted_count=0,status=case when current_round+1>=total_rounds then 'finished'::game_status else 'playing'::game_status end,updated_at=now() where id=p_room;end$$;

revoke all on public.round_submissions
from
  anon,
  authenticated;

grant
execute on function public.submit_round_answer (uuid, int, text, text),
public.get_round_reveal (uuid, int),
public.advance_game_round (uuid) to authenticated;

alter publication supabase_realtime
add table public.rooms,
public.players;
