# Andon Order — Web Statis (GitHub Pages + Supabase)

Web statis untuk **mengambil orderan** dan **mematikan andon via MQTT**.
Konsep: **andal andon menyala = ada orderan masuk**. Setelah login
(email + password via **Supabase Auth**), user melihat jalur mana yang
andon-nya aktif, lalu menekan tombol **MATIKAN ANDON**. Sistem
mem-publish perintah `off` ke broker MQTT beserta `user_id` siapa yang
mematikan, lalu mencatat orderan ke tabel Supabase.

## Arsitektur

```
Browser (GitHub Pages)
   ├─ Supabase Auth  -> login email+password
   ├─ Supabase DB    -> profiles + andon_orders (log order)
   └─ MQTT (WebSocket) -> subscribe status, publish perintah matikan
```

## File

| File | Isi |
|---|---|
| `index.html` | Struktur halaman (login + dashboard + log) |
| `style.css` | Tampilan |
| `config.js` | **Sesuaikan di sini** (Supabase, broker, jalur) |
| `app.js` | Auth Supabase, MQTT, render, matikan andon |
| `supabase-setup.sql` | SQL untuk membuat tabel di Supabase |
| `README.md` | Dokumentasi ini |

## Cara deploy ke GitHub Pages

1. Push isi folder ini ke repo GitHub (sudah dilakukan).
2. Di repo: **Settings → Pages → Source → Deploy from a branch →
   branch `main` folder `/docs`** → Save.
3. Situs live di `https://<user>.github.io/<repo>/`.

## Konfigurasi Supabase

1. Buat project di https://supabase.com (free tier).
2. Salin **Project URL** dan **anon public key** dari
   **Project Settings → API**, lalu isi ke `config.js`
   (`supabaseUrl`, `supabaseAnonKey`).
3. Buka **SQL Editor** dan jalankan isi `supabase-setup.sql`
   (membuat tabel `profiles` & `andon_orders` + policy RLS).
4. Aktifkan **Auth → Providers → Email** (default aktif).
5. (Opsional) Matikan konfirmasi email agar langsung login:
   **Auth → Providers → Email → "Confirm email" = off**.

## Konfigurasi MQTT — `config.js`

| Key | Keterangan |
|---|---|
| `mqttBrokerUrl` | URL WebSocket broker, contoh `ws://192.168.210.242:9001/mqtt`. Broker **harus** aktif websocket-nya. |
| `mqttUsername` / `mqttPassword` | Auth broker (kosongkan jika tanpa auth). |
| `cmdSuffix` | Akhiran topik perintah matikan, default `/cmd`. |
| `lineCount`, `departments` | Jalur yang dipantau. Topik status: `b_{no}_{dept}`. |
| `sendUserName` | Kirim `user_name` juga di payload (selain `user_id`). |

## Protokol MQTT

**Subscribe (status andon):** topik `b_{no}_{dept}` (contoh `b_7_mtc`).
Payload mengikuti sistem andon yang sudah ada:

- `open` → andon **aktif** (orderan masuk)
- `close` → andon **mati**
- atau boolean `true/false`, `1/0`, atau JSON `{"data_payload":"open"}`

**Publish (matikan andon):** topik `b_{no}_{dept} + cmdSuffix`
(contoh `b_7_mtc/cmd`) dengan payload JSON:

```json
{ "action": "off", "user_id": "<supabase-uid>", "user_email": "a@b.c", "user_name": "Budi" }
```

> **Firmware/hardware andon** harus mensubscribe topik `+/cmd` ini dan
> mematikan andon saat menerima `{"action":"off"}`, agar tombol di web
> benar-benar mematikan lampu/andal fisik.

## Keamanan

- Supabase menangani autentikasi (password tersimpan aman di server).
- RLS (Row Level Security) membuat user hanya bisa melihat/menambah
  data miliknya sendiri.
- Anon key aman dipakai di web statis; keamanan dipegang oleh RLS,
  bukan dengan menyembunyikan anon key.
