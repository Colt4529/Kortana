-- Run this SQL in the Supabase dashboard SQL editor to create the game_logs table.

create table if not exists public.game_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  game_id int,
  title text not null,
  cover text,
  developer text,
  publisher text,
  year int,
  status text,
  rating int,
  review text,
  created_at timestamptz default now()
);
