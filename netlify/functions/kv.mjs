// /api/kv  -  shared storage for the three dashboards (state, scans, parts office)
import { db, json, okKey } from "./_store.mjs";
export const config = { path: "/api/kv" };
const MAX = 5 * 1024 * 1024;
export default async (req) => {
  const u = new URL(req.url), key = u.searchParams.get("key"), op = u.searchParams.get("op");
  if (!okKey(key)) return json({ error: "bad key" }, 400);
  const s = db();
  try {
    // Today's checked-out tools (shown in the Operations Officer inventory)
    if (req.method === "GET" && op === "outlog") {
      const log = (await s.get("outlog:" + key, { type: "json" })) || [];
      return json({ log: log.slice(-300) });
    }
    // Public QR scan: validates the tool, ticks it on the checklist and logs the check-out. No PIN needed.
    if (req.method === "POST" && op === "checkout") {
      const code = String(u.searchParams.get("code") || "").trim();
      if (!code || code.length > 60) return json({ error: "bad code" }, 400);
      const rec = await s.get("kv:" + key, { type: "json" });
      let st = null;
      try { st = rec && rec.value ? JSON.parse(rec.value) : null; } catch { st = null; }
      const tb = (st && st.toolBarcodes) || {};
      let found = null, div = null;
      for (const d of Object.keys(tb)) {
        const x = (tb[d] || []).find((y) => String(y.barcode).toUpperCase() === code.toUpperCase());
        if (x) { found = x; div = d; break; }
      }
      if (!found) return json({ error: "unknown tool", code }, 404);
      const now = Date.now();
      const scans = (await s.get("scans:" + key, { type: "json" })) || {};
      const prev = scans[found.barcode];
      scans[found.barcode] = { t: now, on: true };
      const keys = Object.keys(scans);
      if (keys.length > 3000) keys.sort((a, b) => scans[a].t - scans[b].t).slice(0, keys.length - 3000).forEach((k) => delete scans[k]);
      await s.setJSON("scans:" + key, scans);
      const log = (await s.get("outlog:" + key, { type: "json" })) || [];
      log.push({ code: found.barcode, name: found.name, group: found.group || "", div, t: now });
      await s.setJSON("outlog:" + key, log.slice(-500));
      return json({ ok: true, code: found.barcode, name: found.name, group: found.group || "", div, t: now, prevT: prev && prev.on ? prev.t : null });
    }
    if (req.method === "GET" && op === "sync") {
      const rec = await s.get("kv:" + key, { type: "json" });
      const scans = (await s.get("scans:" + key, { type: "json" })) || {};
      return json({ scans, v: rec ? rec.v : null });
    }
    if (req.method === "GET") {
      const rec = await s.get("kv:" + key, { type: "json" });
      return json({ value: rec ? rec.value : null, v: rec ? rec.v : null });
    }
    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX) return json({ error: "too large" }, 413);
      const body = JSON.parse(text);
      if (typeof body.value !== "string") return json({ error: "value must be a string" }, 400);
      const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await s.setJSON("kv:" + key, { value: body.value, v });
      return json({ ok: true, v });
    }
    if (req.method === "POST" && op === "scan") {
      const code = u.searchParams.get("code");
      if (!code || code.length > 60) return json({ error: "bad code" }, 400);
      const scans = (await s.get("scans:" + key, { type: "json" })) || {};
      const t = Number(u.searchParams.get("t")) || Date.now();
      scans[code] = { t, on: u.searchParams.get("on") === "1" };
      const keys = Object.keys(scans);
      if (keys.length > 3000) keys.sort((a, b) => scans[a].t - scans[b].t).slice(0, keys.length - 3000).forEach((k) => delete scans[k]);
      await s.setJSON("scans:" + key, scans);
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};
