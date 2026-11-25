// Voice notes. Employees record on their terminal; the audio is kept here (not inside the big state file).
//   POST /api/voice  (raw audio body, headers x-mime, x-dur)  -> { id }
//   GET  /api/voice?id=<id>                                    -> the audio
import { randomBytes } from "node:crypto";
import { db, json } from "./_store.mjs";
export const config = { path: "/api/voice" };
const MAX = 4 * 1024 * 1024;   // about 5+ minutes of phone-quality audio
const OKMIME = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav|x-wav)(;.*)?$/i;
const okId = (x) => typeof x === "string" && /^[a-z0-9]{10,40}$/.test(x);
export default async (req) => {
  const s = db(), u = new URL(req.url);
  try {
    if (req.method === "GET") {
      const id = u.searchParams.get("id");
      if (!okId(id)) return json({ error: "bad id" }, 400);
      const r = await s.get("voice:" + id, { type: "json" });
      if (!r) return json({ error: "not found" }, 404);
      return new Response(Buffer.from(r.b64, "base64"), { status: 200, headers: { "Content-Type": r.mime || "audio/webm", "Cache-Control": "private, max-age=86400", "Accept-Ranges": "none" } });
    }
    if (req.method === "POST") {
      const mime = String(req.headers.get("x-mime") || "audio/webm").slice(0, 60);
      if (!OKMIME.test(mime)) return json({ error: "not an audio file" }, 400);
      const buf = Buffer.from(await req.arrayBuffer());
      if (!buf.length) return json({ error: "empty recording" }, 400);
      if (buf.length > MAX) return json({ error: "recording too long" }, 413);
      const id = Date.now().toString(36) + randomBytes(8).toString("hex");
      await s.setJSON("voice:" + id, { mime, dur: Math.min(3600, Number(req.headers.get("x-dur")) || 0), at: new Date().toISOString(), b64: buf.toString("base64") });
      return json({ ok: true, id });
    }
    return json({ error: "method" }, 405);
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};
