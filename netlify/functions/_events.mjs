// GENERATED from the same list the pages use (build 116). Do not edit by hand.
/* TCS ALERT TYPES (build 114) - one list used by the server, the phones (service worker) and the open dashboards.
   role: "ceo" | "cfo" | "ops" (Master Control). Each event: [id, title, body, category, keepRinging, picture] */
var TCS_ALERT_CATS=[
  ["docs","Quotes & invoices sent to Top Management (approve / decline)",{ceo:1,cfo:1,ops:1}],
  ["decision","Approved / declined by the CEO or CFO",{ceo:1,cfo:1,ops:1}],
  ["parts","Urgent parts (new requests and money needed)",{ceo:1,cfo:1,ops:1}],
  ["safety","Injuries and broken tools",{ceo:1,cfo:1,ops:1}],
  ["issues","Issues reported by staff",{ceo:1,cfo:1,ops:1}],
  ["suggest","Suggestion box",{ceo:1,cfo:1,ops:1}],
  ["claims","Reward claims from staff",{ceo:1,cfo:1,ops:1}],
  ["notes","Daily notes from the admins",{ceo:0,cfo:0,ops:1}],
  ["voice","Voice messages sent to Top Management",{ceo:1,cfo:1,ops:1}],
  ["photos","Pictures sent to the CEO from the terminals",{ceo:1,cfo:0,ops:1}],
  ["reports","Reports sent to the CEO by Operations",{ceo:1,cfo:1,ops:0}],
  ["rewards","Rewards to collect / best company",{ceo:1,cfo:1,ops:1}],
  ["security","Blocked logins (devices)",{ceo:1,cfo:1,ops:1}]
];
function tcsAlertCfg(o){
  var c=(o&&o.alertCfg)||{},out={cats:{},repeatMin:Number(c.repeatMin)>0?Number(c.repeatMin):2,repeatTimes:c.repeatTimes!=null&&Number(c.repeatTimes)>=0?Number(c.repeatTimes):5};
  TCS_ALERT_CATS.forEach(function(k){var d=k[2],u=(c.cats||{})[k[0]]||{};out.cats[k[0]]={ceo:u.ceo!=null?!!u.ceo:!!d.ceo,cfo:u.cfo!=null?!!u.cfo:!!d.cfo,ops:u.ops!=null?!!u.ops:!!d.ops}});
  return out}
function tcsEvents(o,role){
  var ev=[],top=role==="ceo"||role==="cfo",me=role==="ceo"?"CEO":role==="cfo"?"CFO":"",m=function(x){return"R "+Number(x||0).toLocaleString("en-ZA")};
  if(!o)return ev;
  var kindOf=function(x){return x.kind==="invoice"?"invoice":"quotation"};
  (o.opsInbox||[]).forEach(function(x){if(top&&x.approvalId)return;   /* the approve/decline alert below covers it */
    ev.push(["i:"+x.id,"New "+(x.kind==="invoice"?"invoice ":"quote ")+(x.docNumber||""),(x.client||"")+" - "+m(x.total)+" (sent by "+(x.by||"reception")+")","docs",0])});
  (o.docApprovals||[]).forEach(function(x){
    if(x.status==="pending"){if(top)ev.push(["da:"+x.id,"Approve or decline "+kindOf(x)+" "+(x.docNumber||""),(x.client||"")+" - "+m(x.total)+" (sent by "+(x.by||"reception")+")","docs",1]);return}
    if((x.status==="approved"||x.status==="declined")&&x.decidedBy!==me)
      ev.push(["dd:"+x.id+":"+x.status,(x.status==="approved"?"✅ APPROVED":"❌ DECLINED")+" by "+(x.decidedBy||"Top Management")+": "+kindOf(x)+" "+(x.docNumber||""),(x.client||"")+" - "+m(x.total)+" (sent by "+(x.by||"reception")+")","decision",0])});
  (o.quotes||[]).forEach(function(x){
    if(x.status==="pending"){if(top)ev.push(["q:"+x.id,"Approval needed",(x.note||"Quote / invoice")+" - "+m(x.amount),"docs",1]);return}
    if(x.status==="approved"||x.status==="declined")ev.push(["qd:"+x.id+":"+x.status,(x.status==="approved"?"✅ Quote APPROVED":"❌ Quote DECLINED"),(x.note||"Quote / invoice")+" - "+m(x.amount),"decision",0])});
  (o.urgentParts||[]).forEach(function(x){var d=x.desc||x.part||x.title||"Urgent part",by=((x.log||[]).slice(-1)[0]||{}).by||"";
    ev.push([(top?"pr:":"p:")+x.id,"Urgent part request",d+(x.by?" (by "+x.by+")":""),"parts",top?0:1]);
    if(top&&x.status==="awaiting_ceo")ev.push(["p:"+x.id,"Urgent part - money needed",d+(x.fundsAmount?" - "+m(x.fundsAmount):""),"parts",1]);
    if((x.status==="approved"||x.status==="declined")&&x.ceoDecidedAt&&by!==me)ev.push(["pd:"+x.id+":"+x.status,(x.status==="approved"?"✅ Money APPROVED for part":"❌ Money DECLINED for part"),d+(x.fundsAmount?" - "+m(x.fundsAmount):"")+(by?" ("+by+")":""),"decision",0])});
  (o.issues||[]).filter(function(x){return x.status!=="resolved"}).forEach(function(x){ev.push(["s:"+x.id,"New issue reported",(x.worker?x.worker+": ":"")+(x.text||x.title||x.note||(x.categories||[]).join(", ")||"Issue"),"issues",0])});
  (o.jobReports||[]).forEach(function(r){if(r.injury)ev.push(["j:"+r.id,"INJURY reported",(r.worker||"")+" - "+(r.injuryNote||""),"safety",1]);else if(r.brokenTool)ev.push(["j:"+r.id,"Broken tool",r.brokenTool+" ("+(r.worker||"")+")","safety",0])});
  (o.suggestions||[]).forEach(function(x){ev.push(["sg:"+(x.id||x.createdAt),"New suggestion",(x.author||"Anonymous")+": "+String(x.text||"").slice(0,140),"suggest",0])});
  (o.lbClaims||[]).filter(function(x){return x.status==="pending"}).forEach(function(x){ev.push(["cl:"+x.id,"Reward claim: "+x.name,(x.reward||"")+" ("+(x.pts||0)+" pts)","claims",0])});
  (o.voiceNotes||[]).filter(function(x){return x.sent&&x.audioId&&!(x.heard||{})[role]}).forEach(function(x){ev.push(["vn:"+x.id,"\uD83C\uDF99 Voice message from "+(x.name||"staff")+(x.company?" ("+x.company+")":""),(x.title?x.title+" - ":"")+"Open the dashboard and press play","voice",1])});
  (o.photos||[]).filter(function(x){return x.photoId&&!(x.seen||{})[role]}).forEach(function(x){ev.push(["ph:"+x.id,"\uD83D\uDCF7 Picture from "+(x.name||"staff")+(x.company?" ("+x.company+")":""),(x.caption?x.caption+" - ":"")+"Open the dashboard to see it","photos",role==="ceo"?1:0,"/api/photo?id="+x.photoId+"&t=1"])});
  (o.dailyNotes||[]).forEach(function(x){ev.push(["dn:"+x.id,"Daily note: "+x.name+(x.company?" ("+x.company+")":""),String(x.text||"").slice(0,160),"notes",0])});
  if(top)(((o.compliance||{}).hist)||[]).filter(function(x){return x.sent}).forEach(function(x){ev.push(["cr:"+x.id,"Report from Operations: "+x.name,"Open the War Room to read the PDF","reports",0])});
  (o.rewardNotices||[]).filter(function(x){return x.status==="open"}).forEach(function(x){ev.push(["rw:"+x.id,"Reward to collect: "+x.name,x.name+" ("+String(x.team||"").toUpperCase()+") must come and collect their reward","rewards",0])});
  if(top)(o.companyAwards||[]).filter(function(x){return !x.seen}).forEach(function(x){ev.push(["aw:"+x.key,"Best company of the "+x.kind,x.text||"","rewards",0])});
  (o.devBlocks||[]).forEach(function(x){ev.push(["db:"+x.id,"Login blocked: "+x.name+" ("+(x.company||"")+")","Tried "+(x.label||"another device")+". Saved device: "+((x.saved||[]).join(", ")||"-"),"security",0])});
  return ev}
/* only the alert types this role has switched on */
function tcsEventsFor(o,role){var c=tcsAlertCfg(o).cats;return tcsEvents(o,role).filter(function(e){return c[e[3]]&&c[e[3]][role]})}

export const TCS = { TCS_ALERT_CATS, tcsAlertCfg, tcsEvents, tcsEventsFor };
