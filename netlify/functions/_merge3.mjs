// Three-way merge for the shared TCS data (build 113).
// Every device saves the WHOLE system. Before this build, when two devices saved within a few seconds of each other,
// the later save wiped out what the earlier one had just added (a clock-in, a job, a note...).
// Now the server compares: base = what the saving device last loaded, mine = what it sends, theirs = what is on the
// server now. Changes from BOTH sides are kept. Something is only removed if one side really deleted it and the
// other side did not touch it. With no base (old pages / imports) nothing is removed at all (union).
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const same = (a, b) => a === b || (a !== null && b !== null && typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));
const COUNTERS = new Set(["docCounters", "nextJob", "nj", "nq", "ni"]);   // numbering never goes backwards

export function idOf(x) {
  if (!isObj(x)) return "v:" + JSON.stringify(x);
  if (x.id != null) return "id:" + x.id;
  if (x.key != null) return "key:" + x.key;
  if (x.workerName != null && x.inAt != null) return "clk:" + x.workerName + "|" + x.inAt + "|" + (x.division || "");
  if (x.barcode != null) return "bc:" + x.barcode;
  return "j:" + JSON.stringify(x);
}

function mergeArr(b, m, t, d, ctr) {
  const B = new Map(), T = new Map(), M = new Set();
  (b || []).forEach((x) => B.set(idOf(x), x));
  t.forEach((x) => T.set(idOf(x), x));
  m.forEach((x) => M.add(idOf(x)));
  const out = [], done = new Set();
  for (const x of m) {
    const id = idOf(x);
    if (done.has(id)) { out.push(x); continue; }                 // duplicate inside mine: keep as is
    if (T.has(id)) { out.push(merge3(B.has(id) ? B.get(id) : undefined, x, T.get(id), d + 1, ctr)); done.add(id); continue; }
    if (B.has(id) && same(x, B.get(id))) continue;               // the other side deleted it and mine never touched it
    out.push(x); done.add(id);                                   // new in mine (or changed by mine): keep
  }
  for (const y of t) {
    const id = idOf(y);
    if (done.has(id) || M.has(id)) continue;
    if (B.has(id) && same(y, B.get(id))) continue;               // mine deleted it and the other side never touched it
    out.push(y); done.add(id);                                   // added (or changed) by the other side: keep
  }
  return out;
}

export function merge3(b, m, t, d = 0, ctr = false) {
  if (same(m, t)) return m;
  if (b !== undefined) { if (same(m, b)) return t; if (same(t, b)) return m; }
  if (Array.isArray(m) && Array.isArray(t)) return mergeArr(Array.isArray(b) ? b : undefined, m, t, d, ctr);
  if (isObj(m) && isObj(t) && d < 12) {
    const bo = isObj(b) ? b : undefined, out = {};
    for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) {
      const inM = k in m, inT = k in t, inB = !!bo && k in bo, c2 = ctr || COUNTERS.has(k);
      if (inM && inT) out[k] = merge3(inB ? bo[k] : undefined, m[k], t[k], d + 1, c2);
      else if (inM) { if (inB && same(m[k], bo[k])) continue; out[k] = m[k]; }
      else { if (inB && same(t[k], bo[k])) continue; out[k] = t[k]; }
    }
    return out;
  }
  if (ctr && typeof m === "number" && typeof t === "number") return Math.max(m, t);
  return m;                                                       // both changed the same value: the newest save wins
}
