// =============================================================
// KONFIGURASI WEB ORDER / MATIKAN ANDON (Supabase + MQTT)
// Edit file ini sesuai project Anda.
// =============================================================

const ANDON_CONFIG = {

  // ----- Supabase (auth email+password & database orderan) -----
  supabaseUrl: 'https://ztskdjnaghcsnptwotwy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0c2tkam5hZ2hjc25wdHdvdHd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY0OTcsImV4cCI6MjEwMzUyMjQ5N30.qi2__Pk1yYrVYho6i6vr5eiwt5oXMsyJWKhF5wYZzKY',
  defaultRole: 'operator',   // role default untuk akun baru

  // ----- MQTT (WebSocket broker) -----
  mqttBrokerUrl: 'ws://192.168.210.242:9001/mqtt',
  mqttUsername: '',
  mqttPassword: '',

  // Akhiran topik perintah matikan andon (publish ke b_{no}_{dept} + cmdSuffix)
  cmdSuffix: '/cmd',

  // Jalur (line) yang dipantau. Topik status: b_{no}_{dept}
  lineCount: 9,
  departments: ['mtc', 'qc', 'mat'],
  lineLabels: { 7: 'LINE 7', 8: 'LINE 8', 9: 'LINE 9' },

  // Kirim nama user juga di payload MQTT (selain user_id)
  sendUserName: true,
};
