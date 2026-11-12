function overlapsWeekend(e){let start=e.date<today()?today():e.date;let a=new Date(start+"T12:00:00Z"),b=new Date((e.endDate||e.date)+"T12:00:00Z");for(let i=0;i<7&&a<=b;i++,a.setUTCDate(a.getUTCDate()+1)){if([0,6].includes(a.getUTCDay()))return true}return false}
// Use actual library signals and known Oakland branch names; a business with
// "Branch" in its name is not automatically a library.
const OPL_BRANCH=/\b(?:81st Avenue|Asian|Brookfield|(?:C[eé]sar(?:\s+E\.)?\s+)?Ch[aá]vez|Dimond|Eastmont|Elmhurst|Fruitvale|Golden Gate|Lakeview|Martin (?:Luther |L\. )?King(?:,?\s*Jr\.?)?|Melrose|Montclair|Piedmont(?: Avenue)?|Rockridge|Temescal|West Oakland)\s+Branch\b/i;
const BERKELEY_BRANCH=/\b(?:(?:West|North|Claremont|South|Tarea Hall Pittman South)\s+Branch|1125\s+University\s+(?:Ave(?:nue)?\.?|Avenue)|1170\s+(?:The\s+)?Alameda|2090\s+Kittredge|2940\s+Benvenue|1901\s+Russell)\b/i;
function allowedLibrary(e){
 const venue=e.venue||'',source=e.source||'';
 let host='';try{host=new URL(e.url).hostname.toLowerCase()}catch{}
 const library=/\blibrar(?:y|ies)\b/i.test(venue+' '+source)||OPL_BRANCH.test(venue)||(e.city==='San Leandro'&&/\bManor Branch\b/i.test(venue))||(e.city==='Berkeley'&&BERKELEY_BRANCH.test(venue))||e.source_id==='opl'||host==='berkeleypubliclibrary.org'||host.endsWith('.berkeleypubliclibrary.org')||host.endsWith('.bibliocommons.com')||host.endsWith('.libnet.info');
 return !library||/\bTemescal\b/i.test(venue);
}
let seed=[], sourceStatuses=[], guides=[], feedInfo=null, collectionSummary=null, collectionRunAt=null, collectionCached=false, collectionHistory=[];
function allowedSource(e){return e.source_id!=='bn'&&!/(^|\.)barnesandnoble\.com$/i.test((()=>{try{return new URL(e.url).hostname}catch{return ''}})())}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}const storedCustom=read('lw-events',[]),storedSaved=read('lw-saved',[]);let custom=Array.isArray(storedCustom)?storedCustom.map(sanitizeStoredEvent).filter(Boolean):[],saved=new Set(Array.isArray(storedSaved)?storedSaved.filter(id=>typeof id==='string'):[]),view='discover',period='all';const all=()=>allEvents();function persist(){try{localStorage.setItem('lw-saved',JSON.stringify([...saved]));localStorage.setItem('lw-events',JSON.stringify(custom));localStorage.setItem('lw-plan-status',JSON.stringify(planStates));localStorage.setItem('lw-plan-snapshots',JSON.stringify(planSnapshots));localStorage.setItem('lw-plan-alerts',JSON.stringify(planAlerts));localStorage.setItem('lw-hidden',JSON.stringify([...hiddenIds]))}catch{toast('Browser storage unavailable; changes may not persist.')}}function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3000)}function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}function weekend(offset=0){let d=new Date(today()+'T12:00:00Z'),day=d.getUTCDay();d.setUTCDate(d.getUTCDate()+(day===0?-1:(6-day+7)%7)+offset*7);let e=new Date(d);e.setUTCDate(d.getUTCDate()+1);return[d.toISOString().slice(0,10),e.toISOString().slice(0,10)]}function horizonEnd(){const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+59);return d.toISOString().slice(0,10)}function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}function clock(t){let[h,m]=t.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h>=12?'pm':'am'}`}function range(e){if(e.endDate)return e.hoursLabel||'Check daily hours';return e.end?clock(e.start)+'–'+clock(e.end):'Starts '+clock(e.start)}function safeUrl(s){try{let u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return '#'}}
const storedHidden=read('lw-hidden',[]);
let hiddenIds=new Set(Array.isArray(storedHidden)?storedHidden:[]);
const PLAN_STATES=Object.freeze({interested:'Interested',register:'Need to register',booked:'Booked'});
let planStates=read('lw-plan-status',{}),planSnapshots=read('lw-plan-snapshots',{}),planAlerts=read('lw-plan-alerts',{}),selectedWeekend='';
if(!planStates||Array.isArray(planStates)||typeof planStates!=='object')planStates={};
if(!planSnapshots||Array.isArray(planSnapshots)||typeof planSnapshots!=='object')planSnapshots={};
if(!planAlerts||Array.isArray(planAlerts)||typeof planAlerts!=='object')planAlerts={};
for(const [id,event] of Object.entries(planSnapshots)){const clean=sanitizeStoredEvent(event);if(!clean||clean.id!==id)delete planSnapshots[id];else planSnapshots[id]=clean}
for(const [id,alerts] of Object.entries(planAlerts))if(!Array.isArray(alerts)||alerts.some(a=>typeof a!=='string'))delete planAlerts[id];
const seenAtOpen=read('lw-seen-events',null);
let visitSeen=Array.isArray(seenAtOpen)?new Set(seenAtOpen):null;
function pacificClock(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const part=type=>parts.find(x=>x.type===type)?.value;
 return part('hour')+':'+part('minute');
}
function hasEnded(event,currentDate=today(),currentTime=pacificClock()){
 if(!event.end)return false; // An unknown end time must not be invented.
 if(event.endDate&&(event.ongoing??true))return false; // Daily closing hours are unknown.
 const endDate=event.endDate||event.date;
 return endDate<currentDate||(endDate===currentDate&&event.end<=currentTime);
}
function statusFor(id){return Object.hasOwn(planStates,id)&&Object.hasOwn(PLAN_STATES,planStates[id])?planStates[id]:'interested'}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
function weekendFor(value){
 if(!validDate(value))throw Error('Choose a valid date.');
 const start=new Date(value+'T12:00:00Z'),day=start.getUTCDay();
 start.setUTCDate(start.getUTCDate()+(day===0?-1:(6-day+7)%7));
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
 return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)];
}
function chooseWeekend(value){
 try{selectedWeekend=weekendFor(value)[0];$('#weekend-date').value=selectedWeekend;period='chosen';view='discover';render()}
 catch(e){toast(e.message)}
}
function isNew(e){return !e.saved_copy&&visitSeen!==null&&!visitSeen.has(e.id)&&!(e.alternate_ids||[]).some(id=>visitSeen.has(id))}
const PREFERRED_CITIES=['Oakland','Emeryville','Berkeley','Albany','Alameda','El Cerrito','San Leandro','Castro Valley'];
const PREFERRED_ACTIVITIES=['Art & crafts','Stories & play','Celebrations','Building'];
const storedPreferences=read('lw-recommendations',{});
let preferences={enabled:storedPreferences?.enabled===true,
 city:PREFERRED_CITIES.includes(storedPreferences?.city)?storedPreferences.city:'',
 activity:PREFERRED_ACTIVITIES.includes(storedPreferences?.activity)?storedPreferences.activity:'',
 age:['4','6','both'].includes(storedPreferences?.age)?storedPreferences.age:''};
function scoreEvent(e,p=preferences){
 let score=0;const reasons=[];
 if(p.city&&e.city===p.city){score+=4;reasons.push('Preferred city')}
 if(p.activity&&e.cat===p.activity){score+=2;reasons.push('Preferred activity')}
 if(p.age&&Number.isInteger(e.min)&&Number.isInteger(e.max)){
  const ages=p.age==='both'?[4,6]:[Number(p.age)];
  if(ages.every(age=>e.min<=age&&e.max>=age)){score+=2;reasons.push(p.age==='both'?'Fits ages 4 and 6':'Fits age '+p.age)}
  else{score=Math.max(0,score-4);reasons.push('Listed ages exclude one or more selected ages (up to −4)')}
 }
 return {score,reasons,ageUnknown:Boolean(p.age&&(e.min==null||e.max==null))};
}
function recommendationHTML(e){
 if(!preferences.enabled)return '';
 const result=scoreEvent(e),why=result.reasons.length?result.reasons.join(' · '):(!preferences.city&&!preferences.activity&&!preferences.age?'Choose preferences to see matches':'No preferences matched');
 return `<p class="recommendation-note"><strong>${result.score} points</strong> · ${esc(why)}${result.ageUnknown?' · Age range not listed':''}</p>`;
}
function updatePreferences(){
 preferences={enabled:$('#recommend-enabled').checked,city:$('#recommend-city').value,activity:$('#recommend-activity').value,age:$('#recommend-age').value};
 try{localStorage.setItem('lw-recommendations',JSON.stringify(preferences))}catch{toast('Browser storage unavailable; preferences may not persist.')}
 render();
}
function rememberSeen(){
 const current=seed.map(e=>e.id);
 if(visitSeen===null)visitSeen=new Set(current);
 try{const old=read('lw-seen-events',[]);localStorage.setItem('lw-seen-events',JSON.stringify([...new Set([...(Array.isArray(old)?old:[]),...current])].slice(-5000)))}catch{}
}
function syncSavedSnapshots(){
 const labels={date:'Date',endDate:'End date',start:'Start time',end:'End time',venue:'Venue',status:'Organizer status'};
 for(const event of [...seed,...custom])if(saved.has(event.id)){
  const old=planSnapshots[event.id];
  const oldTime=Date.parse(old?.checked_at),newTime=Date.parse(event.checked_at);
  // A cached older feed must not overwrite a newer saved snapshot.
  if(Number.isFinite(oldTime)&&Number.isFinite(newTime)&&newTime<oldTime)continue;
  if(old){
   const changes=Object.entries(labels).filter(([field])=>(old[field]??'')!==(event[field]??''))
    .map(([field,label])=>`${label}: ${old[field]||'Not listed'} → ${event[field]||'Not listed'}`);
   if(changes.length)planAlerts[event.id]=[...new Set([...(planAlerts[event.id]||[]),...changes])].slice(-20);
  }
  planSnapshots[event.id]={...event};
 }
 persist();
}
function alertHTML(event){
 const alerts=planAlerts[event.id]||[];
 if(!alerts.length)return '';
 return `<div class="plan-warning" role="status"><strong>Details changed since saved</strong><ul>${alerts.map(change=>`<li>${esc(change)}</li>`).join('')}</ul><button data-dismiss-change="${esc(event.id)}">Dismiss update</button></div>`;
}
function allEvents(){
 const current=[...seed,...custom].map(event=>{
  const snapshot=saved.has(event.id)?planSnapshots[event.id]:null;
  const oldTime=Date.parse(snapshot?.checked_at),newTime=Date.parse(event.checked_at);
  return Number.isFinite(oldTime)&&Number.isFinite(newTime)&&oldTime>newTime?{...snapshot,saved_copy:true}:event;
 }),ids=new Set(current.map(e=>e.id));
 const copies=Object.values(planSnapshots).filter(e=>e&&saved.has(e.id)&&!ids.has(e.id)&&allowedSource(e)&&(e.source==='Your discovery'||allowedLibrary(e))).map(e=>({...e,saved_copy:true}));
 return [...current,...copies].sort((a,b)=>Number(Boolean(a.ongoing??a.endDate))-Number(Boolean(b.ongoing??b.endDate))||(a.date+a.start).localeCompare(b.date+b.start));
}
function toggleSaved(id){
 if(saved.has(id)){saved.delete(id);delete planStates[id];delete planSnapshots[id];delete planAlerts[id]}
 else{const event=all().find(e=>e.id===id);if(!event)return;saved.add(id);planStates[id]='interested';planSnapshots[id]={...event}}
 persist();render();
}
function toggleHidden(id){
 if(!all().some(event=>event.id===id))return;
 if(hiddenIds.has(id))hiddenIds.delete(id);else hiddenIds.add(id);
 persist();render();
}
function setPlanStatus(id,status){if(!saved.has(id)||!Object.hasOwn(PLAN_STATES,status))return;planStates[id]=status;persist();render()}
function planConflicts(event,plans){
 if(event.endDate||!event.end)return [];
 return plans.filter(other=>other.id!==event.id&&!other.endDate&&other.end&&event.date===other.date&&event.start<other.end&&other.start<event.end);
}
function conflictHTML(e,plans){
 if(e.endDate)return e.ongoing===false?'<p class="plan-note">This event spans multiple dates; overlaps are not checked.</p>':'<p class="plan-note">Choose a visit day; ongoing activities are not checked for overlaps.</p>';
 if(!e.end)return '<p class="plan-note">End time unknown; check timing with your other plans.</p>';
 const conflicts=planConflicts(e,plans);
 return conflicts.length?`<p class="plan-warning">Listed times overlap with ${conflicts.map(other=>esc(other.title)).join(', ')}. Check timing before booking.</p>`:'';
}
function directionsUrl(e){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(e.venue+', '+e.city+', CA')}
function statusSelect(e){return `<label class="plan-status-label">Plan status<select data-plan-status="${esc(e.id)}" aria-label="Plan status for ${esc(e.title)}">${Object.entries(PLAN_STATES).map(([value,label])=>`<option value="${value}" ${statusFor(e.id)===value?'selected':''}>${label}</option>`).join('')}</select></label>`}
function downloadFile(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function backupPayload(){
 const events=new Map(all().map(e=>[e.id,e]));
 return {format:'little-weekends-plans',version:1,exported_at:new Date().toISOString(),saved:[...saved].map(id=>({id,status:statusFor(id),event:events.get(id)||null})),custom,hidden_ids:[...hiddenIds],plan_alerts:Object.fromEntries([...saved].filter(id=>planAlerts[id]?.length).map(id=>[id,planAlerts[id]]))};
}
function cleanBackupEvent(e){
 const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(id);
 const timeOK=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
 if(!e||typeof e!=='object'||!idOK(e.id)||!validDate(e.date)||!timeOK(e.start)||(e.end!==null&&!timeOK(e.end))||safeUrl(e.url)==='#')throw Error('Backup contains an invalid event.');
 for(const field of ['title','city','venue','price','cat','source','status','desc'])if(typeof e[field]!=='string'||e[field].length>3000)throw Error('Backup contains invalid event details.');
 if(!e.title||!e.city||!e.venue)throw Error('Backup event details are incomplete.');
 if(e.endDate?!validDate(e.endDate)||e.endDate<e.date:e.end!==null&&e.end<=e.start)throw Error('Backup event times are invalid.');
 const lo=e.min??null,hi=e.max??null;
 if((lo===null)!==(hi===null)||lo!==null&&(!Number.isInteger(lo)||!Number.isInteger(hi)||lo<0||hi>99||lo>hi))throw Error('Backup age range is invalid.');
 const clean={id:e.id,title:e.title,date:e.date,start:e.start,end:e.end,city:e.city,venue:e.venue,price:e.price,min:lo,max:hi,cat:e.cat,source:e.source,status:e.status,desc:e.desc,url:safeUrl(e.url)};
 for(const field of ['source_id','icon','color','hoursLabel'])if(typeof e[field]==='string')clean[field]=e[field].slice(0,250);
 if(e.endDate)clean.endDate=e.endDate;
 if(typeof e.ongoing==='boolean')clean.ongoing=e.ongoing;
 if(Number.isFinite(Date.parse(e.checked_at)))clean.checked_at=e.checked_at;
 if(typeof e.stale==='boolean')clean.stale=e.stale;
 return clean;
}
function sanitizeStoredEvent(event){
 try{cleanBackupEvent(event)}catch{return null}
 // Preserve useful saved details while discarding damaged optional metadata.
 const clean={...event};
 if(clean.alternate_ids!==undefined)clean.alternate_ids=Array.isArray(clean.alternate_ids)?clean.alternate_ids.filter(id=>typeof id==='string'&&id):[];
 if(clean.listings!==undefined)clean.listings=Array.isArray(clean.listings)?clean.listings.filter(item=>item&&typeof item.source_id==='string'&&typeof item.source==='string'&&safeUrl(item.url)!=='#'):[];
 return clean;
}
// Another tab can change plans while this tab is open. Refresh from storage
// before a later click can write an obsolete copy over those changes.
function refreshFromOtherTab(event){
 const keys=['lw-events','lw-saved','lw-plan-status','lw-plan-snapshots','lw-plan-alerts','lw-hidden'];
 if(event.storageArea&&event.storageArea!==localStorage)return;
 if(event.key!==null&&!keys.includes(event.key))return;
 const events=read('lw-events',[]),ids=read('lw-saved',[]),statuses=read('lw-plan-status',{}),snapshots=read('lw-plan-snapshots',{}),alerts=read('lw-plan-alerts',{}),hidden=read('lw-hidden',[]);
 custom=Array.isArray(events)?events.map(sanitizeStoredEvent).filter(Boolean):[];
 saved=new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[]);
 planStates=statuses&&!Array.isArray(statuses)&&typeof statuses==='object'?statuses:{};
 planSnapshots={};
 if(snapshots&&!Array.isArray(snapshots)&&typeof snapshots==='object')for(const [id,value] of Object.entries(snapshots)){const clean=sanitizeStoredEvent(value);if(clean&&clean.id===id)planSnapshots[id]=clean}
 planAlerts={};
 if(alerts&&!Array.isArray(alerts)&&typeof alerts==='object')for(const [id,value] of Object.entries(alerts))if(Array.isArray(value)&&value.every(item=>typeof item==='string'))planAlerts[id]=value;
 hiddenIds=new Set(Array.isArray(hidden)?hidden.filter(id=>typeof id==='string'):[]);
 migrateSavedIds();render();
}
if(typeof window!=='undefined')window.addEventListener('storage',refreshFromOtherTab);
function restorePlans(text){
 // Validate the entire file before changing any existing browser plans.
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Choose a backup smaller than 2 MB.');
 const data=JSON.parse(text);
 if(!data||data.format!=='little-weekends-plans'||data.version!==1||!Array.isArray(data.saved)||!Array.isArray(data.custom)||data.saved.length>1000||data.custom.length>500)throw Error('This is not a supported Little Weekends backup.');
 const backupHidden=data.hidden_ids??[];
 if(!Array.isArray(backupHidden)||backupHidden.length>5000||backupHidden.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(id)))throw Error('Backup contains invalid hidden IDs.');
 const backupAlerts=data.plan_alerts??{};
 if(!backupAlerts||typeof backupAlerts!=='object'||Array.isArray(backupAlerts)||Object.keys(backupAlerts).length>1000||Object.entries(backupAlerts).some(([id,values])=>!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(id)||!Array.isArray(values)||values.length>20||values.some(x=>typeof x!=='string'||x.length>1000)))throw Error('Backup contains invalid plan updates.');
 const cleanSaved=data.saved.map(item=>{
  if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(item.id)||!Object.hasOwn(PLAN_STATES,item.status))throw Error('Backup contains an invalid saved plan.');
  const event=item.event===null?null:cleanBackupEvent(item.event);
  if(event&&event.id!==item.id)throw Error('Backup plan IDs do not match.');
  return {id:item.id,status:item.status,event};
 });
 const cleanCustom=data.custom.map(cleanBackupEvent);
 if(cleanCustom.some(e=>e.source!=='Your discovery'))throw Error('Backup personal events have an invalid source.');
 const ids=new Set(custom.map(e=>e.id));
 for(const event of cleanCustom)if(!ids.has(event.id)&&allowedSource(event)){custom.push(event);ids.add(event.id)}
 let added=0;
 for(const item of cleanSaved){
  if(item.event&&!allowedSource(item.event))continue;
  if(!saved.has(item.id)){saved.add(item.id);planStates[item.id]=item.status;added++}
  if(item.event&&!Object.hasOwn(planSnapshots,item.id))planSnapshots[item.id]=item.event;
 }
 for(const id of backupHidden)hiddenIds.add(id);
 for(const [id,alerts] of Object.entries(backupAlerts))if(saved.has(id)&&!planAlerts[id])planAlerts[id]=alerts;
 migrateSavedIds();syncSavedSnapshots();persist();view='saved';render();return added;
}

function hoursSince(value){const t=Date.parse(value);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):Infinity}
function checkedLabel(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT':'Not recorded'}
function eventFreshness(e){
 if(e.saved_copy)return {label:'Saved copy · verify details with organizer',old:true};
 if(e.source==='Your discovery')return {label:'Added by you · check organizer',old:false};
 const age=hoursSince(e.checked_at),old=Boolean(e.stale)||age>168;
 return {label:age===Infinity?'Check date unknown':(old?'Recheck · last checked ':'Checked ')+checkedLabel(e.checked_at),old};
}
function readyToPlan(e){return !eventFreshness(e).old&&!/confirm|registration closed|full(?:\s|$)|older listing/i.test(e.status||'')}
function sourceHealth(s){
 if(s.mode==='manual')return {label:'Hand-checked listings',attention:false};
 if(s.state==='error')return {label:'Refresh failed',attention:true};
 if(hoursSince(s.last_success)>48)return {label:s.last_success?'Update overdue':'Not refreshed',attention:true};
 if(s.state!=='ok')return {label:'Not refreshed this run',attention:true};
 return {label:s.kind==='articles'?'RSS · '+s.count+' guides':s.count===0?'No matching events found':'Refreshed · '+s.count+' found',attention:false};
}
function migrateSavedIds(){
 let changed=false;
 const rank={interested:0,register:1,booked:2};
 for(const event of seed)for(const id of event.alternate_ids||[]){
  if(id===event.id)continue;
  if(saved.has(id)){
   const status=statusFor(id);
   if(rank[status]>rank[statusFor(event.id)])planStates[event.id]=status;
   if(!planSnapshots[event.id]&&planSnapshots[id])planSnapshots[event.id]={...planSnapshots[id],id:event.id};
   if(planAlerts[id])planAlerts[event.id]=[...new Set([...(planAlerts[event.id]||[]),...planAlerts[id]])].slice(-20);
   saved.delete(id);saved.add(event.id);delete planStates[id];delete planSnapshots[id];delete planAlerts[id];changed=true;
  }
  if(hiddenIds.has(id)){hiddenIds.delete(id);hiddenIds.add(event.id);changed=true}
 }
 if(changed)persist();
}
function listingLinks(e){
 const others=(e.listings||[]).filter(l=>l.source_id!==e.source_id||safeUrl(l.url)!==safeUrl(e.url));
 if(!others.length)return '';
 return '<details class="listing-links"><summary>Also listed by '+others.length+' '+(others.length===1?'source':'sources')+'</summary>'+others.map(l=>`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.source)} ↗</a>`).join('')+'</details>';
}
function renderEventGroups(events, dates, card){
 if(!events.length)return view==='saved'?'<div class="empty">No saved events with available details.</div>':'<div class="empty">No matching events in this collection.<br>Try another date range, clear a filter, or turn on Show hidden events.</div>';
 if(view==='saved')return events.map(card).join('');
 const dated=events.filter(e=>!e.ongoing&&!e.endDate),ongoing=events.filter(e=>e.ongoing||e.endDate);
 const grouped=new Map();
 for(const event of dated){if(!grouped.has(event.date))grouped.set(event.date,[]);grouped.get(event.date).push(event)}
 // For one selected weekend, keep both days visible even if a day is empty.
 const days=period==='all'?[...grouped.keys()].sort():dates;
 const sections=days.map(day=>{
  const label=new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric',year:'numeric'});
  const items=grouped.get(day)||[];
  return `<h3 class="day-heading">${esc(label)}</h3>`+(items.length?items.map(card).join(''):'<p class="empty-day">No matching events this day.</p>');
 }).join('');
 return sections+(ongoing.length?'<h3 class="day-heading">Ongoing &amp; multi-day activities</h3>'+ongoing.map(card).join(''):'');
}
function renderDigest(){
 const [sat,sun]=weekend(),now=today(),time=pacificClock();
 const first=now>sat?now:sat;
 const events=seed.filter(e=>e.price==='Free'&&!hiddenIds.has(e.id)&&(e.endDate||e.date)>=first&&e.date<=sun&&!hasEnded(e,now,time))
  .sort((a,b)=>Number(Boolean(a.ongoing??a.endDate))-Number(Boolean(b.ongoing??b.endDate))||(a.date+a.start).localeCompare(b.date+b.start));
 const label=`${dateLabel(sat)}–${dateLabel(sun)}`;
 const notice=collectionCached?'Showing the last saved collection. ':'';
 if(!collectionRunAt){$('#digest-content').innerHTML='<p>Load the event collection to preview your weekend.</p>';return}
 if(!events.length){$('#digest-content').innerHTML=`<p>${esc(notice)}No visible free events for ${esc(label)} in this collection. Hidden events are excluded; check Sources for coverage.</p>`;return}
 const shown=events.slice(0,8);
 $('#digest-content').innerHTML=`<p>${esc(notice)}${events.length} free ${events.length===1?'event':'events'} for ${esc(label)}${events.length>shown.length?' · showing the first '+shown.length:''}. Hidden events are excluded; other filters do not apply.</p><ul>${shown.map(e=>`<li><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${esc(e.title)} ↗</a><span>${esc(e.endDate?'Through '+dateLabel(e.endDate):dateLabel(e.date))} · ${esc(range(e))} · ${esc(e.city)}</span><span>${esc(e.venue)} · ${esc(eventFreshness(e).label)}</span></li>`).join('')}</ul><p>Preview only—no email is sent. Check the organizer before attending.</p>`;
}
function render(){let dates=period==='chosen'&&selectedWeekend?weekendFor(selectedWeekend):weekend(period==='next'?1:0);let events=all().filter(e=>view==='saved'?saved.has(e.id):e.saved_copy?false:period==='all'?(e.endDate||e.date)>=today()&&e.date<=horizonEnd():(e.endDate||e.date)>=(dates[0]<today()?today():dates[0])&&e.date<=dates[1]);const q=$('#search').value.toLowerCase(),age=$('#age').value;if(view!=='saved'){const currentDate=today(),currentTime=pacificClock();events=events.filter(e=>!hasEnded(e,currentDate,currentTime)&&(view==='saved'||$('#show-hidden').checked||!hiddenIds.has(e.id))&&(view==='saved'||!$('#new-only').checked||isNew(e))&&(view==='saved'||!$('#weekends-only').checked||overlapsWeekend(e))&&(view==='saved'||$('#include-unconfirmed').checked||readyToPlan(e))&&(!q||[e.title,e.venue,e.city,e.source].join(' ').toLowerCase().includes(q))&&(!$('#city').value||e.city===$('#city').value)&&(!$('#cost').value||e.price==='Free')&&(!$('#category').value||e.cat===$('#category').value)&&(!age||(e.min!==null&&e.max!==null&&(age==='both'?e.min<=4&&e.max>=6:e.min<=Number(age)&&e.max>=Number(age)))));}
if(view==='discover'&&preferences.enabled)events.sort((a,b)=>scoreEvent(b).score-scoreEvent(a).score);
renderDigest();
$('#discover-filters').classList.toggle('hide',view==='saved');
$('.digest-panel').classList.toggle('hide',view!=='discover');
$('#heading').textContent=view==='saved'?'Your saved outings':period==='all'?'Next 60 days':dateLabel(dates[0])+'–'+dateLabel(dates[1]);$('#result-count').textContent=events.length+' events · Pacific time';$('#count').textContent=saved.size?'('+saved.size+')':'';const newCount=seed.filter(e=>isNew(e)&&(e.endDate||e.date)>=today()).length;$('#new-count').textContent=newCount?newCount+' new since your last visit':'New listings will be marked here after your next visit.';$('#cards').innerHTML=renderEventGroups(events,dates,e=>`<article class="card"><div class="visual" style="background:${/^#[a-f0-9]{6}$/i.test(e.color||'')?e.color:'#e5eadd'}"><span class="symbol" aria-hidden="true">${esc(e.icon||'✳')}</span><div class="datebox">${e.endDate?'UNTIL':new Date(e.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'}).toUpperCase()}<strong>${e.endDate?esc(dateLabel(e.endDate)):Number(e.date.slice(-2))}</strong></div><button class="save ${saved.has(e.id)?'on':''}" data-save="${esc(e.id)}" aria-label="${saved.has(e.id)?'Unsave':'Save'} ${esc(e.title)}" aria-pressed="${saved.has(e.id)}">${saved.has(e.id)?'♥':'♡'}</button></div><div class="content"><div class="meta">${esc(e.city)} &nbsp;·&nbsp; ${esc(range(e))}</div><h3>${esc(e.title)}</h3><p class="venue">${esc(e.venue)}</p><p class="desc">${esc(e.desc)}</p>${view==='discover'?recommendationHTML(e):''}<div class="badges">${isNew(e)?'<span class="badge new-badge">New since your last visit</span>':''}${saved.has(e.id)?`<span class="badge">${esc(PLAN_STATES[statusFor(e.id)])}</span>`:''}${planAlerts[e.id]?.length?'<span class="badge update-badge">Details changed · see My plans</span>':''}<span class="badge ${e.price==='Free'?'free':''}">${esc(e.price)}</span><span class="badge">${e.min===null?'Age range not listed':e.max===99?(e.min===0?'All ages':'Ages '+e.min+'+'):'Ages '+e.min+'–'+e.max}</span></div><div class="cardfoot"><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${esc(e.source)} ↗</a><span class="status">${esc(eventFreshness(e).old?'Older listing · recheck':e.status)}</span></div><p class="checked ${eventFreshness(e).old?'old':''}">${esc(eventFreshness(e).label)}</p>${listingLinks(e)}<button class="card-calendar" data-calendar="${esc(e.id)}" aria-label="Add ${esc(e.title)} to calendar">+ Calendar</button><button class="hide-event" data-hide="${esc(e.id)}" aria-label="${hiddenIds.has(e.id)?'Restore':'Hide'} ${esc(e.title)}">${hiddenIds.has(e.id)?'Restore event':'Hide event'}</button><a class="directions" href="${esc(directionsUrl(e))}" target="_blank" rel="noopener noreferrer">Directions ↗</a></div></article>`);
const plans=all().filter(e=>saved.has(e.id));
$('#plan').innerHTML=plans.map(e=>`<div class="planitem"><span class="small">${e.endDate?'Through '+dateLabel(e.endDate):dateLabel(e.date)} · ${esc(range(e))}</span><strong>${esc(e.title)}</strong><span class="small">${esc(e.city)} · ${esc(eventFreshness(e).label)}</span>${statusSelect(e)}${alertHTML(e)}${conflictHTML(e,plans)}<div class="plan-links"><a href="${esc(directionsUrl(e))}" target="_blank" rel="noopener noreferrer">Directions ↗</a><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">Organizer / registration ↗</a></div><button data-calendar="${esc(e.id)}">+ Calendar</button><button data-save="${esc(e.id)}" aria-label="Remove ${esc(e.title)}">Remove</button></div>`).join('')||'<div class="empty-plan">♡ Your next adventure starts with a save.</div>';
const available=new Set(plans.map(e=>e.id)),missing=[...saved].filter(id=>!available.has(id));
if(missing.length){
 const notice=`<div class="plan-warning"><strong>Saved event details unavailable</strong><p>${missing.length} saved ${missing.length===1?'event is':'events are'} missing details on this browser. The listing may have been removed or its saved copy may be unavailable. You can keep ${missing.length===1?'it':'them'} in case details return, or remove ${missing.length===1?'it':'them'} below.</p>${missing.map(id=>`<button data-remove-missing="${esc(id)}">Remove unavailable saved event</button>`).join('')}</div>`;
 $('#plan').innerHTML+=notice;
 if(view==='saved')$('#cards').innerHTML+=notice;
}
$('#export').disabled=!plans.length;
$('#sources-view').classList.toggle('hide',view!=='sources');$('#discovery').classList.toggle('hide',view==='sources');$('#aside').classList.toggle('hide',view==='sources');document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===period));}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
// RFC 5545 limits content lines to 75 UTF-8 octets, including the continuation space.
function foldCalendarLine(line){let result='',part='',bytes=0,limit=75;for(const ch of line){const size=new Blob([ch]).size;if(bytes+size>limit){result+=part+'\r\n ';part='';bytes=0;limit=74}part+=ch;bytes+=size}return result+part}
function chooseVisitDate(event){
 return new Promise(resolve=>{
  const modal=$('#visit-modal'),input=$('#visit-date'),form=$('#visit-form');
  const earliest=today()<=event.endDate&&today()>event.date?today():event.date;
  input.min=earliest;input.max=event.endDate;
  const dates=period==='chosen'&&selectedWeekend?weekendFor(selectedWeekend):weekend(period==='next'?1:0);
  const preferred=dates[0]>earliest?dates[0]:earliest;
  input.value=view==='discover'&&period!=='all'&&preferred<=dates[1]&&preferred<=event.endDate?preferred:earliest;
  $('#visit-title').textContent=event.title;
  $('#visit-error').textContent='';
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;modal.close();resolve(value)};
  form.onsubmit=e=>{e.preventDefault();const date=input.value;if(!validDate(date)||date<input.min||date>input.max){$('#visit-error').textContent='Choose a date within the event dates.';return}finish(date)};
  $('#visit-cancel').onclick=()=>finish(null);
  modal.oncancel=e=>{e.preventDefault();finish(null)};
  modal.showModal();
 });
}
function needsVisitDay(event){return Boolean(event.endDate&&(event.ongoing??true))}
let calendarInProgress=false;
async function calendar(events){
 if(!events.length||calendarInProgress)return;
 calendarInProgress=true;
 try{
  const visitDates=new Map();
  for(const event of events)if(needsVisitDay(event)){const day=await chooseVisitDate(event);if(!day)return;visitDates.set(event.id,day)}
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  let lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Little Weekends//East Bay//EN','CALSCALE:GREGORIAN','BEGIN:VTIMEZONE','TZID:America/Los_Angeles','BEGIN:STANDARD','DTSTART:19701101T020000','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','TZOFFSETFROM:-0700','TZOFFSETTO:-0800','TZNAME:PST','END:STANDARD','BEGIN:DAYLIGHT','DTSTART:19700308T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','TZOFFSETFROM:-0800','TZOFFSETTO:-0700','TZNAME:PDT','END:DAYLIGHT','END:VTIMEZONE'];
  for(const event of events){
   const visit=visitDates.get(event.id),day=visit?.replaceAll('-','');
   const next=visit?new Date(new Date(visit+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10).replaceAll('-',''):null;
   lines.push('BEGIN:VEVENT','UID:'+event.id+(visit?'-'+day:'')+'@littleweekends','DTSTAMP:'+stamp,
    ...(visit?['DTSTART;VALUE=DATE:'+day,'DTEND;VALUE=DATE:'+next]:['DTSTART;TZID=America/Los_Angeles:'+event.date.replaceAll('-','')+'T'+event.start.replace(':','')+'00',...(event.end?['DTEND;TZID=America/Los_Angeles:'+(event.endDate||event.date).replaceAll('-','')+'T'+event.end.replace(':','')+'00']:[])]),
    'SUMMARY:'+icsEscape(event.title),'LOCATION:'+icsEscape(event.venue+', '+event.city),'DESCRIPTION:'+icsEscape(event.desc+'\nCheck organizer: '+event.url),'URL:'+safeUrl(event.url),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');downloadFile(lines.map(foldCalendarLine).join('\r\n')+'\r\n','text/calendar;charset=utf-8','little-weekends.ics');
 }finally{calendarInProgress=false}
}
function sourceHTML(){return sourceStatuses.map(s=>{const health=sourceHealth(s);return `<div class="source"><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><small class="${health.attention?'needs-check':''}">${esc(health.label)}</small></div>`}).join('')}
function validSummary(s){return !!s&&typeof s==='object'&&['previous_count','current_count','added','removed_expired','removed_other','retained_unchecked'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.added<=s.current_count&&s.retained_unchecked<=s.current_count&&s.removed_expired+s.removed_other<=s.previous_count}
function validHistorySnapshot(row){
 if(!row||!Number.isFinite(Date.parse(row.generated_at))||!Number.isSafeInteger(row.event_count)||row.event_count<0||!Array.isArray(row.sources)||!row.sources.length)return false;
 if(row.sources.some(s=>!s||typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name||!['events','guides'].includes(s.unit)||!['ok','error','not_run'].includes(s.state)||(s.state==='ok'?(!Number.isSafeInteger(s.count)||s.count<0):s.count!==null)))return false;
 return new Set(row.sources.map(s=>s.id)).size===row.sources.length;
}
function pacificDay(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
function sourceChanges(history){
 const rows=history.filter(validHistorySnapshot).slice().sort((a,b)=>Date.parse(a.generated_at)-Date.parse(b.generated_at));
 if(!rows.length)return {alerts:[],compared:0};
 const current=rows.at(-1),currentTime=Date.parse(current.generated_at),currentDay=pacificDay(current.generated_at),alerts=[];
 let compared=0;
 for(const source of current.sources){
  if(source.state!=='ok')continue;
  const days=new Map();
  for(const row of rows.slice(0,-1).reverse()){
   const time=Date.parse(row.generated_at),day=pacificDay(row.generated_at);
   if(time>=currentTime||day>=currentDay||days.has(day))continue;
   const prior=row.sources.find(s=>s.id===source.id&&s.unit===source.unit&&s.state==='ok');
   if(prior)days.set(day,prior.count);
   if(days.size===7)break;
  }
  if(days.size<3)continue;
  compared++;
  const values=[...days.values()].sort((a,b)=>a-b),mid=Math.floor(values.length/2);
  const typical=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
  if(typical>=6&&source.count<=typical/2&&typical-source.count>=3)alerts.push({name:source.name,count:source.count,unit:source.unit,typical,days:values.length});
 }
 return {alerts,compared};
}
function sourceChangesHTML(){
 const {alerts,compared}=sourceChanges(collectionHistory);
 const details='Compares the latest successful scan with the median of up to 7 previous days with successful scans. Alerts need at least 3 prior days, a typical count of 6 or more, and a drop of at least half and 3 listings.';
 const content=alerts.length?`<ul>${alerts.map(a=>`<li><strong>${esc(a.name)}</strong>: ${a.count} ${esc(a.unit)} found; typical count was ${a.typical} across ${a.days} previous days. The scan succeeded—check the source for changes.</li>`).join('')}</ul>`:compared?'<p>No unusual drops detected among sources with enough history.</p>':'<p>Not enough previous successful scan days to compare yet.</p>';
 return `<section class="change-panel"><h2>Unusual changes</h2><p>${compared} ${compared===1?'source has':'sources have'} enough history to compare. Refresh failures appear in the source statuses below.</p>${content}<p>${details} A change is a prompt to investigate, not proof of a problem.</p></section>`;
}
function historyHTML(){
 if(!collectionHistory.length)return '<section class="history-panel"><h2>Collection history</h2><p>No history is available yet. It will appear after a collection run.</p></section>';
 const rows=[...collectionHistory].reverse();
 const cards=items=>items.map(row=>`<div class="history-run"><strong>${esc(checkedLabel(row.generated_at))}</strong><span>${row.event_count} published events</span><ul>${row.sources.map(s=>`<li><span>${esc(s.name)}</span><strong class="${s.state==='error'?'needs-check':''}">${s.state==='error'?'Refresh failed':s.state==='not_run'?'Not scanned':s.count+' '+esc(s.unit)}</strong></li>`).join('')}</ul></div>`).join('');
 return `<section class="history-panel"><h2>Collection history</h2><p>Up to 30 recent runs, newest first. Counts are matches before deduplication; 510 Families counts guides. A successful scan with zero matches is not a failed scan.</p><div class="history-list">${cards(rows.slice(0,4))}</div>${rows.length>4?`<details class="history-more"><summary>Show ${rows.length-4} older runs</summary><div class="history-list">${cards(rows.slice(4))}</div></details>`:''}</section>`;
}
function collectionDashboard(){
 const s=collectionSummary;
 if(!validSummary(s))return `<div class="quality-panel"><h2>Collection dashboard</h2>${collectionCached?'<p class="plan-warning">Showing a saved collection because the latest update could not be loaded.</p>':''}<p>Run-to-run counts will appear after the next collection. The source results below remain available.</p></div>`;
 const metrics=[['Published events',s.current_count],['New to feed',s.added],['Past events removed',s.removed_expired],['Other removals',s.removed_other],['Kept without recheck',s.retained_unchecked]];
 return `<div class="quality-panel"><h2>Collection dashboard</h2>${collectionCached?'<p class="plan-warning">Showing a saved collection because the latest update could not be loaded.</p>':''}<p>Latest run: ${esc(checkedLabel(collectionRunAt))} · Compared with ${s.previous_count} events in the previous feed.</p><div class="quality-metrics">${metrics.map(([label,count])=>`<div class="quality-metric"><strong>${count}</strong><span>${esc(label)}</span></div>`).join('')}</div><p>Past events removed is normal. Other removals can include cancellations, unavailable listings or changes in matching; they do not necessarily indicate a failure. Kept without recheck includes retained and manually maintained events. Counts compare event IDs and known aliases; merged listings can affect the comparison.</p></div>`;
}
function renderSources(){
 renderGuides();
 $('#source-list').innerHTML=sourceHTML();
 const auto=sourceStatuses.filter(s=>s.mode==='automatic'),attention=auto.filter(s=>sourceHealth(s).attention);
 $('#source-summary').textContent=auto.length?`${auto.length-attention.length} of ${auto.length} automatic sources up to date${attention.length?' · '+attention.length+' need attention':''}.`:'';
 $('#sources-view').innerHTML=collectionDashboard()+sourceChangesHTML()+historyHTML()+'<div class="source-panel"><h2>Your family event sources</h2><p>Automatic imports collect free family activities in Oakland and nearby East Bay cities, including San Leandro and Castro Valley. Additional calendars have hand-checked listings. A successful scan can find zero matches; it does not mean there are no events at the venue. Source counts are matches before duplicates are combined; RSS counts articles, not events.</p>'+sourceStatuses.map(s=>{const h=sourceHealth(s);const found=s.mode==='automatic'&&s.state==='ok'&&Number.isSafeInteger(s.count)&&s.count>=0?`${s.count} ${s.kind==='articles'?'guides':'events'} found in latest scan`:(s.mode==='automatic'?'No successful result for this scan':'Manually maintained');return `<div class="source"><div><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><p class="small source-note">${esc(found)}<br>${esc(s.note||'')}</p>${s.mode==='automatic'?`<p class="small source-note">Last successful scan: ${esc(checkedLabel(s.last_success))}<br>Last attempt: ${esc(checkedLabel(s.last_attempt))}</p>`:'<p class="small source-note">See individual events for their check dates. This source is not an automatic feed.</p>'}</div><small class="${h.attention?'needs-check':''}">${esc(h.label)}</small></div>`}).join('')+'<p class="notice">Saving here does not register you with an organizer. Plans and personally added events stay in this browser. Listing check dates do not guarantee availability.</p></div>';
}
function renderGuides(){
 const recent=guides.filter(g=>g&&g.source_id==='510'&&safeUrl(g.url)!=='#'&&hoursSince(g.checked_at)<=336&&hoursSince(g.published_at)<=720).slice(0,8);
 $('#guide-links').innerHTML=recent.map(g=>`<div class="guide"><a href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener noreferrer">${esc(g.title)} ↗</a><p class="small source-note">Article published ${esc(checkedLabel(g.published_at))}${hoursSince(g.checked_at)>168?' · Older cached guide':''}</p></div>`).join('')||'<p class="small source-note">No recent guide links available. Check the RSS source status for the latest attempt.</p>';
}
function validFeedEvent(e){
 const clock=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
 const text=k=>typeof e[k]==='string'&&e[k].length>0;
 if(!e||typeof e!=='object'||!['id','title','city','venue','source','source_id','price','status','cat'].every(text)||typeof e.desc!=='string')return false;
 if(!validDate(e.date)||!clock(e.start)||(e.end!==null&&!clock(e.end))||safeUrl(e.url)==='#')return false;
 if(e.endDate&&(!validDate(e.endDate)||e.endDate<e.date))return false;
 if(e.end!==null&&(!e.endDate||e.endDate===e.date)&&e.end<=e.start)return false;
 if(e.min===undefined||e.max===undefined||(e.min==null)!==(e.max==null))return false;
 if(e.min!=null&&(!Number.isInteger(e.min)||!Number.isInteger(e.max)||e.min<0||e.max>99||e.min>e.max))return false;
 if(e.alternate_ids!==undefined&&(!Array.isArray(e.alternate_ids)||e.alternate_ids.some(id=>typeof id!=='string')))return false;
 if(e.listings!==undefined&&(!Array.isArray(e.listings)||e.listings.some(l=>!l||typeof l.source_id!=='string'||typeof l.source!=='string'||safeUrl(l.url)==='#')))return false;
 return true;
}
function validFeed(feed){
 if(!feed||feed.schema_version!==1||!Number.isFinite(Date.parse(feed.generated_at))||!Array.isArray(feed.events)||!Array.isArray(feed.sources)||!feed.sources.length)return false;
 if(feed.guides!==undefined&&!Array.isArray(feed.guides))return false;
 if((feed.guides||[]).some(g=>!g||typeof g.title!=='string'||typeof g.source_id!=='string'||safeUrl(g.url)==='#'||!Number.isFinite(Date.parse(g.published_at))||!Number.isFinite(Date.parse(g.checked_at))))return false;
 if(feed.events.some(e=>!validFeedEvent(e))||new Set(feed.events.map(e=>e.id)).size!==feed.events.length)return false;
 if(feed.sources.some(s=>!s||typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name||safeUrl(s.url)==='#'||!['automatic','manual'].includes(s.mode)||!['ok','error','not_run','manual'].includes(s.state)))return false;
 return new Set(feed.sources.map(s=>s.id)).size===feed.sources.length;
}
async function loadFeed(){
 $('#feed-status').textContent='Loading the latest event collection…';
 $('#reload-feed').disabled=true;
 try{
  const response=await fetch('./data/events.json',{cache:'no-store'});
  if(!response.ok)throw Error('Feed unavailable');
  const feed=await response.json();if(!validFeed(feed))throw Error('Invalid feed');
  seed=feed.events.filter(e=>allowedLibrary(e)&&allowedSource(e));sourceStatuses=feed.sources.filter(s=>s.id!=='bn');guides=feed.guides||[];collectionSummary=validSummary(feed.collection_summary)?feed.collection_summary:null;collectionHistory=Array.isArray(feed.collection_history)?feed.collection_history.filter(validHistorySnapshot).slice(-30):[];collectionRunAt=feed.generated_at;collectionCached=false;migrateSavedIds();syncSavedSnapshots();
  const automatic=sourceStatuses.filter(s=>s.mode==='automatic'),attention=automatic.filter(s=>sourceHealth(s).attention);
  const overdue=hoursSince(feed.last_successful_collection)>48;
  $('#feed-status').textContent=`Updated ${checkedLabel(feed.generated_at)}. ${overdue?'Collection updates are overdue. ':''}${attention.length?attention.length+' automatic sources need attention: '+attention.map(s=>s.name).join(', ')+'. ':''}Each card shows its own check date; verify details with the organizer.`;
  renderSources();render();feedInfo=feed;
  // Replace the last known-good cache only after validation and rendering succeed.
  try{localStorage.setItem('lw-feed-cache',JSON.stringify(feed))}catch{}
  rememberSeen();
 }catch{
  const cached=read('lw-feed-cache',null),fallback=validFeed(cached)?cached:(validFeed(feedInfo)?feedInfo:null);
  if(fallback){seed=fallback.events.filter(e=>allowedLibrary(e)&&allowedSource(e));sourceStatuses=fallback.sources.filter(s=>s.id!=='bn');guides=fallback.guides||[];collectionSummary=validSummary(fallback.collection_summary)?fallback.collection_summary:null;collectionHistory=Array.isArray(fallback.collection_history)?fallback.collection_history.filter(validHistorySnapshot).slice(-30):[];collectionRunAt=fallback.generated_at;collectionCached=true;feedInfo=fallback;migrateSavedIds();syncSavedSnapshots();$('#feed-status').textContent='Showing the last collection saved on this browser. A new update could not be loaded; try again later.';renderSources();render();return}
  $('#feed-status').textContent='Could not load the event collection. Your saved data is still in this browser. Try refreshing the page. If you downloaded the project, serve the site folder with a local web server.';
  render();
 }finally{$('#reload-feed').disabled=false}
}
$('#reload-feed').onclick=loadFeed;
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.save)toggleSaved(b.dataset.save);if(b.dataset.removeMissing&&saved.has(b.dataset.removeMissing)&&!all().some(event=>event.id===b.dataset.removeMissing)){toggleSaved(b.dataset.removeMissing)}if(b.dataset.hide)toggleHidden(b.dataset.hide);if(b.dataset.dismissChange){delete planAlerts[b.dataset.dismissChange];persist();render()}if(b.dataset.nav){view=b.dataset.nav;render()}if(b.dataset.period){period=b.dataset.period;view='discover';render()}if(b.dataset.calendar)calendar(all().filter(x=>x.id===b.dataset.calendar))});['search','city','age','cost','category','include-unconfirmed','new-only','show-hidden'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));$('#add').onclick=()=>$('#modal').showModal();$('#cancel').onclick=()=>$('#modal').close();$('#export').onclick=()=>calendar(all().filter(e=>saved.has(e.id)));$('#form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.end<=d.start){toast('End time must be after start time.');return}if(!/^https?:\/\//i.test(d.url)){toast('Use an http or https source link.');return}const min=d.min===''?null:Number(d.min),max=d.max===''?null:Number(d.max);if((min===null)!==(max===null)||min!==null&&max<min){toast('Enter both age limits, with maximum at least minimum.');return}custom.push({...d,min,max,id:'custom-'+crypto.randomUUID(),source:'Your discovery',status:'Added by you',desc:'Personally added event. Check the source for current details.',icon:'✳',color:'#e5eadd'});saved.add(custom.at(-1).id);planStates[custom.at(-1).id]='interested';syncSavedSnapshots();persist();e.target.reset();$('#modal').close();view='saved';['search','city','age','cost','category'].forEach(id=>$('#'+id).value='');render();toast('Added to your plans.')};
$('#weekend-date').addEventListener('change',e=>{if(e.target.value)chooseWeekend(e.target.value)});
document.addEventListener('change',e=>{if(e.target.dataset?.planStatus)setPlanStatus(e.target.dataset.planStatus,e.target.value)});
$('#backup-plans').onclick=()=>downloadFile(JSON.stringify(backupPayload(),null,2),'application/json','little-weekends-plans-'+today()+'.json');
$('#restore-plans').onclick=()=>$('#restore-file').click();
$('#restore-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{if(file.size>2_000_000)throw Error('Choose a backup smaller than 2 MB.');const added=restorePlans(await file.text());toast('Restored '+added+' plans. Existing choices were kept.')}
 catch(error){toast(error instanceof SyntaxError?'That file is not valid JSON.':error.message)}
 finally{e.target.value=''}
});
$('#recommend-enabled').checked=preferences.enabled;$('#recommend-city').value=preferences.city;$('#recommend-activity').value=preferences.activity;$('#recommend-age').value=preferences.age;
['recommend-enabled','recommend-city','recommend-activity','recommend-age'].forEach(id=>$('#'+id).addEventListener('change',updatePreferences));
render();loadFeed();

$('#weekends-only').addEventListener('change',render);
