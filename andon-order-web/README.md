# Andon Order — Web Statis (GitHub Pages)

Web statis untuk **mengambil orderan** dan **mematikan andon via MQTT**.
Konsep: **andal andon menyala = ada orderan masuk**. Setiap user login
(pilih user + PIN), melihat jalur mana yang andon-nya aktif, lalu menekan
tombol **MATIKAN ANDON**. Sistem akan mem-publish perintah `off` ke broker
MQTT beserta `user_id` siapa yang mematikan.

Karena ini web **statis di GitHub Pages** (tanpa server), maka:

- Koneksi MQTT dilakukan **langsung dari browser** lewat **WebSocket broker**.
- Login adalah **identitas/record user** (bukan pengamanan server yang kuat).
  PIN tersimpan di file `config.js` dan terlihat publik di repo. Gunakan
  untuk kebutuhan internal/demo.

## File

| File | Isi |
|---|---|
| `index.html` | Struktur halaman (login + dashboard + log) |
| `style.css` | Tampilan |
| `config.js` | **Sesuaikan di sini** (broker, jalur, user) |
| `app.js` | Login, koneksi MQTT, render, matikan andon |
| `README.md` | Dokumentasi ini |

## Cara jalankan lokal (untuk tes cepat)

```bash
# dari folder andon-order-web, misal dengan python
python -m http.server 8080
```

Buka `http://localhost:8080`. (MQTT.js di-load dari CDN, perlu internet.)

## Cara deploy ke GitHub Pages

1. Buat repo di GitHub, push folder `andon-order-web/` ini.
2. Di repo: **Settings → Pages → Source → GitHub Actions / branch `main`**
   (atau pilih folder `/docs` / root).
3. Setelah publish, akses lewat `https://<user>.github.io/<repo>/`.

## Konfigurasi — `config.js`

| Key | Keterangan |
|---|---|
| `mqttBrokerUrl` | URL WebSocket broker, contoh `ws://192.168.210.242:9001/mqtt`. Broker **harus** diaktifkan websocket-nya. |
| `mqttUsername` / `mqttPassword` | Auth broker (kosongkan jika tanpa auth). |
| `cmdSuffix` | Akhiran topik perintah matikan, default `/cmd`. |
| `lineCount`, `departments` | Jalur yang dipantau. Topik status: `b_{no}_{dept}`. |
| `lineLabels` | Label tampilan per nomor jalur. |
| `users` | Daftar user `{ id, name, pin, role }`. |
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
{ "action": "off", "user_id": "U001", "user_name": "Budi" }
```

> **Firmware/hardware andon** harus mensubscribe topik `+/cmd` ini dan
> mematikan andon saat menerima `{"action":"off"}`, agar tombol di web
> benar-benar mematikan lampu/andal fisik.

## Topik status vs topik command

Web memisahkan topik status (`b_N_dept`) dan topik perintah
(`b_N_dept/cmd`) agar perintah yang di-publish web **tidak ikut terbaca
sebagai status** (menghindari echo/lup balik). Publish ke `/cmd` tidak
berubah status lokal sampai broker/firmware mem-publish balik `close` ke
topik status.
