// Phone alerts for Top Management. Every time the shared data is saved (from ANY page: receptionist, mechanic,
// keypad, user home page...) the server works out what is new and pushes it to the CEO, CFO and Master Control
// phones that tapped "Turn on alerts". Works with the app closed and the phone locked.
import { createHash } from "node:crypto";
import { db } from "./_store.mjs";
import { makeVapid, sendPush } from "./_webpush.mjs";
import { TCS } from "./_events.mjs";

export const ROLES = { ceo: "CEO", cfo: "CFO", ops: "Master Control" };
export const PAGE = { ceo: "/2_CEO_Page.html", cfo: "/5_CFO_Page.html", ops: "/3_Operations_Officer_Page.html" };
const SUBJECT = () => process.env.PUSH_CONTACT || "mailto:info@klbengineering.co.za";
const DAY = 864e5;
export const subId = (endpoint) => createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 24);

export async function getVapid(s = db()) {
  let v = await s.get("push:vapid", { type: "json" });
  if (!v || !v.publicKey || !v.jwk) {
    const made = makeVapid();
    // only the first writer wins, so every phone gets the same key even if two pages ask at once
    try { await s.setJSON("push:vapid", made, { onlyIfNew: true }); } catch { /* older blobs lib: fall through */ }
    v = (await s.get("push:vapid", { type: "json" })) || made;
    if (!v.publicKey) { await s.setJSON("push:vapid", made); v = made; }
  }
  return v;
}
export async function getSubs(s = db()) { const r = await s.get("push:subs", { type: "json" }); return (r && r.list) || []; }
export async function saveSubs(s, list) { await s.setJSON("push:subs", { list: list.slice(-200) }); }

// What each role gets comes from the shared alert list (_events.mjs) and the settings Master Control chose.
export const events = (o, role) => TCS.tcsEventsFor(o, role);
const RL = ["ceo", "cfo", "ops"];
const badgeFor = (o, role) => role === "ops" ? undefined :
  (o.quotes || []).filter((x) => x.status === "pending").length + (o.docApprovals || []).filter((x) => x.status === "pending").length;
const pfx = (id) => String(id).split(":")[0];

// Work out what is new since the last save and push it. prev = data before this save, next = data just saved.
export async function notifyChange(prev, next, s = db()) {
  const now = Date.now(), cur = {}, cfg = TCS.tcsAlertCfg(next);
  for (const r of RL) for (const e of TCS.tcsEvents(next, r)) cur[r + "|" + e[0]] = { r, id: e[0], title: e[1], body: e[2], cat: e[3], ring: e[4], img: e[5] };
  let seen = await s.get("push:seen", { type: "json" }), changed = false;
  if (!seen || typeof seen !== "object") { seen = {}; changed = true; }
  // A kind of alert this role never had before (new build): what already existed is not news.
  for (const r of RL) {
    const kinds = new Set([...TCS.tcsEvents(next, r), ...TCS.tcsEvents(prev, r)].map((e) => pfx(e[0])));
    for (const k of kinds) {
      if (seen["__k|" + r + "|" + k]) continue;
      seen["__k|" + r + "|" + k] = now; changed = true;
      for (const e of TCS.tcsEvents(prev, r)) if (pfx(e[0]) === k) seen[r + "|" + e[0]] = now;
    }
  }
  const fresh = Object.keys(cur).filter((k) => !(k in seen)).map((k) => cur[k]);
  for (const f of fresh) { seen[f.r + "|" + f.id] = now; changed = true; }
  for (const k of Object.keys(seen)) if (!k.startsWith("__k|") && !(k in cur) && now - seen[k] > 30 * DAY) { delete seen[k]; changed = true; }
  const keys = Object.keys(seen).filter((k) => !k.startsWith("__k|"));
  if (keys.length > 8000) { keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - 8000).forEach((k) => delete seen[k]); changed = true; }
  if (changed) await s.setJSON("push:seen", seen);
  const wanted = fresh.filter((f) => (cfg.cats[f.cat] || {})[f.r]);
  if (!wanted.length) return { fresh: fresh.length, sent: 0 };
  const subs = await getSubs(s);
  if (!subs.length) return { fresh: fresh.length, sent: 0 };
  const jobs = [], rings = [];
  for (const sub of subs) {
    const msgs = [], tags = {};
    for (const role of sub.roles || []) for (const f of wanted.filter((x) => x.r === role)) {
      if (tags[f.id]) continue; tags[f.id] = 1;
      msgs.push({ title: f.title, body: f.body, tag: f.id, url: PAGE[role] || "/", role, badge: badgeFor(next, role), ring: f.ring ? 1 : 0, ...(f.img ? { image: f.img } : {}), t: now });
    }
    if (!msgs.length) continue;
    let list = msgs;
    if (msgs.length > 4) list = [...msgs.slice(0, 3), { title: "TCS - " + (msgs.length - 3) + " more new items", body: "Open the dashboard to see everything that is new.", tag: "more", url: msgs[0].url, role: msgs[0].role, t: now }];
    list.forEach((m) => { jobs.push({ sub, m }); if (m.ring && cfg.repeatTimes > 0) rings.push({ sid: sub.id, role: m.role, tag: m.tag, msg: m, next: now + cfg.repeatMin * 60000, left: cfg.repeatTimes, n: 0 }); });
  }
  const res = await deliver(s, jobs);
  if (rings.length) {                       // keep ringing until tapped (see ring.mjs)
    const r0 = await s.get("push:ring", { type: "json" });
    const old = ((r0 && r0.list) || []).filter((x) => !rings.some((y) => y.sid === x.sid && y.tag === x.tag));
    await s.setJSON("push:ring", { list: [...old, ...rings].slice(-500) });
  }
  return res;
}

// Send, then drop phones the push service says are gone (404/410) and remember the last good delivery.
export async function deliver(s, jobs) {
  if (!jobs.length) return { sent: 0 };
  const vapid = await getVapid(s), subject = SUBJECT();
  const res = await Promise.all(jobs.map((j) => sendPush(j.sub, j.m, vapid, subject).then((r) => ({ id: j.sub.id, ...r }))));
  const gone = {}, ok = {}, bad = {};
  res.forEach((r) => { if (r.status === 404 || r.status === 410) gone[r.id] = 1; else if (r.status >= 200 && r.status < 300) ok[r.id] = 1; else bad[r.id] = r.status + " " + (r.text || ""); });
  if (Object.keys(gone).length || Object.keys(ok).length || Object.keys(bad).length) {
    const fresh = await getSubs(s);               // re-read so a phone that signed up meanwhile is kept
    const list = fresh.filter((x) => !gone[x.id]).map((x) => ok[x.id] ? { ...x, lastOk: Date.now(), lastErr: null } : bad[x.id] ? { ...x, lastErr: bad[x.id], errAt: Date.now() } : x);
    await saveSubs(s, list);
  }
  if (Object.keys(bad).length) console.log("push errors", JSON.stringify(bad));
  return { sent: res.filter((r) => r.status >= 200 && r.status < 300).length, results: res.map((r) => r.status) };
}
