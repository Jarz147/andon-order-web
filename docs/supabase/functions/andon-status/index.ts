// andon-status: dipanggil Node-RED (dari LAN) saat status andon berubah.
// Memvalidasi token bersama, lalu upsert status ke tabel andon_status
// memakai service role key (bypass RLS, aman karena token divalidasi).

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // validasi token bersama (sama seperti yang dipakai relay cmd)
  const token = req.headers.get("x-nodered-token");
  if (token !== Deno.env.get("NODERED_TOKEN")) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { key?: string; line?: string; dept?: string; is_on?: boolean };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  if (!body.key || !body.line || !body.dept || typeof body.is_on !== "boolean") {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.from("andon_status").upsert({
    key: body.key,
    line: body.line,
    dept: body.dept,
    is_on: body.is_on,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
