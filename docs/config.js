// =============================================================
// KONFIGURASI WEB ORDER / MATIKAN ANDON (Supabase + Relay Node-RED)
// Browser TIDAK terhubung broker langsung — semua via Supabase.
// =============================================================

const ANDON_CONFIG = {

  // ----- Supabase (auth + database + edge functions + realtime) -----
  supabaseUrl: 'https://ztskdjnaghcsnptwotwy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0c2tkam5hZ2hjc25wdHdvdHd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY0OTcsImV4cCI6MjEwMzUyMjQ5N30.qi2__Pk1yYrVYho6i6vr5eiwt5oXMsyJWKhF5wYZzKY',
  defaultRole: 'operator',

  // Nama edge function Supabase (jangan diubah kalau tidak di-deploy ulang)
  fnPublish: 'andon-publish',   // dipanggil browser saat "Matikan Andon"
  fnStatus:  'andon-status',    // dipanggil Node-RED untuk update status (relay)

  // Jalur (line) yang dipantau
  lineCount: 9,
  departments: ['mtc', 'qc', 'mat'],
  lineLabels: { 7: 'LINE 7', 8: 'LINE 8', 9: 'LINE 9' },
};
