// Merge OLD system data into NEW system data. Nothing in NEW is ever deleted or overwritten by OLD.
export function tcsMerge(nw, old) {
  var out = JSON.parse(JSON.stringify(nw || {})), added = {}, o = old || {};
  function bump(k, n) { if (n) added[k] = (added[k] || 0) + n; }
  function keyOf(k, x) {
    if (k === "clocks") return [x.workerName, x.inAt, x.division].join("|");
    if (k === "opsReports" || k === "events" && !x.id) return JSON.stringify(x);
    if (k === "companyAwards") return x.key;
    return x && x.id != null ? String(x.id) : JSON.stringify(x);
  }
  var ARR = ["workers","receptionStaff","jobs","clocks","attendance","stockChecks","quotes","profits","jobReports","suggestions",
    "documents","events","assets","urgentParts","behaviour","opsChecks","arrivals","opsInbox","mechJobs","mechLog",
    "companyAwards","jobCards","docApprovals","issues","rewardNotices"];
  ARR.forEach(function (k) {
    if (!Array.isArray(o[k]) || !o[k].length) return;
    var cur = Array.isArray(out[k]) ? out[k] : [], seen = {};
    cur.forEach(function (x) { seen[keyOf(k, x)] = 1; });
    var n = 0;
    o[k].forEach(function (x) { var id = keyOf(k, x); if (!seen[id]) { seen[id] = 1; cur.push(x); n++; } });
    out[k] = cur; bump(k, n);
  });
  // documents numbered the same in both systems: keep both, but never duplicate the same id
  // keyed objects: old fills only what is missing
  ["empInfo","whereabouts","toolDaily","opsReports","opsBriefs","phones","divReports"].forEach(function (k) {
    if (!o[k] || typeof o[k] !== "object") return;
    var cur = out[k] && typeof out[k] === "object" ? out[k] : {}, n = 0;
    Object.keys(o[k]).forEach(function (id) {
      if (k === "empInfo") { // passwords/PINs exactly as in the old system
        var was = cur[id]; cur[id] = Object.assign({}, was || {}, o[k][id]);
        if (!was) n++; return;
      }
      if (!(id in cur)) { cur[id] = o[k][id]; n++; }
    });
    out[k] = cur; bump(k, n);
  });
  // numbering never goes backwards
  var dc = Object.assign({}, out.docCounters || {});
  Object.keys(o.docCounters || {}).forEach(function (k) { dc[k] = Math.max(Number(dc[k]) || 0, Number(o.docCounters[k]) || 0); });
  if (Object.keys(dc).length) out.docCounters = dc;
  if (o.nextJob != null) out.nextJob = Math.max(Number(out.nextJob) || 0, Number(o.nextJob) || 0);
  // documents: make sure counters are at least the highest number seen
  // stock lists and tool barcodes
  if (o.stockLists) { var sl = out.stockLists || {}; Object.keys(o.stockLists).forEach(function (k) {
      var cur = sl[k] || [], s = {}; cur.forEach(function (x) { s[x] = 1; });
      (o.stockLists[k] || []).forEach(function (x) { if (!s[x]) { cur.push(x); bump("stockLists." + k, 1); } }); sl[k] = cur; }); out.stockLists = sl; }
  if (o.toolBarcodes) { var tb = out.toolBarcodes || {}; Object.keys(o.toolBarcodes).forEach(function (d) {
      var cur = tb[d] || [], s = {}; cur.forEach(function (x) { s[String(x.barcode).toUpperCase()] = 1; });
      (o.toolBarcodes[d] || []).forEach(function (x) { if (!s[String(x.barcode).toUpperCase()]) { cur.push(x); bump("toolBarcodes." + d, 1); } }); tb[d] = cur; }); out.toolBarcodes = tb; }
  if (o.hs) { var hs = out.hs || {}; Object.keys(o.hs).forEach(function (k) {
      if (Array.isArray(o.hs[k])) { var cur = hs[k] || [], s = {}; cur.forEach(function (x) { s[keyOf("hs", x)] = 1; });
        o.hs[k].forEach(function (x) { var id = keyOf("hs", x); if (!s[id]) { s[id] = 1; cur.push(x); bump("hs." + k, 1); } }); hs[k] = cur; }
      else if (!(k in hs)) hs[k] = o.hs[k]; }); out.hs = hs; }
  // every other key (flags, seeds, settings): keep NEW, otherwise take OLD. sysLock is always kept as NEW (server guard).
  Object.keys(o).forEach(function (k) { if (!(k in out) && k !== "sysLock") { out[k] = o[k]; bump("other." + k, 1); } });
  if (!out.sysLock && o.sysLock) out.sysLock = o.sysLock;
  return { state: out, added: added };
}
