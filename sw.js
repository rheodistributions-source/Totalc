/* TCS alerts service worker: shows notifications and, where the phone allows, checks for new items while the page is closed. */
var KEY="/api/kv?key=klb-ops-state-v2",CACHE="tcs-push-v1";
self.addEventListener("install",function(e){self.skipWaiting()});
self.addEventListener("activate",function(e){e.waitUntil(self.clients.claim())});
function store(k,v){return caches.open(CACHE).then(function(c){return c.put("/__"+k,new Response(JSON.stringify(v)))})}
function load(k){return caches.open(CACHE).then(function(c){return c.match("/__"+k)}).then(function(r){return r?r.json():null})}
self.addEventListener("message",function(e){if(e.data&&e.data.mode)e.waitUntil(store("mode",e.data.mode))});
function events(o,M){var ev=[],m=function(x){return"R "+Number(x||0).toLocaleString("en-ZA")};
  (o.opsInbox||[]).forEach(function(x){ev.push(["i:"+x.id,"New "+(x.kind==="invoice"?"invoice ":"quote ")+x.docNumber,(x.client||"")+" - "+m(x.total)])});
  if(M==="ceo"){(o.quotes||[]).filter(function(x){return x.status==="pending"}).forEach(function(x){ev.push(["q:"+x.id,"Approval needed",(x.note||"Quote / invoice")+" - "+m(x.amount)])});(o.docApprovals||[]).filter(function(x){return x.status==="pending"}).forEach(function(x){ev.push(["da:"+x.id,"Approve or decline "+(x.kind==="invoice"?"invoice ":"quotation ")+x.docNumber,(x.client||"")+" - "+m(x.total)+" (sent by "+(x.by||"reception")+")"])});
    (o.urgentParts||[]).filter(function(x){return x.status==="awaiting_ceo"}).forEach(function(x){ev.push(["p:"+x.id,"Urgent part - funds needed",(x.desc||x.part||x.title||"Urgent part")])})}
  else{(o.issues||[]).filter(function(x){return x.status!=="resolved"}).forEach(function(x){ev.push(["s:"+x.id,"New issue reported",x.text||x.title||x.note||"Issue"])});
    (o.jobReports||[]).forEach(function(r){if(r.injury)ev.push(["j:"+r.id,"INJURY reported",(r.worker||"")+" - "+(r.injuryNote||"")]);else if(r.brokenTool)ev.push(["j:"+r.id,"Broken tool",r.brokenTool])});
    (o.urgentParts||[]).forEach(function(x){ev.push(["p:"+x.id,"Urgent part request",(x.desc||x.part||x.title||"Urgent part")])})}
  (o.rewardNotices||[]).filter(function(x){return x.status==="open"}).forEach(function(x){ev.push(["rw:"+x.id,"Reward to collect: "+x.name,x.name+" ("+String(x.team).toUpperCase()+") must come and collect their reward"])});if(M==="ceo")(o.companyAwards||[]).filter(function(x){return !x.seen}).forEach(function(x){ev.push(["aw:"+x.key,"Best company of the "+x.kind,x.text])});return ev}
function check(){return load("mode").then(function(M){if(!M)return;
  return fetch(KEY,{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){var o=typeof d.value==="string"?JSON.parse(d.value):d.value;if(!o)return;
    var ev=events(o,M),ids=ev.map(function(e){return e[0]});
    return load("seen-"+M).then(function(seen){if(!seen)return store("seen-"+M,ids);
      var fresh=ev.filter(function(e){return seen.indexOf(e[0])<0});
      return Promise.all(fresh.slice(0,3).map(function(e){return self.registration.showNotification(e[1],{body:e[2],tag:e[0],icon:"icon-192.png",badge:"icon-192.png",vibrate:[200,100,200]})})).then(function(){return store("seen-"+M,seen.concat(fresh.map(function(e){return e[0]})).slice(-500))})})})})}
self.addEventListener("periodicsync",function(e){if(e.tag==="tcs-check")e.waitUntil(check())});
self.addEventListener("push",function(e){var d={};try{d=e.data.json()}catch(x){}e.waitUntil(self.registration.showNotification(d.title||"TCS",{body:d.body||"New item",icon:"icon-192.png"}))});
self.addEventListener("notificationclick",function(e){e.notification.close();e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(l){if(l.length)return l[0].focus();return self.clients.openWindow((e.notification.data&&e.notification.data.url)||"./")}))});
