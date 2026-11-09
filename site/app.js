function overlapsWeekend(e){let start=e.date<today()?today():e.date;let a=new Date(start+"T12:00:00Z"),b=new Date((e.endDate||e.date)+"T12:00:00Z");for(let i=0;i<7&&a<=b;i++,a.setUTCDate(a.getUTCDate()+1)){if([0,6].includes(a.getUTCDay()))return true}return false}
function allowedLibrary(e){return !/\blibrary\b|\bbranch\b/i.test(e.venue||"")||/\bTemescal\b/i.test(e.venue||"")}
let seed=[], sourceStatuses=[], guides=[], feedInfo=null;
function allowedSource(e){return e.source_id!=='bn'&&!/(^|\.)barnesandnoble\.com$/i.test((()=>{try{return new URL(e.url).hostname}catch{return ''}})())}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}let custom=read('lw-events',[]),saved=new Set(read('lw-saved',[])),view='discover',period='weekend';const all=()=>allEvents();function persist(){try{localStorage.setItem('lw-saved',JSON.stringify([...saved]));localStorage.setItem('lw-events',JSON.stringify(custom));localStorage.setItem('lw-plan-status',JSON.stringify(planStates));localStorage.setItem('lw-plan-snapshots',JSON.stringify(planSnapshots))}catch{toast('Browser storage unavailable; changes may not persist.')}}function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3000)}function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}function weekend(offset=0){let d=new Date(today()+'T12:00:00Z'),day=d.getUTCDay();d.setUTCDate(d.getUTCDate()+(day===0?-1:(6-day+7)%7)+offset*7);let e=new Date(d);e.setUTCDate(d.getUTCDate()+1);return[d.toISOString().slice(0,10),e.toISOString().slice(0,10)]}function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}function clock(t){let[h,m]=t.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h>=12?'pm':'am'}`}function range(e){if(e.endDate)return e.hoursLabel||'Check daily hours';return e.end?clock(e.start)+'–'+clock(e.end):'Starts '+clock(e.start)}function safeUrl(s){try{let u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return '#'}}
const PLAN_STATES=Object.freeze({interested:'Interested',register:'Need to register',booked:'Booked'});
let planStates=read('lw-plan-status',{}),planSnapshots=read('lw-plan-snapshots',{}),selectedWeekend='';
if(!planStates||Array.isArray(planStates)||typeof planStates!=='object')planStates={};
if(!planSnapshots||Array.isArray(planSnapshots)||typeof planSnapshots!=='object')planSnapshots={};
const seenAtOpen=read('lw-seen-events',null);
let visitSeen=Array.isArray(seenAtOpen)?new Set(seenAtOpen):null;
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
function rememberSeen(){
 const current=seed.map(e=>e.id);
 if(visitSeen===null)visitSeen=new Set(current);
 try{const old=read('lw-seen-events',[]);localStorage.setItem('lw-seen-events',JSON.stringify([...new Set([...(Array.isArray(old)?old:[]),...current])].slice(-5000)))}catch{}
}
function syncSavedSnapshots(){
 for(const e of [...seed,...custom])if(saved.has(e.id))planSnapshots[e.id]={...e};
 persist();
}
function allEvents(){
 const current=[...seed,...custom],ids=new Set(current.map(e=>e.id));
 const copies=Object.values(planSnapshots).filter(e=>e&&saved.has(e.id)&&!ids.has(e.id)&&allowedSource(e)&&(e.source==='Your discovery'||allowedLibrary(e))).map(e=>({...e,saved_copy:true}));
 return [...current,...copies].sort((a,b)=>Number(Boolean(a.ongoing??a.endDate))-Number(Boolean(b.ongoing??b.endDate))||(a.date+a.start).localeCompare(b.date+b.start));
}
function toggleSaved(id){
 if(saved.has(id)){saved.delete(id);delete planStates[id];delete planSnapshots[id]}
 else{const event=all().find(e=>e.id===id);if(!event)return;saved.add(id);planStates[id]='interested';planSnapshots[id]={...event}}
 persist();render();
}
function setPlanStatus(id,status){if(!saved.has(id)||!Object.hasOwn(PLAN_STATES,status))return;planStates[id]=status;persist();render()}
function planConflicts(event,plans){
 if(event.endDate||!event.end)return [];
 return plans.filter(other=>other.id!==event.id&&!other.endDate&&other.end&&event.date===other.date&&event.start<other.end&&other.start<event.end);
}
function conflictHTML(e,plans){
 if(e.endDate)return '<p class="plan-note">Choose a visit day; ongoing activities are not checked for overlaps.</p>';
 if(!e.end)return '<p class="plan-note">End time unknown; check timing with your other plans.</p>';
 const conflicts=planConflicts(e,plans);
 return conflicts.length?`<p class="plan-warning">Listed times overlap with ${conflicts.map(other=>esc(other.title)).join(', ')}. Check timing before booking.</p>`:'';
}
function directionsUrl(e){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(e.venue+', '+e.city+', CA')}
function statusSelect(e){return `<label class="plan-status-label">Plan status<select data-plan-status="${esc(e.id)}" aria-label="Plan status for ${esc(e.title)}">${Object.entries(PLAN_STATES).map(([value,label])=>`<option value="${value}" ${statusFor(e.id)===value?'selected':''}>${label}</option>`).join('')}</select></label>`}
function downloadFile(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function backupPayload(){
 const events=new Map(all().map(e=>[e.id,e]));
 return {format:'little-weekends-plans',version:1,exported_at:new Date().toISOString(),saved:[...saved].map(id=>({id,status:statusFor(id),event:events.get(id)||null})),custom};
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
function restorePlans(text){
 // Validate the entire file before changing any existing browser plans.
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Choose a backup smaller than 2 MB.');
 const data=JSON.parse(text);
 if(!data||data.format!=='little-weekends-plans'||data.version!==1||!Array.isArray(data.saved)||!Array.isArray(data.custom)||data.saved.length>1000||data.custom.length>500)throw Error('This is not a supported Little Weekends backup.');
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
 for(const e of seed)for(const id of e.alternate_ids||[])if(saved.has(id)&&id!==e.id){
  const status=statusFor(id);
  if(rank[status]>rank[statusFor(e.id)])planStates[e.id]=status;
  saved.delete(id);saved.add(e.id);delete planStates[id];delete planSnapshots[id];changed=true;
 }
 if(changed)persist();
}
function listingLinks(e){
 const others=(e.listings||[]).filter(l=>l.source_id!==e.source_id||safeUrl(l.url)!==safeUrl(e.url));
 if(!others.length)return '';
 return '<details class="listing-links"><summary>Also listed by '+others.length+' '+(others.length===1?'source':'sources')+'</summary>'+others.map(l=>`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.source)} ↗</a>`).join('')+'</details>';
}
function render(){let dates=period==='chosen'&&selectedWeekend?weekendFor(selectedWeekend):weekend(period==='next'?1:0);let events=all().filter(e=>view==='saved'?saved.has(e.id):e.saved_copy?false:period==='all'?(e.endDate||e.date)>=today():(e.endDate||e.date)>=dates[0]&&e.date<=dates[1]);const q=$('#search').value.toLowerCase(),age=$('#age').value;events=events.filter(e=>(view==='saved'||!$('#new-only').checked||isNew(e))&&(view==='saved'||!$('#weekends-only').checked||overlapsWeekend(e))&&(view==='saved'||$('#include-unconfirmed').checked||readyToPlan(e))&&(!q||[e.title,e.venue,e.city,e.source].join(' ').toLowerCase().includes(q))&&(!$('#city').value||e.city===$('#city').value)&&(!$('#cost').value||e.price==='Free')&&(!$('#category').value||e.cat===$('#category').value)&&(!age||(e.min!==null&&e.max!==null&&(age==='both'?e.min<=4&&e.max>=6:e.min<=Number(age)&&e.max>=Number(age)))));
$('#heading').textContent=view==='saved'?'Your saved outings':period==='all'?'Good things on the horizon':dateLabel(dates[0])+'–'+dateLabel(dates[1]);$('#result-count').textContent=events.length+' events · Pacific time';$('#count').textContent=saved.size?'('+saved.size+')':'';const newCount=seed.filter(e=>isNew(e)&&(e.endDate||e.date)>=today()).length;$('#new-count').textContent=newCount?newCount+' new since your last visit':'New listings will be marked here after your next visit.';$('#cards').innerHTML=events.map(e=>`<article class="card"><div class="visual" style="background:${/^#[a-f0-9]{6}$/i.test(e.color||'')?e.color:'#e5eadd'}"><span class="symbol" aria-hidden="true">${esc(e.icon||'✳')}</span><div class="datebox">${e.endDate?'UNTIL':new Date(e.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'}).toUpperCase()}<strong>${e.endDate?esc(dateLabel(e.endDate)):Number(e.date.slice(-2))}</strong></div><button class="save ${saved.has(e.id)?'on':''}" data-save="${esc(e.id)}" aria-label="${saved.has(e.id)?'Unsave':'Save'} ${esc(e.title)}" aria-pressed="${saved.has(e.id)}">${saved.has(e.id)?'♥':'♡'}</button></div><div class="content"><div class="meta">${esc(e.city)} &nbsp;·&nbsp; ${esc(range(e))}</div><h3>${esc(e.title)}</h3><p class="venue">${esc(e.venue)}</p><p class="desc">${esc(e.desc)}</p><div class="badges">${isNew(e)?'<span class="badge new-badge">New since your last visit</span>':''}${saved.has(e.id)?`<span class="badge">${esc(PLAN_STATES[statusFor(e.id)])}</span>`:''}<span class="badge ${e.price==='Free'?'free':''}">${esc(e.price)}</span><span class="badge">${e.min===null?'Age range not listed':e.max===99?(e.min===0?'All ages':'Ages '+e.min+'+'):'Ages '+e.min+'–'+e.max}</span></div><div class="cardfoot"><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${esc(e.source)} ↗</a><span class="status">${esc(eventFreshness(e).old?'Older listing · recheck':e.status)}</span></div><p class="checked ${eventFreshness(e).old?'old':''}">${esc(eventFreshness(e).label)}</p>${listingLinks(e)}<a class="directions" href="${esc(directionsUrl(e))}" target="_blank" rel="noopener noreferrer">Directions ↗</a></div></article>`).join('')||'<div class="empty">No matching events in this collection.<br>Try Looking ahead, clear a filter, or add an event from a source.</div>';
const plans=all().filter(e=>saved.has(e.id));
$('#plan').innerHTML=plans.map(e=>`<div class="planitem"><span class="small">${e.endDate?'Through '+dateLabel(e.endDate):dateLabel(e.date)} · ${esc(range(e))}</span><strong>${esc(e.title)}</strong><span class="small">${esc(e.city)} · ${esc(eventFreshness(e).label)}</span>${statusSelect(e)}${conflictHTML(e,plans)}<div class="plan-links"><a href="${esc(directionsUrl(e))}" target="_blank" rel="noopener noreferrer">Directions ↗</a><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">Organizer / registration ↗</a></div><button data-calendar="${esc(e.id)}">+ Calendar</button><button data-save="${esc(e.id)}" aria-label="Remove ${esc(e.title)}">Remove</button></div>`).join('')||'<div class="empty-plan">♡ Your next adventure starts with a save.</div>';
const available=new Set(plans.map(e=>e.id)),missing=[...saved].filter(id=>!available.has(id));
if(missing.length)$('#plan').innerHTML+=`<p class="plan-note">${missing.length} saved ${missing.length===1?'event has':'events have'} no available details in this browser. Backups preserve their IDs so they can reconnect if the listings return.</p>`;
$('#export').disabled=!plans.length;
$('#sources-view').classList.toggle('hide',view!=='sources');$('#discovery').classList.toggle('hide',view==='sources');$('#aside').classList.toggle('hide',view==='sources');document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===period));}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}function calendar(events){if(!events.length)return;const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');let lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Little Weekends//East Bay//EN','CALSCALE:GREGORIAN','BEGIN:VTIMEZONE','TZID:America/Los_Angeles','BEGIN:STANDARD','DTSTART:19701101T020000','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','TZOFFSETFROM:-0700','TZOFFSETTO:-0800','TZNAME:PST','END:STANDARD','BEGIN:DAYLIGHT','DTSTART:19700308T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','TZOFFSETFROM:-0800','TZOFFSETTO:-0700','TZNAME:PDT','END:DAYLIGHT','END:VTIMEZONE'];events.forEach(e=>lines.push('BEGIN:VEVENT','UID:'+e.id+'@littleweekends','DTSTAMP:'+stamp,...(e.endDate?['DTSTART;VALUE=DATE:'+e.date.replaceAll('-',''),'DTEND;VALUE=DATE:'+new Date(new Date(e.endDate+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10).replaceAll('-','')]:['DTSTART;TZID=America/Los_Angeles:'+e.date.replaceAll('-','')+'T'+e.start.replace(':','')+'00',...(e.end?['DTEND;TZID=America/Los_Angeles:'+e.date.replaceAll('-','')+'T'+e.end.replace(':','')+'00']:[])]),'SUMMARY:'+icsEscape(e.title),'LOCATION:'+icsEscape(e.venue+', '+e.city),'DESCRIPTION:'+icsEscape(e.desc+'\nCheck organizer: '+e.url),'URL:'+safeUrl(e.url),'END:VEVENT'));lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='little-weekends.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function sourceHTML(){return sourceStatuses.map(s=>{const health=sourceHealth(s);return `<div class="source"><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><small class="${health.attention?'needs-check':''}">${esc(health.label)}</small></div>`}).join('')}
function renderSources(){
 renderGuides();
 $('#source-list').innerHTML=sourceHTML();
 const auto=sourceStatuses.filter(s=>s.mode==='automatic'),attention=auto.filter(s=>sourceHealth(s).attention);
 $('#source-summary').textContent=auto.length?`${auto.length-attention.length} of ${auto.length} automatic sources up to date${attention.length?' · '+attention.length+' need attention':''}.`:'';
 $('#sources-view').innerHTML='<div class="source-panel"><h2>Your family event sources</h2><p>Automatic imports collect free family activities in Oakland and nearby East Bay cities, including San Leandro and Castro Valley. Additional calendars have hand-checked listings. A successful scan can find zero matches; it does not mean there are no events at the venue.</p>'+sourceStatuses.map(s=>{const h=sourceHealth(s);return `<div class="source"><div><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><p class="small source-note">${esc(s.note||'')}</p>${s.mode==='automatic'?`<p class="small source-note">Last successful scan: ${esc(checkedLabel(s.last_success))}<br>Last attempt: ${esc(checkedLabel(s.last_attempt))}</p>`:'<p class="small source-note">See individual events for their check dates. This source is not an automatic feed.</p>'}</div><small class="${h.attention?'needs-check':''}">${esc(h.label)}</small></div>`}).join('')+'<p class="notice">Saving here does not register you with an organizer. Plans and personally added events stay in this browser. Listing check dates do not guarantee availability.</p></div>';
}
function renderGuides(){
 const recent=guides.filter(g=>g&&g.source_id==='510'&&safeUrl(g.url)!=='#'&&hoursSince(g.checked_at)<=336&&hoursSince(g.published_at)<=720).slice(0,8);
 $('#guide-links').innerHTML=recent.map(g=>`<div class="guide"><a href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener noreferrer">${esc(g.title)} ↗</a><p class="small source-note">Article published ${esc(checkedLabel(g.published_at))}${hoursSince(g.checked_at)>168?' · Older cached guide':''}</p></div>`).join('')||'<p class="small source-note">No recent guide links available. Check the RSS source status for the latest attempt.</p>';
}
function validFeedEvent(e){return e&&typeof e.id==='string'&&typeof e.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&/^\d{2}:\d{2}$/.test(e.start)&&(e.end===null||/^\d{2}:\d{2}$/.test(e.end))&&typeof e.city==='string'&&safeUrl(e.url)!=='#'}
async function loadFeed(){
 $('#feed-status').textContent='Loading the latest event collection…';
 $('#reload-feed').disabled=true;
 try{
  const response=await fetch('./data/events.json',{cache:'no-store'});
  if(!response.ok)throw Error('Feed unavailable');
  const feed=await response.json();if(feed.schema_version!==1||!Array.isArray(feed.events)||!Array.isArray(feed.sources))throw Error('Invalid feed');
  try{localStorage.setItem('lw-feed-cache',JSON.stringify(feed))}catch{}
  seed=feed.events.filter(e=>validFeedEvent(e)&&allowedLibrary(e)&&allowedSource(e));sourceStatuses=feed.sources.filter(s=>s.id!=='bn');guides=feed.guides||[];feedInfo=feed;migrateSavedIds();syncSavedSnapshots();rememberSeen();
  const automatic=sourceStatuses.filter(s=>s.mode==='automatic'),attention=automatic.filter(s=>sourceHealth(s).attention);
  const overdue=hoursSince(feed.last_successful_collection)>48;
  $('#feed-status').textContent=`Updated ${checkedLabel(feed.generated_at)}. ${overdue?'Collection updates are overdue. ':''}${attention.length?attention.length+' automatic sources need attention: '+attention.map(s=>s.name).join(', ')+'. ':''}Each card shows its own check date. Unconfirmed ideas are hidden by default.`;
  renderSources();render();
 }catch{
  const cached=read('lw-feed-cache',null);
  if(cached&&Array.isArray(cached.events)){seed=cached.events.filter(e=>validFeedEvent(e)&&allowedLibrary(e)&&allowedSource(e));sourceStatuses=(cached.sources||[]).filter(s=>s.id!=='bn');guides=cached.guides||[];feedInfo=cached;migrateSavedIds();syncSavedSnapshots();$('#feed-status').textContent='Showing the last collection saved on this browser. A new update could not be loaded; try again later.';renderSources();render();return}
  $('#feed-status').textContent='Could not load the event collection. Your saved data is still in this browser. Try refreshing the page. If you downloaded the project, serve the site folder with a local web server.';
  render();
 }finally{$('#reload-feed').disabled=false}
}
$('#reload-feed').onclick=loadFeed;
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.save)toggleSaved(b.dataset.save);if(b.dataset.nav){view=b.dataset.nav;render()}if(b.dataset.period){period=b.dataset.period;view='discover';render()}if(b.dataset.calendar)calendar(all().filter(x=>x.id===b.dataset.calendar))});['search','city','age','cost','category','include-unconfirmed','new-only'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));$('#add').onclick=()=>$('#modal').showModal();$('#cancel').onclick=()=>$('#modal').close();$('#export').onclick=()=>calendar(all().filter(e=>saved.has(e.id)));$('#form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.end<=d.start){toast('End time must be after start time.');return}if(!/^https?:\/\//i.test(d.url)){toast('Use an http or https source link.');return}const min=d.min===''?null:Number(d.min),max=d.max===''?null:Number(d.max);if((min===null)!==(max===null)||min!==null&&max<min){toast('Enter both age limits, with maximum at least minimum.');return}custom.push({...d,min,max,id:'custom-'+crypto.randomUUID(),source:'Your discovery',status:'Added by you',desc:'Personally added event. Check the source for current details.',icon:'✳',color:'#e5eadd'});saved.add(custom.at(-1).id);planStates[custom.at(-1).id]='interested';syncSavedSnapshots();persist();e.target.reset();$('#modal').close();view='saved';['search','city','age','cost','category'].forEach(id=>$('#'+id).value='');render();toast('Added to your plans.')};
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
render();loadFeed();

$('#weekends-only').addEventListener('change',render);
