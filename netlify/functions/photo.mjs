// Pictures taken on the employee terminals and sent to the CEO. The picture is kept here (not in the main data).
//   POST /api/photo  {img: "data:image/jpeg;base64,...", thumb: "data:image/jpeg;base64,..."} -> { id }
//   GET  /api/photo?id=<id>            -> the picture
//   GET  /api/photo?id=<id>&t=1        -> small preview
//   GET  /api/photo?id=<id>&dl=1&name= -> download (saves as a .jpg file)
import { randomBytes } from "node:crypto";
import { db, json } from "./_store.mjs";
export const config = { path: "/api/photo" };
const MAX = 3.5 * 1024 * 1024, TMAX = 200 * 1024;
const okId = (x) => typeof x === "string" && /^[a-z0-9]{10,40}$/.test(x);
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
function decode(d) {                    // data URL -> { mime, buf } after checking it really is a picture
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64"), t = m[1];
  const ok = t === "jpeg" ? buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    : t === "png" ? buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return ok ? { mime: MIME[t], buf } : null;
}
const safeName = (x) => String(x || "TCS-picture").replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 60) || "TCS-picture";
export default async (req) => {
  const s = db(), u = new URL(req.url);
  try {
    if (req.method === "GET") {
      const id = u.searchParams.get("id"), thumb = u.searchParams.get("t") === "1";
      if (!okId(id)) return json({ error: "bad id" }, 400);
      let r = await s.get("photo:" + id + (thumb ? ":t" : ""), { type: "json" });
      if (!r && thumb) r = await s.get("photo:" + id, { type: "json" });
      if (!r) return json({ error: "not found" }, 404);
      const h = { "Content-Type": r.mime || "image/jpeg", "Cache-Control": "private, max-age=604800" };
      if (u.searchParams.get("dl") === "1") h["Content-Disposition"] = 'attachment; filename="' + safeName(u.searchParams.get("name")) + '.jpg"';
      return new Response(Buffer.from(r.b64, "base64"), { status: 200, headers: h });
    }
    if (req.method === "POST") {
      let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
      const img = decode(b && b.img), th = decode(b && b.thumb);
      if (!img) return json({ error: "not a picture" }, 400);
      if (img.buf.length > MAX) return json({ error: "picture too big" }, 413);
      const id = Date.now().toString(36) + randomBytes(8).toString("hex");
      const at = new Date().toISOString();
      await s.setJSON("photo:" + id, { mime: img.mime, at, size: img.buf.length, b64: img.buf.toString("base64") });
      if (th && th.buf.length <= TMAX) await s.setJSON("photo:" + id + ":t", { mime: th.mime, at, b64: th.buf.toString("base64") });
      return json({ ok: true, id });
    }
    return json({ error: "method" }, 405);
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};
