// /api/push  -  phones of the CEO, CFO and Master Control sign up here for alerts that arrive even when TCS is closed.
//   GET  ?op=key       -> public key the phone needs to sign up
//   GET  ?op=status    -> how many phones get CEO / CFO / Master Control alerts
//   POST {op:"subscribe", role, sub, device, test}   -> save this phone (and send a test alert when test is true)
//   POST {op:"test", endpoint}                        -> send a test alert to this phone
//   POST {op:"unsubscribe", endpoint}                 -> stop alerts on this phone
//   POST {op:"ack", endpoint, tags | all}             -> stop the repeat rings on this phone
import { db, json } from "./_store.mjs";
import { ROLES, PAGE, getVapid, getSubs, saveSubs, subId, deliver } from "./_alerts.mjs";
export const config = { path: "/api/push" };

const HOSTS = [".googleapis.com", ".push.apple.com", ".mozilla.com", ".mozaws.net", ".notify.windows.com"];
const okEndpoint = (e) => { try { const u = new URL(e); return u.protocol === "https:" && HOSTS.some((h) => ("." + u.hostname).endsWith(h)); } catch { return false; } };
const CODE = (r) => String(r === "ceo" ? process.env.CEO_CODE || "444" : r === "cfo" ? process.env.CFO_CODE || "555" : process.env.OPS_CODE || "8910");
const counts = (list) => { const c = { ceo: 0, cfo: 0, ops: 0 }; list.forEach((x) => (x.roles || []).forEach((r) => { if (r in c) c[r]++; })); return c; };

export default async (req) => {
  const s = db(), u = new URL(req.url);
  try {
    if (req.method === "GET") {
      const op = u.searchParams.get("op");
      if (op === "key") return json({ key: (await getVapid(s)).publicKey });
      if (op === "status") return json({ counts: counts(await getSubs(s)) });
      return json({ error: "unknown op" }, 400);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }

    if (b.op === "subscribe") {
      const sub = b.sub || {}, keys = sub.keys || {};
      if (!okEndpoint(sub.endpoint)) return json({ error: "This browser's alert service is not supported. Use Chrome, Samsung Internet or Safari (Home Screen app)." }, 400);
      if (!keys.p256dh || !keys.auth) return json({ error: "subscription has no keys" }, 400);
      const id = subId(sub.endpoint), list = await getSubs(s);
      let rec = list.find((x) => x.id === id);
      const oldId = b.old ? subId(b.old) : null;
      const old = oldId && oldId !== id ? list.find((x) => x.id === oldId) : null;
      // A phone gets CEO / CFO / Master Control alerts only with that dashboard's code
      // (or when the phone's browser renews a subscription that was already approved).
      const asked = (Array.isArray(b.roles) ? b.roles : [b.role]).filter((r) => r in ROLES);
      const roles = old ? old.roles.slice() : asked.filter((r) => String(b.code || "") === CODE(r) || String((b.codes || {})[r] || "") === CODE(r) || (rec && (rec.roles || []).includes(r)));
      if (!roles.length && !(rec && rec.roles && rec.roles.length)) return json({ error: "Wrong code. Open the dashboard with its code first, then tap Turn on alerts." }, 403);
      const merged = Array.from(new Set([...(rec ? rec.roles : []), ...(old ? old.roles : []), ...roles]));
      rec = { ...(old || {}), ...(rec || {}), id, endpoint: sub.endpoint, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
        roles: merged, device: String(b.device || "").slice(0, 140), at: (rec && rec.at) || Date.now(), seenAt: Date.now() };
      const next = list.filter((x) => x.id !== id && x.id !== oldId).concat(rec);
      await saveSubs(s, next);
      let test = null;
      if (b.test) {
        const label = merged.map((r) => ROLES[r]).join(" + ");
        test = await deliver(s, [{ sub: rec, m: { title: "TCS alerts are on ✓", body: "This phone will get " + label + " alerts, even when TCS is closed.", tag: "test", url: PAGE[merged[0]], role: merged[0], t: Date.now() } }]);
      }
      return json({ ok: true, roles: merged, test, counts: counts(next) });
    }
    if (b.op === "test") {
      const rec = (await getSubs(s)).find((x) => x.id === subId(b.endpoint));
      if (!rec) return json({ error: "This phone is not signed up. Tap Turn on alerts." }, 404);
      const r = (rec.roles || [])[0] || "ceo";
      return json({ ok: true, test: await deliver(s, [{ sub: rec, m: { title: "TCS test alert ✓", body: "Alerts reach this phone (" + (rec.roles || []).map((x) => ROLES[x]).join(" + ") + ").", tag: "test", url: PAGE[r], role: r, t: Date.now() } }]) });
    }
    // This phone has seen the alert (tapped it, closed it, or opened the dashboard): stop ringing it again
    if (b.op === "ack") {
      const id = subId(b.endpoint), r = await s.get("push:ring", { type: "json" }), list = (r && r.list) || [];
      const tags = b.all ? null : new Set((b.tags || []).map(String));
      const out = list.filter((x) => !(x.sid === id && (!tags || tags.has(x.tag))));
      if (out.length !== list.length) await s.setJSON("push:ring", { list: out });
      return json({ ok: true, stopped: list.length - out.length });
    }
    if (b.op === "unsubscribe") {
      const id = subId(b.endpoint), list = await getSubs(s);
      await saveSubs(s, list.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};
