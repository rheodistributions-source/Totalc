// /api/kv  -  shared storage for the three dashboards (state, scans, parts office)
import { db, json, okKey } from "./_store.mjs";
import { autoImportOnce } from "./_oldimport.mjs";
import { notifyChange } from "./_alerts.mjs";
import { merge3 } from "./_merge3.mjs";
export const config = { path: "/api/kv" };
const MAX = 5 * 1024 * 1024, MAIN = "klb-ops-state-v2";
const OPS = () => String(process.env.OPS_CODE || "8910");
const newV = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
// One backup per day: the system exactly as it was before the first save of that day. Kept for 30 days.
async function dailyBackup(s, cur) {
  if (!cur || !cur.value) return;
  const k = "bak:" + today();
  if (await s.getMetadata(k)) return;
  await s.set(k, cur.value);
  await trim(s, "bak:", 30);
}
async function trim(s, prefix, keep) {
  const { blobs } = await s.list({ prefix });
  const keys = blobs.map((b) => b.key).filter((k) => !k.includes("before-restore")).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keep))) await s.delete(k);
}
export default async (req, context) => {
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
    // Backups: list them, or put one back (Top Management code needed)
    if (req.method === "GET" && op === "backups") {
      const { blobs } = await s.list({ prefix: "bak:" });
      return json({ backups: blobs.map((b) => b.key.slice(4)).sort().reverse() });
    }
    if (req.method === "POST" && op === "restore") {
      if (String(req.headers.get("x-unlock-code") || "") !== OPS()) return json({ error: "Wrong Top Management code" }, 403);
      const day = String(u.searchParams.get("day") || "");
      const bak = /^[0-9A-Za-z:_-]{6,40}$/.test(day) ? await s.get("bak:" + day) : null;
      if (!bak) return json({ error: "No backup for " + day }, 404);
      const cur = await s.get("kv:" + MAIN, { type: "json" });
      if (cur && cur.value) await s.set("bak:" + today() + "-before-restore-" + Date.now().toString(36), cur.value);
      const v = newV();
      await s.set("ver:" + v, bak);
      await s.setJSON("kv:" + MAIN, { value: bak, v });
      return json({ ok: true, v, restored: day });
    }
    if (req.method === "GET" && op === "sync") {
      const rec = await s.get("kv:" + key, { type: "json" });
      const scans = (await s.get("scans:" + key, { type: "json" })) || {};
      return json({ scans, v: rec ? rec.v : null });
    }
    if (req.method === "GET") {
      if (key === "klb-ops-state-v2") { try { await autoImportOnce(); } catch (e) { /* never block the page */ } }   // one-time import of the old site's data
      const rec = await s.get("kv:" + key, { type: "json" });
      return json({ value: rec ? rec.value : null, v: rec ? rec.v : null });
    }
    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX) return json({ error: "too large" }, 413);
      const body = JSON.parse(text);
      if (typeof body.value !== "string") return json({ error: "value must be a string" }, 400);
      if (key !== MAIN) {
        const v = newV();
        await s.setJSON("kv:" + key, { value: body.value, v });
        return json({ ok: true, v });
      }
      // ---- main system data ----
      const cur = await s.get("kv:" + key, { type: "json" });
      let pst = null; try { pst = cur && cur.value ? JSON.parse(cur.value) : null; } catch { pst = null; }
      let nst = JSON.parse(body.value), merged = false;
      // NO LOST WORK: if someone else saved since this device last loaded, keep both sides' changes.
      const base = typeof body.base === "string" && body.base ? body.base : null;
      if (pst && (!base || base !== cur.v)) {
        let bst;
        if (base) { try { const bv = await s.get("ver:" + base); if (bv) bst = JSON.parse(bv); } catch { bst = undefined; } }
        nst = merge3(bst, nst, pst);
        merged = true;
      }
      // SYSTEM LOCK GUARD: a phone holding old data can never lock/unlock the system by accident,
      // and only someone who knows the Top Management code can switch a locked system back on.
      try {
        const pl = (pst && pst.sysLock) || null, nl = nst.sysLock || null;
        const prevOn = !!(pl && pl.on), nextOn = !!(nl && nl.on);
        const prevRev = Number(pl && pl.rev) || 0, nextRev = Number(nl && nl.rev) || 0;
        let keepPrev = false;
        if (pl && nextRev < prevRev) keepPrev = true;            // older device: never overrides a newer lock decision
        if (prevOn && !nextOn) {                                   // unlocking needs the Top Management code
          const sent = String(req.headers.get("x-unlock-code") || "");
          if (sent !== OPS()) keepPrev = true;
        }
        if (keepPrev && pst) nst = { ...nst, sysLock: pl };
      } catch (e) { /* if anything is odd, save normally */ }
      let outValue = JSON.stringify(nst);
      if (merged && outValue === body.value) merged = false;
      const v = newV();
      await s.set("ver:" + v, outValue);                           // this version, so the next save can be merged against it
      await s.setJSON("kv:" + key, { value: outValue, v });
      // after the reply: phone alerts, daily backup, tidy old versions
      const after = (async () => {
        try { await notifyChange(pst, nst, s); } catch (e) { console.log("alerts failed", e && e.message); }
        try { await dailyBackup(s, cur); } catch (e) { console.log("backup failed", e && e.message); }
        try { if (Math.random() < 0.08) await trim(s, "ver:", 80); } catch (e) { /* next time */ }
      })();
      if (context && typeof context.waitUntil === "function") context.waitUntil(after); else await after;
      return json({ ok: true, v, merged });
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
