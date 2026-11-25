// Runs every minute (Netlify scheduled function). Urgent alerts (approve/decline, money for parts, urgent parts,
// injuries) ring the phone again every few minutes until that phone taps the alert or opens the dashboard,
// or until the item is dealt with. Settings: Master Control > Phone alerts.
import { db } from "./_store.mjs";
import { getSubs, deliver } from "./_alerts.mjs";
import { TCS } from "./_events.mjs";
export const config = { schedule: "* * * * *" };
const KEY = "push:ring", k = (x) => x.sid + "|" + x.tag;

export async function ringDue(s = db(), now = Date.now()) {
  const r = await s.get(KEY, { type: "json" });
  const list = (r && r.list) || [];
  const due = list.filter((x) => x.next <= now);
  if (!due.length) return { rang: 0, waiting: list.length };
  let st = null;
  try { const rec = await s.get("kv:klb-ops-state-v2", { type: "json" }); st = rec && rec.value ? JSON.parse(rec.value) : null; } catch { st = null; }
  const cfg = TCS.tcsAlertCfg(st), live = {};
  for (const role of ["ceo", "cfo", "ops"]) for (const e of TCS.tcsEventsFor(st, role)) live[role + "|" + e[0]] = 1;
  const subs = await getSubs(s), byId = Object.fromEntries(subs.map((x) => [x.id, x]));
  const jobs = [], upd = {}, drop = {};
  for (const x of due) {
    const sub = byId[x.sid];
    if (!sub || !live[x.role + "|" + x.tag] || !(x.left > 0)) { drop[k(x)] = 1; continue; }   // phone gone, item dealt with, or rang enough
    const n = (x.n || 0) + 1;
    jobs.push({ sub, m: { ...x.msg, title: "\u{1F514} " + String(x.msg.title).replace(/^\u{1F514} /u, ""), body: x.msg.body + " (reminder " + n + ")", repeat: n, t: now } });
    upd[k(x)] = { next: now + cfg.repeatMin * 60000, left: x.left - 1, n };
  }
  if (jobs.length) await deliver(s, jobs);
  const r2 = await s.get(KEY, { type: "json" });        // re-read so alerts added meanwhile are kept
  const out = ((r2 && r2.list) || []).filter((x) => !drop[k(x)]).map((x) => upd[k(x)] ? { ...x, ...upd[k(x)] } : x).filter((x) => x.left > 0);
  await s.setJSON(KEY, { list: out.slice(-500) });
  return { rang: jobs.length, waiting: out.length };
}

export default async () => {
  try { const r = await ringDue(); return new Response(JSON.stringify(r)); }
  catch (e) { console.log("ring failed", e && e.message); return new Response("error", { status: 500 }); }
};
