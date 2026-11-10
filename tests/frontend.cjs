// A minimal DOM test double: verifies application behavior, not browser layout.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
// Synthetic records keep these checks independent of today's live calendar.
const common={city:'Emeryville',venue:'Example venue',price:'Free',min:null,max:null,cat:'Art & crafts',source:'Test source',source_id:'test',status:'Test',checked_at:'2026-11-04T20:00:00Z',url:'https://example.org/event/',desc:'Synthetic event for testing.'};
const feed={schema_version:1,generated_at:'2026-11-04T20:00:00Z',last_successful_collection:'2026-11-04T20:00:00Z',sources:[{id:'test',name:'Test source',mode:'automatic',state:'ok',last_success:'2026-11-04T20:00:00Z',last_attempt:'2026-11-04T20:00:00Z',count:3,url:'https://example.org',note:'Synthetic test source'}],events:[
 {...common,id:'dated',title:'Holiday Cookie Decorating',date:'2026-11-07',start:'12:00',end:'13:00'},
 {...common,id:'future',title:'Future craft',date:'2026-11-14',start:'10:00',end:'11:00'},
 {...common,id:'ikea-gnomes',title:'Gnome in the Home',date:'2026-11-01',endDate:'2026-12-31',ongoing:true,start:'10:00',end:'18:00'}
]};
const elements={};const storage=new Map();const documentListeners={};const windowListeners={};
function node(){return {value:'',textContent:'',innerHTML:'',style:{},listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn},showModal(){this.open=true},close(){this.open=false},click(){}}}
let captured;
class TestURL extends URL {static createObjectURL(b){captured=b;return 'blob:test'}static revokeObjectURL(){}}
class TestDate extends Date { constructor(...args){super(...(args.length?args:['2026-11-04T20:00:00Z']))} static now(){return Date.parse('2026-11-04T20:00:00Z')} }
const ctx={Intl,Date:TestDate,Set,URL:TestURL,Blob,window:{addEventListener(type,fn){windowListeners[type]=fn}},
 document:{querySelector(s){return elements[s]??=node()},querySelectorAll(){return []},addEventListener(type,fn){documentListeners[type]??=fn},createElement(){return {click(){}}}},
 localStorage:{getItem(k){return storage.get(k)??null},setItem(k,v){storage.set(k,v)}},setTimeout(){},fetch:async()=>({ok:true,json:async()=>feed})};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'site/app.js'),'utf8'),ctx);
setImmediate(async()=>{
 try{
  await vm.runInContext('loadFeed()',ctx);
  vm.runInContext(`$('#weekends-only').checked=true;$('#cost').value='free';period='all';render();`,ctx);
  assert.equal(vm.runInContext("overlapsWeekend({date:'2026-11-06'})",ctx),false);
  assert.equal(vm.runInContext("overlapsWeekend({date:'2026-11-07'})",ctx),true);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Rockridge Branch Library'})",ctx),false);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Temescal Branch · 5205 Telegraph'})",ctx),true);
  assert.match(elements['#cards'].innerHTML,/Holiday Cookie Decorating/i);
  assert.match(elements['#feed-status'].textContent,/Updated Nov 4/);
  vm.runInContext(`$('#search').value='Gnome';render();`,ctx);
  assert.match(elements['#cards'].innerHTML,/DEC 31|Dec 31/);
  vm.runInContext(`$('#search').value='';period='weekend';render();`,ctx);
  let cards=elements['#cards'].innerHTML;
  assert(cards.lastIndexOf('data-save="ikea-gnomes"')>cards.indexOf('class="card"'));
  const hunt=cards.indexOf('data-save="ikea-gnomes"');assert(!cards.slice(hunt+1).includes('class="card"'));
  const visitExport=vm.runInContext(`calendar(seed.filter(e=>e.id==='ikea-gnomes'))`,ctx);
  assert.equal(elements['#visit-modal'].open,true);
  elements['#visit-date'].value='2026-11-07';
  elements['#visit-form'].onsubmit({preventDefault(){}});
  await visitExport;
  const ics=await captured.text();assert.match(ics,/DTSTART;VALUE=DATE:20261107/);assert.match(ics,/DTEND;VALUE=DATE:20261108/);assert(!ics.includes('20270101'));
  const oldCapture=captured;const cancelledExport=vm.runInContext(`calendar(seed.filter(e=>e.id==='ikea-gnomes'))`,ctx);
  elements['#visit-cancel'].onclick();await cancelledExport;assert.equal(captured,oldCapture);
  // Escaped source text cannot become executable markup in event cards.
  vm.runInContext(`seed=[{id:'evil',title:'<img src=x onerror=alert(1)>',date:'2026-11-07',start:'10:00',end:'11:00',city:'Oakland',venue:'Example',price:'Free',min:null,max:null,cat:'Art & crafts',source:'Test',status:'Test',checked_at:'2026-11-04T20:00:00Z',url:'javascript:alert(1)',desc:'<script>bad</script>',color:'red;position:fixed'}];render()`,ctx);
  cards=elements['#cards'].innerHTML;assert(!cards.includes('<img'));assert(!cards.includes('<script>'));assert(cards.includes('href="#"'));assert(!cards.includes('position:fixed'));
  ctx.fetch=async()=>{throw Error('offline')};await vm.runInContext('loadFeed()',ctx);
  assert.match(elements['#feed-status'].textContent,/last collection saved/);
  vm.runInContext(`seed=[{...seed[0],id:'closed',status:'Registration closed'},{...seed[0],id:'uncertain',status:'Confirm store details'},{...seed[0],id:'ready',status:'Store calendar',end:null}];$('#include-unconfirmed').checked=false;render()`,ctx);
  assert(!elements['#cards'].innerHTML.includes('data-save="closed"'));assert(!elements['#cards'].innerHTML.includes('data-save="uncertain"'));assert.match(elements['#cards'].innerHTML,/Starts 12pm/);
  vm.runInContext(`$('#include-unconfirmed').checked=true;render()`,ctx);assert(elements['#cards'].innerHTML.includes('data-save="uncertain"'));
  // A freshly built feed must not make old source results look fresh.
  assert.equal(vm.runInContext("sourceHealth({mode:'automatic',state:'ok',last_success:'2026-10-30T20:00:00Z'}).attention",ctx),true);
  assert.equal(vm.runInContext("sourceHealth({mode:'automatic',state:'ok',count:0,last_success:'2026-11-04T20:00:00Z'}).label",ctx),'No matching events found');
  assert.equal(vm.runInContext("sourceHealth({mode:'manual'}).label",ctx),'Hand-checked listings');
  assert.equal(vm.runInContext("readyToPlan({checked_at:'invalid'})",ctx),false);
  assert.equal(vm.runInContext("readyToPlan({source:'Your discovery'})",ctx),true);
  // Cached stale=false is not trusted after seven days have elapsed.
  assert.equal(vm.runInContext("readyToPlan({checked_at:'2026-10-25T20:00:00Z',stale:false})",ctx),false);
  vm.runInContext("$('#include-unconfirmed').checked=false;view='discover';period='weekend';",ctx);
  const priorFeed=JSON.parse(JSON.stringify(feed));
  priorFeed.events[0].checked_at='2026-10-25T20:00:00Z';priorFeed.events[0].stale=false;
  storage.set('lw-feed-cache',JSON.stringify(priorFeed));
  await vm.runInContext('loadFeed()',ctx);
  assert(!elements['#cards'].innerHTML.includes('data-save="dated"'));
  vm.runInContext("$('#include-unconfirmed').checked=true;render()",ctx);
  assert.match(elements['#cards'].innerHTML,/Recheck · last checked Oct 25/);
  assert.equal(elements['#reload-feed'].disabled,false);
  // Existing saves follow a duplicate into its canonical card, including offline loads.
  priorFeed.events[0].alternate_ids=['previous-saved-id'];
  priorFeed.events[0].listings=[{source_id:'other',source:'Other source',url:'https://example.org/also/'}];
  storage.set('lw-feed-cache',JSON.stringify(priorFeed));
  vm.runInContext("saved=new Set(['previous-saved-id']);",ctx);
  await vm.runInContext('loadFeed()',ctx);
  assert.equal(vm.runInContext("saved.has('dated')&&!saved.has('previous-saved-id')",ctx),true);
  assert.match(elements['#cards'].innerHTML,/Also listed by 1 source/);
  assert.deepEqual(JSON.parse(storage.get('lw-saved')),['dated']);
  // RSS guides remain reading links and cannot enter calendar event cards.
  priorFeed.guides=[{id:'rss-guide',source_id:'510',title:'Weekend ideas <script>bad</script>',url:'https://www.510families.com/weekend/',published_at:'2026-11-04T12:00:00Z',checked_at:'2026-11-04T20:00:00Z'}];
  priorFeed.sources.push({id:'bn',name:'Barnes & Noble',mode:'automatic',state:'error',url:'https://stores.barnesandnoble.com/store/2072'});
  priorFeed.events.push({...common,id:'bn-old',source_id:'bn',date:'2026-11-07',start:'10:00',end:'11:00',title:'Old BN storytime'});
  storage.set('lw-feed-cache',JSON.stringify(priorFeed));
  await vm.runInContext('loadFeed()',ctx);
  assert.match(elements['#guide-links'].innerHTML,/Article published/);
  assert.match(elements['#guide-links'].innerHTML,/&lt;script&gt;/);
  assert(!elements['#guide-links'].innerHTML.includes('data-calendar'));
  assert(!elements['#cards'].innerHTML.includes('rss-guide'));
  assert(!elements['#cards'].innerHTML.includes('bn-old'));
  assert(!elements['#source-list'].innerHTML.includes('Barnes'));
  assert.equal(vm.runInContext("sourceHealth({mode:'automatic',kind:'articles',state:'ok',count:3,last_success:'2026-11-04T20:00:00Z'}).label",ctx),'RSS · 3 guides');
  // Planning fixtures are synthetic and use Pacific wall-clock times.
  ctx.planFixtures=[
   {...common,id:'dated',title:'Craft one',date:'2026-11-07',start:'12:00',end:'13:00'},
   {...common,id:'overlap',title:'Craft two',date:'2026-11-07',start:'12:30',end:'13:30'},
   {...common,id:'adjacent',title:'Back-to-back',date:'2026-11-07',start:'13:00',end:'14:00'},
   {...common,id:'unknown-end',title:'Start only',date:'2026-11-07',start:'12:00',end:null},
   {...common,id:'future',title:'Later weekend',date:'2026-11-14',start:'10:00',end:'11:00'}
  ];
  vm.runInContext("seed=planFixtures.map(e=>({...e}));custom=[];saved=new Set();planStates={};planSnapshots={};view='discover';period='weekend';$('#include-unconfirmed').checked=false;$('#new-only').checked=false;render()",ctx);
  assert.equal(vm.runInContext("weekendFor('2026-11-15').join(',')",ctx),'2026-11-14,2026-11-15');
  assert.equal(vm.runInContext("weekendFor('2026-12-31').join(',')",ctx),'2027-01-02,2027-01-03');
  assert.equal(vm.runInContext("validDate('2026-02-30')",ctx),false);
  elements['#weekend-date'].listeners.change({target:{value:'2026-11-13'}});
  assert.match(elements['#heading'].textContent,/Nov 14.*Nov 15/);
  assert.match(elements['#cards'].innerHTML,/Later weekend/);
  assert(!elements['#cards'].innerHTML.includes('data-save="dated"'));
  vm.runInContext("toggleSaved('dated');setPlanStatus('dated','booked');toggleSaved('overlap');toggleSaved('unknown-end');",ctx);
  assert.equal(JSON.parse(storage.get('lw-plan-status')).dated,'booked');
  assert.match(elements['#plan'].innerHTML,/Listed times overlap with Craft two/);
  assert.match(elements['#plan'].innerHTML,/End time unknown/);
  assert.equal(vm.runInContext("planConflicts(seed[0],[seed[2],seed[3]]).length",ctx),0);
  assert.equal(vm.runInContext("planConflicts({...seed[0],endDate:'2026-12-31'},seed).length",ctx),0);
  const destination=new URL(vm.runInContext("directionsUrl(seed[0])",ctx));
  assert.equal(destination.hostname,'www.google.com');
  assert.equal(destination.searchParams.get('destination'),'Example venue, Emeryville, CA');
  elements['#backup-plans'].onclick();
  const backup=JSON.parse(await captured.text());
  assert.equal(backup.format,'little-weekends-plans');
  assert.equal(backup.saved.find(x=>x.id==='dated').status,'booked');
  assert(!JSON.stringify(backup).includes('lw-feed-cache'));
  ctx.backupText=JSON.stringify(backup);
  vm.runInContext("saved=new Set();planStates={};planSnapshots={};",ctx);
  assert.equal(vm.runInContext('restorePlans(backupText)',ctx),3);
  assert.equal(vm.runInContext("statusFor('dated')",ctx),'booked');
  // Importing the same backup twice is idempotent and keeps current status choices.
  vm.runInContext("setPlanStatus('dated','register')",ctx);
  assert.equal(vm.runInContext('restorePlans(backupText)',ctx),0);
  assert.equal(vm.runInContext("statusFor('dated')",ctx),'register');
  const before=vm.runInContext('JSON.stringify(backupPayload())',ctx);
  const malformed=JSON.parse(JSON.stringify(backup));malformed.saved.push({id:'bad',status:'interested',event:{}});
  ctx.badBackup=JSON.stringify(malformed);
  assert.throws(()=>vm.runInContext('restorePlans(badBackup)',ctx),/invalid event/);
  assert.equal(vm.runInContext('JSON.stringify(backupPayload())',ctx),before);
  // Unsafe URLs and prototype-style IDs are rejected before mutation.
  malformed.saved=JSON.parse(JSON.stringify(backup.saved));malformed.saved[0].event.url='javascript:alert(1)';
  ctx.badBackup=JSON.stringify(malformed);assert.throws(()=>vm.runInContext('restorePlans(badBackup)',ctx),/invalid event/);
  malformed.saved=[{id:'__proto__',status:'interested',event:null}];
  ctx.badBackup=JSON.stringify(malformed);assert.throws(()=>vm.runInContext('restorePlans(badBackup)',ctx),/invalid saved plan/);
  const hostile=JSON.parse(JSON.stringify(backup));hostile.saved[0].event.endDate='2026-11-09';hostile.saved[0].event.hoursLabel='<img src=x onerror=alert(1)>';
  ctx.hostileBackup=JSON.stringify(hostile);
  vm.runInContext("saved=new Set();planStates={};planSnapshots={};seed=[];restorePlans(hostileBackup)",ctx);
  assert(!elements['#cards'].innerHTML.includes('<img'));
  assert.match(elements['#cards'].innerHTML,/&lt;img/);
  vm.runInContext("seed=planFixtures.map(e=>({...e}));saved=new Set();planStates={};planSnapshots={};restorePlans(backupText)",ctx);
  // Saved copies survive feed removal, and clearly require an organizer recheck.
  vm.runInContext("seed=seed.filter(e=>e.id!=='dated');view='saved';render()",ctx);
  assert.match(elements['#plan'].innerHTML,/Saved copy · verify details/);
  assert.match(elements['#cards'].innerHTML,/Craft one/);
  // Personal events survive backup/restore too.
  ctx.personalEvent={...common,id:'custom-example',source:'Your discovery',title:'My added outing',date:'2026-11-21',start:'10:00',end:'11:00'};
  vm.runInContext("custom=[personalEvent];toggleSaved('custom-example')",ctx);
  ctx.personalBackup=vm.runInContext('JSON.stringify(backupPayload())',ctx);
  vm.runInContext("custom=[];saved=new Set();planStates={};planSnapshots={};restorePlans(personalBackup)",ctx);
  assert.equal(vm.runInContext("custom.length",ctx),1);
  assert.equal(vm.runInContext("saved.has('custom-example')",ctx),true);
  // Duplicate migration preserves Booked and the plan's details.
  vm.runInContext("seed=[{...planFixtures[0],id:'canonical',alternate_ids:['dated']}];saved=new Set(['dated']);planStates={dated:'booked'};migrateSavedIds();syncSavedSnapshots()",ctx);
  assert.equal(vm.runInContext("statusFor('canonical')",ctx),'booked');
  assert.equal(vm.runInContext("saved.has('canonical')&&!saved.has('dated')",ctx),true);
  // New labels compare against the prior visit, including alias IDs.
  vm.runInContext("visitSeen=new Set(['dated']);seed=planFixtures;custom=[];saved=new Set();planSnapshots={};view='discover';period='weekend';$('#new-only').checked=true;render()",ctx);
  assert.equal(vm.runInContext("isNew(seed[0])",ctx),false);
  assert.equal(vm.runInContext("isNew(seed[1])",ctx),true);
  assert.equal(vm.runInContext("isNew({id:'canonical',alternate_ids:['dated']})",ctx),false);
  assert(!elements['#cards'].innerHTML.includes('data-save="dated"'));
  assert.match(elements['#cards'].innerHTML,/New since your last visit/);
  // Recording a successful collection does not clear this visit's new labels.
  vm.runInContext('rememberSeen()',ctx);
  assert.equal(vm.runInContext('isNew(seed[1])',ctx),true);
  assert(JSON.parse(storage.get('lw-seen-events')).includes('overlap'));
  vm.runInContext('visitSeen=null;rememberSeen()',ctx);
  assert.equal(vm.runInContext('isNew(seed[1])',ctx),false);
  // Weekend sections group single-day events by date; ongoing events appear once at the bottom.
  ctx.groupFixtures=[
   {...common,id:'sun',title:'Sunday activity',date:'2026-11-08',start:'09:00',end:'10:00'},
   {...common,id:'sat2',title:'Saturday afternoon',date:'2026-11-07',start:'14:00',end:'15:00'},
   {...common,id:'sat1',title:'Saturday morning',date:'2026-11-07',start:'09:00',end:'10:00'},
   {...common,id:'ongoing',title:'All-week hunt',date:'2026-11-01',endDate:'2026-12-31',ongoing:true,start:'10:00',end:'18:00'},
   {...common,id:'future-sat',title:'Next Saturday',date:'2026-11-14',start:'09:00',end:'10:00'}
  ];
  vm.runInContext("seed=groupFixtures;custom=[];saved=new Set();planSnapshots={};visitSeen=new Set(groupFixtures.map(e=>e.id));view='discover';period='weekend';$('#new-only').checked=false;$('#include-unconfirmed').checked=false;$('#weekends-only').checked=true;render()",ctx);
  let grouped=elements['#cards'].innerHTML;
  assert(grouped.indexOf('Saturday, Nov 7, 2026')<grouped.indexOf('Saturday morning'));
  assert(grouped.indexOf('Saturday morning')<grouped.indexOf('Saturday afternoon'));
  assert(grouped.indexOf('Sunday, Nov 8, 2026')<grouped.indexOf('Sunday activity'));
  assert(grouped.indexOf('Sunday activity')<grouped.indexOf('Ongoing &amp; multi-day activities'));
  assert.equal((grouped.match(/data-save="ongoing"/g)||[]).length,1);
  vm.runInContext("period='next';render()",ctx);
  grouped=elements['#cards'].innerHTML;
  assert.match(grouped,/Saturday, Nov 14, 2026/);assert.match(grouped,/Sunday, Nov 15, 2026/);
  assert.match(grouped,/No matching events this day/);
  vm.runInContext("period='all';render()",ctx);
  grouped=elements['#cards'].innerHTML;
  assert(grouped.indexOf('Sunday, Nov 8, 2026')<grouped.indexOf('Saturday, Nov 14, 2026'));
  assert(grouped.indexOf('Next Saturday')<grouped.indexOf('Ongoing &amp; multi-day activities'));
  vm.runInContext("view='saved';saved=new Set(['sun']);render()",ctx);
  assert(!elements['#cards'].innerHTML.includes('day-heading'));
  // Hide choices survive refresh, can be restored, and do not remove saved plans.
  vm.runInContext("seed=groupFixtures;custom=[];saved=new Set(['sat1']);hiddenIds=new Set();planStates={sat1:'booked'};planSnapshots={};view='discover';period='weekend';$('#show-hidden').checked=false;$('#new-only').checked=false;render()",ctx);
  assert.match(elements['#cards'].innerHTML,/data-hide="sat1"/);
  vm.runInContext("toggleHidden('sat1')",ctx);
  assert(!elements['#cards'].innerHTML.includes('data-save="sat1"'));
  assert.equal(vm.runInContext("saved.has('sat1')&&statusFor('sat1')==='booked'",ctx),true);
  assert.deepEqual(JSON.parse(storage.get('lw-hidden')),['sat1']);
  vm.runInContext("view='saved';render()",ctx);
  assert.match(elements['#cards'].innerHTML,/data-save="sat1"/);
  assert.match(elements['#cards'].innerHTML,/Restore event/);
  vm.runInContext("view='discover';$('#show-hidden').checked=true;render()",ctx);
  assert.match(elements['#cards'].innerHTML,/data-save="sat1"/);
  assert.match(elements['#cards'].innerHTML,/Restore event/);
  vm.runInContext("toggleHidden('sat1');$('#show-hidden').checked=false;render()",ctx);
  assert.match(elements['#cards'].innerHTML,/data-save="sat1"/);
  assert.deepEqual(JSON.parse(storage.get('lw-hidden')),[]);
  vm.runInContext("toggleHidden('sat1')",ctx);
  const nextCtx={...ctx,window:{addEventListener(){}}};vm.createContext(nextCtx);vm.runInContext(fs.readFileSync(path.join(root,'site/app.js'),'utf8'),nextCtx);
  assert.equal(vm.runInContext("hiddenIds.has('sat1')",nextCtx),true);
  // Known duplicate IDs migrate even if the event was never saved.
  vm.runInContext("seed=[{...groupFixtures[0],id:'canonical-hidden',alternate_ids:['old-hidden']}];hiddenIds=new Set(['old-hidden']);saved=new Set();migrateSavedIds()",ctx);
  assert.equal(vm.runInContext("hiddenIds.has('canonical-hidden')&&!hiddenIds.has('old-hidden')",ctx),true);
  ctx.hideBackup=vm.runInContext('JSON.stringify(backupPayload())',ctx);
  vm.runInContext("hiddenIds=new Set();restorePlans(hideBackup)",ctx);
  assert.equal(vm.runInContext("hiddenIds.has('canonical-hidden')",ctx),true);
  const badHide=JSON.parse(ctx.hideBackup);badHide.hidden_ids=['__proto__'];ctx.badHide=JSON.stringify(badHide);
  const unchanged=vm.runInContext('JSON.stringify(backupPayload())',ctx);
  assert.throws(()=>vm.runInContext('restorePlans(badHide)',ctx),/invalid hidden IDs/);
  assert.equal(vm.runInContext('JSON.stringify(backupPayload())',ctx),unchanged);
  // The card's calendar button exports that event without saving it first.
  vm.runInContext("seed=groupFixtures;custom=[];saved=new Set();hiddenIds=new Set();view='discover';period='weekend';$('#show-hidden').checked=false;render()",ctx);
  assert.match(elements['#cards'].innerHTML,/data-calendar="sat1"/);
  documentListeners.click({target:{closest(){return {dataset:{calendar:'sat1'}}}}});
  const cardCalendar=await captured.text();
  assert.match(cardCalendar,/SUMMARY:Saturday morning/);
  assert.match(cardCalendar,/DTSTART;TZID=America\/Los_Angeles:20261107T090000/);
  assert.equal(vm.runInContext("saved.has('sat1')",ctx),false);
  // Saved plans are not filtered by discovery filters, including price and city.
  vm.runInContext("seed=[{...planFixtures[0],id:'paid',title:'Paid saved outing',price:'$10'}];custom=[];saved=new Set(['paid']);planStates={paid:'booked'};planSnapshots={};planAlerts={};view='saved';$('#cost').value='free';$('#city').value='Berkeley';$('#age').value='4';$('#category').value='Building';$('#search').value='no match';render()",ctx);
  assert.match(elements['#cards'].innerHTML,/Paid saved outing/);
  assert.match(elements['#plan'].innerHTML,/Paid saved outing/);
  // On Sunday, past Saturday is excluded even when the weekend-only filter is off.
  vm.runInContext("seed=[{...planFixtures[0],id:'past-saturday',title:'Yesterday',date:'2026-11-07'},{...planFixtures[0],id:'today',title:'Today',date:'2026-11-08'}];custom=[];saved=new Set();view='discover';period='weekend';$('#cost').value='';$('#city').value='';$('#age').value='';$('#category').value='';$('#search').value='';$('#weekends-only').checked=false;$('#show-hidden').checked=false;$('#include-unconfirmed').checked=false;$('#new-only').checked=false;render()",ctx);
  ctx.Date=class extends Date {constructor(...args){super(...(args.length?args:['2026-11-08T20:00:00Z']))}static now(){return Date.parse('2026-11-08T20:00:00Z')}};
  vm.runInContext('render()',ctx);
  assert(!elements['#cards'].innerHTML.includes('Yesterday'));
  assert.match(elements['#cards'].innerHTML,/Today/);
  // Changed start and organizer status alert on the saved plan and survive reload.
  vm.runInContext("seed=[{...planFixtures[0],id:'change',title:'My outing',start:'11:30',end:'12:30',status:'Full · check waitlist',checked_at:'2026-11-08T18:00:00Z'}];saved=new Set(['change']);planStates={change:'booked'};planAlerts={};planSnapshots={change:{...seed[0],start:'10:00',end:'11:00',status:'Registration required',checked_at:'2026-11-07T18:00:00Z'}};view='saved';syncSavedSnapshots();render()",ctx);
  assert.match(elements['#plan'].innerHTML,/Start time: 10:00 → 11:30/);
  assert.match(elements['#plan'].innerHTML,/Organizer status: Registration required → Full/);
  assert.equal(vm.runInContext("statusFor('change')",ctx),'booked');
  assert(JSON.parse(storage.get('lw-plan-alerts')).change.length>=2);
  const alertBackup=JSON.parse(vm.runInContext('JSON.stringify(backupPayload())',ctx));
  assert(alertBackup.plan_alerts.change.length>=2);
  vm.runInContext('syncSavedSnapshots()',ctx);
  assert.equal(vm.runInContext("planAlerts.change.length",ctx),3);
  // A stale cache does not overwrite the newer snapshot or generate false changes.
  vm.runInContext("seed=[{...seed[0],start:'10:00',end:'11:00',status:'Registration required',checked_at:'2026-11-07T18:00:00Z'}];syncSavedSnapshots()",ctx);
  assert.equal(vm.runInContext("planSnapshots.change.start",ctx),'11:30');
  assert.equal(vm.runInContext("all().find(e=>e.id==='change').start",ctx),'11:30');
  assert.equal(vm.runInContext("all().find(e=>e.id==='change').saved_copy",ctx),true);
  assert.equal(vm.runInContext("planAlerts.change.length",ctx),3);
  documentListeners.click({target:{closest(){return {dataset:{dismissChange:'change'}}}}});
  assert.equal(vm.runInContext("Boolean(planAlerts.change)",ctx),false);
  // Backups round-trip saved update notices and remain compatible with old files.
  ctx.withAlerts=JSON.stringify(alertBackup);
  vm.runInContext("saved=new Set();planStates={};planSnapshots={};planAlerts={};seed=[];restorePlans(withAlerts)",ctx);
  assert.equal(vm.runInContext("planAlerts.change.length",ctx),3);
  const oldBackup=JSON.parse(ctx.withAlerts);delete oldBackup.plan_alerts;ctx.oldBackup=JSON.stringify(oldBackup);
  assert.doesNotThrow(()=>vm.runInContext('restorePlans(oldBackup)',ctx));
  // The chosen visit date is validated and canceled exports do not download.
  vm.runInContext("seed=[{...planFixtures[0],id:'long',title:'Long hunt',date:'2026-11-01',endDate:'2026-12-31',ongoing:true}];saved=new Set();view='discover'",ctx);
  const prevCapture=captured;const selected=vm.runInContext("calendar(seed)",ctx);
  elements['#visit-date'].value='2027-01-01';elements['#visit-form'].onsubmit({preventDefault(){}});
  assert.match(elements['#visit-error'].textContent,/within/);assert.equal(captured,prevCapture);
  elements['#visit-date'].value='2026-12-10';elements['#visit-form'].onsubmit({preventDefault(){}});await selected;
  const chosenIcs=await captured.text();assert.match(chosenIcs,/DTSTART;VALUE=DATE:20261210/);assert.match(chosenIcs,/DTEND;VALUE=DATE:20261211/);
  const captureAfter=captured;const abort=vm.runInContext("calendar(seed)",ctx);elements['#visit-cancel'].onclick();await abort;assert.equal(captured,captureAfter);
  // Genuine overnight timed events retain their actual start/end timestamps.
  vm.runInContext("seed=[{...planFixtures[0],id:'overnight',date:'2026-11-09',start:'23:00',end:'01:00',endDate:'2026-11-10',ongoing:false}];calendar(seed)",ctx);
  const overnight=await captured.text();assert.match(overnight,/DTSTART;TZID=America\/Los_Angeles:20261109T230000/);assert.match(overnight,/DTEND;TZID=America\/Los_Angeles:20261110T010000/);
  // A multi-event export asks separately; canceling the second downloads nothing.
  vm.runInContext("seed=[{...planFixtures[0],id:'hunt1',date:'2026-11-01',endDate:'2026-12-31',ongoing:true},{...planFixtures[0],id:'hunt2',title:'Second hunt',date:'2026-11-01',endDate:'2026-12-31',ongoing:true}]",ctx);
  const beforeBatch=captured;const batch=vm.runInContext('calendar(seed)',ctx);
  elements['#visit-date'].value='2026-11-15';elements['#visit-form'].onsubmit({preventDefault(){}});
  await Promise.resolve();assert.equal(elements['#visit-title'].textContent,'Second hunt');
  elements['#visit-cancel'].onclick();await batch;assert.equal(captured,beforeBatch);
  // Ended events disappear based on Pacific time; unknown endings and ongoing listings remain.
  ctx.Date=class extends Date {constructor(...args){super(...(args.length?args:['2026-11-07T23:00:00Z']))}static now(){return Date.parse('2026-11-07T23:00:00Z')}};
  vm.runInContext("seed=[{...planFixtures[0],id:'ended',title:'Ended',date:'2026-11-07',start:'09:00',end:'10:00',checked_at:'2026-11-07T20:00:00Z'},{...planFixtures[0],id:'active',title:'Still running',date:'2026-11-07',start:'14:00',end:'16:00',checked_at:'2026-11-07T20:00:00Z'},{...planFixtures[0],id:'unknown',title:'Unknown end',date:'2026-11-07',start:'09:00',end:null,checked_at:'2026-11-07T20:00:00Z'},{...planFixtures[0],id:'all-day',title:'Open across days',date:'2026-11-01',endDate:'2026-12-31',ongoing:true,start:'09:00',end:'10:00',checked_at:'2026-11-07T20:00:00Z'}];custom=[];saved=new Set(['ended']);hiddenIds=new Set();planSnapshots={};planAlerts={};view='discover';period='weekend';$('#cost').value='free';$('#city').value='';$('#age').value='';$('#category').value='';$('#search').value='';$('#weekends-only').checked=true;$('#show-hidden').checked=false;$('#include-unconfirmed').checked=false;$('#new-only').checked=false;render()",ctx);
  assert(!elements['#cards'].innerHTML.includes('data-save="ended"'));
  assert.match(elements['#cards'].innerHTML,/Still running/);assert.match(elements['#cards'].innerHTML,/Unknown end/);assert.match(elements['#cards'].innerHTML,/Open across days/);
  vm.runInContext("view='saved';render()",ctx);assert.match(elements['#cards'].innerHTML,/Ended/);
  assert.equal(vm.runInContext("pacificClock()",ctx),'15:00');
  assert.equal(vm.runInContext("hasEnded({date:'2026-11-07',start:'09:00',end:'15:00'})",ctx),true);
  assert.equal(vm.runInContext("hasEnded({date:'2026-11-06',endDate:'2026-11-07',ongoing:false,start:'23:00',end:'16:00'})",ctx),false);
  assert.match(vm.runInContext("conflictHTML({date:'2026-11-06',endDate:'2026-11-07',ongoing:false,start:'23:00',end:'01:00'},[])",ctx),/spans multiple dates/);
  // A selected future weekend is the default visit, clamped to activity dates.
  vm.runInContext("view='discover';period='chosen';selectedWeekend='2026-12-12';seed=[{...planFixtures[0],id:'long',title:'Long hunt',date:'2026-11-01',endDate:'2026-12-31',ongoing:true}]",ctx);
  const visit=vm.runInContext('calendar(seed)',ctx);assert.equal(elements['#visit-date'].value,'2026-12-12');
  elements['#visit-cancel'].onclick();await visit;
  vm.runInContext("seed[0].date='2026-12-13'",ctx);
  const sundayVisit=vm.runInContext('calendar(seed)',ctx);assert.equal(elements['#visit-date'].value,'2026-12-13');
  elements['#visit-cancel'].onclick();await sundayVisit;
  // Library rules distinguish actual library branches from an unrelated venue.
  assert.equal(vm.runInContext("allowedLibrary({venue:'Olive Branch Cafe · Oakland',source:'Calendar',url:'https://example.org/'})",ctx),true);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Rockridge Branch · Oakland',source:'Calendar',url:'https://example.org/'})",ctx),false);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Temescal Branch',source:'Oakland Public Library',url:'https://oaklandlibrary.bibliocommons.com/'})",ctx),true);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Other Branch · Oakland',source:'Oakland Public Library',url:'https://example.org/'})",ctx),false);
  assert.equal(vm.runInContext("allowedLibrary({venue:'Olive Branch Cafe',source:'Calendar',url:'https://otherlib.bibliocommons.com/event/1'})",ctx),false);
  // Never overwrite a good cache with malformed source metadata or event rows.
  storage.set('lw-feed-cache',JSON.stringify(feed));
  ctx.fetch=async()=>({ok:true,json:async()=>({schema_version:1,generated_at:'2026-11-07T20:00:00Z',events:[],sources:[null]})});
  await vm.runInContext('loadFeed()',ctx);
  assert.match(elements['#feed-status'].textContent,/last collection saved/);
  assert.equal(JSON.parse(storage.get('lw-feed-cache')).sources[0].id,'test');
  assert.equal(vm.runInContext('validFeed(feedInfo)',ctx),true);
  ctx.fetch=async()=>({ok:true,json:async()=>({...feed,events:[{id:'bad'}]})});
  await vm.runInContext('loadFeed()',ctx);assert.equal(JSON.parse(storage.get('lw-feed-cache')).sources[0].id,'test');
  storage.set('lw-feed-cache',JSON.stringify({schema_version:1,generated_at:'2026-11-07T20:00:00Z',events:[],sources:[null]}));
  vm.runInContext('feedInfo=null',ctx);await vm.runInContext('loadFeed()',ctx);
  assert.match(elements['#feed-status'].textContent,/Could not load/);
  assert.equal(vm.runInContext("validFeedEvent({...planFixtures[0],end:'99:30'})",ctx),false);
  assert.equal(vm.runInContext("validFeedEvent({...planFixtures[0],end:'08:30'})",ctx),false);
  const currentFeed=JSON.parse(fs.readFileSync(path.join(root,'site/data/events.json'),'utf8'));
  ctx.currentFeed=currentFeed;assert.equal(vm.runInContext('validFeed(currentFeed)',ctx),true);
  // UTF-8 calendar lines fold without splitting characters and unfold losslessly.
  const longLine='SUMMARY:'+('🌻éA'.repeat(50));ctx.longLine=longLine;
  const folded=vm.runInContext('foldCalendarLine(longLine)',ctx);
  assert.equal(folded.replace(/\r\n /g,''),longLine);
  for(const line of folded.split('\r\n'))assert(Buffer.byteLength(line,'utf8')<=75);
  assert.equal(vm.runInContext("icsEscape('one\\rtwo\\nthree')",ctx),'one\\ntwo\\nthree');
  assert.equal(vm.runInContext("validFeedEvent({...planFixtures[0],cat:undefined})",ctx),false);
  // Wrong-shaped browser data must not stop startup; valid saved copies survive.
  const validCopy={...ctx.planFixtures[0],source:'Your discovery'};
  const broken=new Map([['lw-saved',JSON.stringify({broken:true})],['lw-events',JSON.stringify([null,validCopy])],['lw-plan-snapshots',JSON.stringify({dated:validCopy,bad:{id:'bad'}})],['lw-plan-alerts',JSON.stringify({dated:'bad'})]]);
  const startupNodes={};
  const startup={...ctx,window:{addEventListener(){}},document:{querySelector(s){return startupNodes[s]??=node()},querySelectorAll(){return []},addEventListener(){},createElement(){return {click(){}}}},localStorage:{getItem(k){return broken.get(k)??null},setItem(k,v){broken.set(k,v)}},fetch:()=>new Promise(()=>{})};
  vm.createContext(startup);vm.runInContext(fs.readFileSync(path.join(root,'site/app.js'),'utf8'),startup);
  assert.equal(vm.runInContext('custom.length',startup),1);
  assert.equal(vm.runInContext('saved.size',startup),0);
  assert.equal(vm.runInContext("Object.hasOwn(planSnapshots,'dated')&&!Object.hasOwn(planSnapshots,'bad')",startup),true);
  assert.equal(vm.runInContext("Object.hasOwn(planAlerts,'dated')",startup),false);
  // Damaged optional listing metadata should not hide an otherwise valid saved plan.
  const withDamagedMetadata={...validCopy,listings:{broken:true},alternate_ids:'broken'};
  const damaged=new Map([['lw-saved',JSON.stringify(['dated'])],['lw-plan-snapshots',JSON.stringify({dated:withDamagedMetadata})]]);
  const damagedNodes={};
  const recovery={...ctx,window:{addEventListener(){}},document:{querySelector(s){return damagedNodes[s]??=node()},querySelectorAll(){return []},addEventListener(){},createElement(){return {click(){}}}},localStorage:{getItem(k){return damaged.get(k)??null},setItem(k,v){damaged.set(k,v)}},fetch:()=>new Promise(()=>{})};
  vm.createContext(recovery);vm.runInContext(fs.readFileSync(path.join(root,'site/app.js'),'utf8'),recovery);
  vm.runInContext("view='saved';render()",recovery);
  assert.match(damagedNodes['#cards'].innerHTML,/Craft one/);
  assert.equal(vm.runInContext("planSnapshots.dated.listings.length+planSnapshots.dated.alternate_ids.length",recovery),0);
  // Saved multi-day activities alert the user when the final date changes.
  vm.runInContext("seed=[{...planFixtures[0],endDate:'2026-11-09'}];custom=[];saved=new Set(['dated']);planSnapshots={dated:{...seed[0],endDate:'2026-11-08'}};planAlerts={};syncSavedSnapshots()",ctx);
  assert.match(vm.runInContext("planAlerts.dated.join(' ')",ctx),/End date: 2026-11-08 → 2026-11-09/);
  // An orphaned saved ID stays recoverable and can be removed without affecting real plans.
  vm.runInContext("seed=[{...planFixtures[0]}];custom=[];saved=new Set(['dated','missing-id']);planSnapshots={};planStates={};planAlerts={};view='saved';render()",ctx);
  assert.equal(elements['#count'].textContent,'(2)');
  assert.match(elements['#cards'].innerHTML,/Saved event details unavailable/);
  assert.match(elements['#cards'].innerHTML,/data-remove-missing="missing-id"/);
  documentListeners.click({target:{closest(){return {dataset:{removeMissing:'dated'}}}}});
  assert.equal(vm.runInContext("saved.has('dated')",ctx),true);
  documentListeners.click({target:{closest(){return {dataset:{removeMissing:'missing-id'}}}}});
  assert.equal(vm.runInContext("saved.has('missing-id')",ctx),false);
  assert.equal(elements['#count'].textContent,'(1)');
  assert.match(fs.readFileSync(path.join(root,'site/index.html'),'utf8'),/id="include-unconfirmed" checked/);
  // A second tab sees saves from the first before making its own change.
  vm.runInContext("seed=planFixtures.map(e=>({...e}));custom=[];saved=new Set();planSnapshots={};planStates={};planAlerts={};hiddenIds=new Set();persist()",ctx);
  storage.set('lw-saved',JSON.stringify(['dated']));
  storage.set('lw-plan-snapshots',JSON.stringify({dated:ctx.planFixtures[0]}));
  assert.equal(typeof windowListeners.storage,'function');
  windowListeners.storage({key:'lw-saved'});
  vm.runInContext("toggleSaved('overlap')",ctx);
  assert.deepEqual(JSON.parse(storage.get('lw-saved')).sort(),['dated','overlap']);
  vm.runInContext("refreshFromOtherTab({key:'unrelated',storageArea:localStorage})",ctx);
  assert.equal(vm.runInContext('saved.size',ctx),2);
  console.log('Passed frontend checks: feed loading, filters, ongoing order, calendar range, escaping, failure messages, source health, cached freshness, provenance, saved-ID migration, weekend selection, plan statuses, conflicts, directions, backup validation/merge, visit badges, hide/restore, saved-plan independence, refresh persistence, alias migration, and backup safety.');
 }catch(e){console.error(e);process.exitCode=1}
});
