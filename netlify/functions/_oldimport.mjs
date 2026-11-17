// Pulls the OLD site's data (server to server) and merges it into this site's data. Safe to run many times.
import { db } from "./_store.mjs";
import { tcsMerge } from "./_merge.mjs";
export const OLD = () => String(process.env.OLD_SITE_URL || "https://totalcontr.netlify.app").replace(/\/+$/, "");
const MAIN = "klb-ops-state-v2";
async function pull(key) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(OLD() + "/api/kv?key=" + encodeURIComponent(key), { signal: ctl.signal, headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error("old site answered " + r.status);
    const d = await r.json();
    return d && d.value ? JSON.parse(d.value) : null;
  } finally { clearTimeout(t); }
}
// dry = true: report what would be added, save nothing
export async function importOld(dry) {
  const s = db(), report = {};
  const old = await pull(MAIN);
  if (!old) throw new Error("old site has no data");
  const rec = await s.get("kv:" + MAIN, { type: "json" });
  const cur = rec && rec.value ? JSON.parse(rec.value) : {};
  const res = tcsMerge(cur, old);
  report[MAIN] = res.added;
  if (!dry) {
    const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await s.setJSON("kv:" + MAIN, { value: JSON.stringify(res.state), v });
  }
  // parts office list (only fills it if this site has none yet)
  try {
    const oo = await pull("office-v1");
    const orec = await s.get("kv:office-v1", { type: "json" });
    if (oo && !(orec && orec.value)) {
      report["office-v1"] = { parts: (oo.parts || []).length };
      if (!dry) await s.setJSON("kv:office-v1", { value: JSON.stringify(oo), v: Date.now().toString(36) });
    }
  } catch (e) { report["office-v1"] = "skipped: " + e.message; }
  return { report, documents: (res.state.documents || []).length, events: (res.state.events || []).length,
    approvals: (res.state.docApprovals || []).length, inbox: (res.state.opsInbox || []).length };
}
// Runs once, automatically, the first time the new site's data is opened.
export async function autoImportOnce() {
  const s = db();
  const done = await s.get("flag:imported-old-v1", { type: "json" });
  if (done) return;
  await s.setJSON("flag:imported-old-v1", { at: Date.now(), state: "running" });
  try { const r = await importOld(false); await s.setJSON("flag:imported-old-v1", { at: Date.now(), state: "done", r }); }
  catch (e) { await s.delete("flag:imported-old-v1"); }   // try again next time
}
