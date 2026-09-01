-- =============================================================
-- SETUP SUPABASE untuk Andon Order
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =============================================================

-- 1) PROFILES: simpan nama & role tiap user (terhubung ke auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  role text default 'operator',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

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

create policy "orders insert own" on public.andon_orders
  for insert with check (auth.uid() = user_id);

create policy "orders select own" on public.andon_orders
  for select using (auth.uid() = user_id);
