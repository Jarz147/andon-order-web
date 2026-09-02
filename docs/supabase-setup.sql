-- =============================================================
-- SETUP SUPABASE untuk Andon Order  (versi re-runnable)
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Aman dijalankan berulang (drop policy bila sudah ada, create table if not exists)
-- =============================================================

-- 1) PROFILES: simpan nama & role tiap user (terhubung ke auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  role text default 'operator',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id);

-- 2) ANDON_ORDERS: log siapa yang mematikan andon / mengambil orderan
create table if not exists public.andon_orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  user_name text,
  line text,
  dept text,
  created_at timestamptz default now()
);

alter table public.andon_orders enable row level security;

drop policy if exists "orders insert own" on public.andon_orders;
create policy "orders insert own" on public.andon_orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "orders select own" on public.andon_orders;
create policy "orders select own" on public.andon_orders
  for select using (auth.uid() = user_id);

-- 3) ANDON_STATUS: status andon per jalur, dibaca browser via Realtime.
--    Ditulis oleh Edge Function andon-status (dipanggil Node-RED / LAN).
create table if not exists public.andon_status (
  key text primary key,                 -- '7:mtc'
  line text,                            -- 'LINE 7'
  dept text,                            -- 'mtc'
  is_on boolean default false,
  updated_at timestamptz default now()
);

alter table public.andon_status enable row level security;

drop policy if exists "status select auth" on public.andon_status;
create policy "status select auth" on public.andon_status
  for select using (auth.role() = 'authenticated');

-- Beri akses baca (realtime) untuk peran anon agar table editor mudah dilihat (opsional).
drop policy if exists "status select anon" on public.andon_status;
create policy "status select anon" on public.andon_status
  for select using (auth.role() = 'anon');

-- Agar Realtime meneruskan event UPDATE ke browser:
alter table public.andon_status replica identity full;
