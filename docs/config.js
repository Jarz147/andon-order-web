// =============================================================
// KONFIGURASI WEB ORDER / MATIKAN ANDON
// Edit file ini sesuai broker, jalur, dan user Anda.
// =============================================================

const ANDON_CONFIG = {

  // URL broker MQTT mode WebSocket.
  // Broker harus diaktifkan untuk websocket (mosquitto: listener 9001 protocol websockets)
  // Contoh: ws://192.168.210.242:9001/mqtt  atau  wss://broker.example.com:9001/mqtt
  mqttBrokerUrl: 'ws://192.168.210.242:9001/mqtt',
  mqttUsername: '',          // kosongkan jika tanpa auth
  mqttPassword: '',

  // Suffix topik untuk perintah matikan andon.
  // Web mem-publish ke: b_{no}_{dept} + cmdSuffix  (contoh: b_7_mtc/cmd)
  cmdSuffix: '/cmd',

  // Jumlah jalur (line) per departemen yang dipantau.
  // Topik status yang disubscribe: b_{no}_{dept}  (contoh: b_7_mtc)
  lineCount: 9,
  departments: ['mtc', 'qc', 'mat'],
  lineLabels: { 7: 'LINE 7', 8: 'LINE 8', 9: 'LINE 9' }, // label khusus, boleh dikosongkan

  // ===========================================================
  // DAFTAR USER (login identitas).
  // PENTING: ini web statis di GitHub Pages, jadi login hanya
  // sebagai identitas/record user, BUKAN pengamanan yang aman.
  // ===========================================================
  users: [
    { id: 'U001', name: 'Budi',  pin: '1234', role: 'mtc' },
    { id: 'U002', name: 'Siti',  pin: '1234', role: 'qc'  },
    { id: 'U003', name: 'Andi',  pin: '1234', role: 'mat' },
  ],

  // Kirim juga nama user di payload MQTT (selain user_id)
  sendUserName: true,
};
