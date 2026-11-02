// /api/device  -  registered devices (clock-in only from trusted devices)
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, json } from "./_store.mjs";
export const config = { path: "/api/device" };
const H = (t) => createHash("sha256").update(String(t)).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const OPS = () => process.env.OPS_CODE || "8910";
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const s = db();
  const rec = (await s.get("devices", { type: "json" })) || { enforce: false, list: [] };
  const pub = (d) => ({ id: d.id, name: d.name, kind: d.kind, warehouse: d.warehouse, lastSeen: d.lastSeen });
  const save = () => s.setJSON("devices", rec);
  if (b.op === "check") {
    const d = b.token ? rec.list.find((x) => x.hash === H(b.token)) : null;
    if (d) { if (!d.lastSeen || Date.now() - d.lastSeen > 6e4) { d.lastSeen = Date.now(); await save(); } }
    return json({ enforce: !!rec.enforce, registered: !!d, device: d ? pub(d) : null });
  }
  if (!same(b.code || "", OPS())) return json({ error: "Wrong officer code" }, 403);
  if (b.op === "list") return json({ devices: rec.list.map(pub), enforce: !!rec.enforce, weakCode: OPS().length < 6 });
  if (b.op === "register") {
    const name = String(b.name || "").trim().slice(0, 40);
    if (!name) return json({ error: "Name required" }, 400);
    const kind = ["mechanic", "reception", "other"].includes(b.kind) ? b.kind : "other";
    const token = randomBytes(24).toString("hex");
    const d = { id: randomBytes(5).toString("hex"), name, kind, warehouse: String(b.warehouse || "klb").slice(0, 12), hash: H(token), lastSeen: Date.now() };
    rec.list.push(d); await save();
    return json({ token, device: pub(d) });
  }
  if (b.op === "cancel") { rec.list = rec.list.filter((x) => x.id !== b.id); await save(); return json({ ok: true }); }
  if (b.op === "enforce") { rec.enforce = !!b.on; await save(); return json({ ok: true, enforce: rec.enforce }); }
  return json({ error: "unknown op" }, 400);
};
