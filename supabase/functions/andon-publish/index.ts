// andon-publish: dipanggil browser (user terautentikasi) saat "Matikan Andon".
// 1) catat orderan ke andon_orders
// 2) relay perintah OFF ke Node-RED (via tunnel) -> MQTT publish user_id

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    },
  );

  // Pastikan caller sudah login
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { no?: number; dept?: string };
  try { body = await req.json(); } catch {
    return json({ error: "bad json" }, 400);
  }

  const no = Number(body.no);
  const dept = String(body.dept || "").toLowerCase();
  if (!no || !["mtc", "qc", "mat"].includes(dept)) {
    return json({ error: "invalid line/dept" }, 400);
  }

  // nama user dari tabel profiles
  const { data: profile } = await supabase
    .from("profiles").select("name, role").eq("id", user.id).maybeSingle();
  const userName = profile?.name ?? (user.email || "").split("@")[0];

  // 1) catat orderan
  await supabase.from("andon_orders").insert({
    user_id: user.id,
    user_email: user.email,
    user_name: userName,
    line: `LINE ${no}`,
    dept: dept.toUpperCase(),
  });

  // 2) relay ke Node-RED -> MQTT
  const topic = `b_${no}_${dept}/cmd`;
  const payload = {
    action: "off",
    user_id: user.id,
    user_email: user.email,
    user_name: userName,
    line: `LINE ${no}`,
    dept,
  };

  const nodered = Deno.env.get("NODERED_URL");
  if (!nodered) {
    return json({ ok: true, warning: "order tercatat, NODERED_URL belum diset" });
  }

  const relay = await fetch(`${nodered}/andon/cmd`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nodered-token": Deno.env.get("NODERED_TOKEN") ?? "",
    },
    body: JSON.stringify({ topic, payload }),
  });

  return json({ ok: relay.ok, topic, payload }, relay.ok ? 200 : 502);
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
