# Andon Order — Web (GitHub Pages + Supabase + Relay Node-RED)

Web untuk **mengambil orderan** dan **mematikan andon**. Konsep:
**andal andon menyala = ada orderan masuk**. Setelah login (email + password
via **Supabase Auth**), user melihat jalur mana yang aktif, lalu menekan
tombol **MATIKAN ANDON**. `user_id` pengirim dikirim lewat MQTT sebagai
jejak audit, dan orderan dicatat ke Supabase.

## Kenapa bukan MQTT langsung dari browser?

Halaman GitHub Pages diakses via **https** dan berada di internet, sedangkan
broker ada di **LAN lokal** (`192.168.137.188`). Browser tidak bisa menyambung
ke IP privat / `ws://`. Solusi mengikuti pola yang sudah dipakai di web lain
(scissor-lift): **relay melalui Edge Function + tunnel + Node-RED**.

## Arsitektur

```
BROWSER (GitHub Pages)
  │ login → Supabase Auth
  │ baca status → Supabase Realtime (tabel andon_status)
  ▼
  klik "Matikan Andon"
     → Edge Function andon-publish   (cloud)
        ├─ catat ke tabel andon_orders
        └─ HTTP → tunnel (localtunnel) → Node-RED /andon/cmd
                 → MQTT publish b_{no}_{dept}/cmd  (user_id) → EMQX → firmware

LAN
  Node-RED subscribe b_#  →  Edge Function andon-status (cloud)
        └─ upsert tabel andon_status  → Realtime → browser
```

## Komponen yang harus disiapkan

### 1. Supabase (cloud)
- Buat project, isi `supabaseUrl` / `supabaseAnonKey` di `config.js`.
- Jalankan `supabase-setup.sql` di **SQL Editor** (tabel `profiles`,
  `andon_orders`, `andon_status` + RLS).
- Matikan "Confirm email" di **Authentication → Providers → Email**.
- Deploy **2 Edge Functions**:
  - `andon-publish` (folder `supabase/functions/andon-publish`)
  - `andon-status` (folder `supabase/functions/andon-status`)
  - Cara: `npx supabase login`, `npx supabase link --project-ref <ref>`,
    `npx supabase functions deploy andon-publish`,
    `npx supabase functions deploy andon-status`.
- Set **secrets** di Edge Functions (**Project Settings → Edge Functions →
  Secrets** atau lewat `npx supabase secrets set`):
  - `NODERED_URL`   = URL tunnel, contoh `https://quiet-dodos-argue.loca.lt`
  - `NODERED_TOKEN` = token bersama, contoh `SDI_RELAY_TOKEN`

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` otomatis
> tersedia di Edge Function tanpa diset manual.

### 2. Tunnel (LAN → publik) — untuk perintah ke broker
Jalankan di mesin LAN yang ada Node-RED:
```
npx -y localtunnel --port 1881 --local-host 192.168.137.188
```
Catat URL publiknya (mis. `https://quiet-dodos-argue.loca.lt`) → isi ke
secret `NODERED_URL`.

### 3. Node-RED (LAN)
- Import `nodered-andon-flow.json` (Menu → Import).
- Ubah nilai `TOKEN` di node function `fn-cmd` & `fn-status` menjadi token
  bersama (sama dengan `NODERED_TOKEN` di Supabase).
- Pastikan node MQTT broker tersambung ke EMQX (`192.168.137.188:1883`).
- Deploy.

### 4. EMQX (broker)
Tidak perlu diubah — tetap menerima MQTT dari Node-RED & firmware.

## Protokol MQTT

**Status andon** (firmware → broker): topik `b_{no}_{dept}` (mis. `b_7_mtc`),
payload `open` (aktif) / `close` (mati).

**Perintah matikan** (Node-RED → broker): topik `b_{no}_{dept}/cmd`, payload:
```json
{ "action": "off", "user_id": "<supabase-uid>", "user_email": "a@b.c", "user_name": "Budi", "line": "LINE 7", "dept": "mtc" }
```

> Firmware harus subscribe `+/cmd` dan mematikan andon saat menerima
> `{"action":"off"}`.

## Sekuritas
- Auth ditangani Supabase; RLS membatasi akses data per user.
- Token `NODERED_TOKEN` dipakai bersama antara Supabase & Node-RED untuk
  memvalidasi relay.
- Anon key aman di web statis; keamanan dipegang RLS.
