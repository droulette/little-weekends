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
const elements={};const storage=new Map();
function node(){return {value:'',textContent:'',innerHTML:'',style:{},listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn},showModal(){},close(){},click(){}}}
let captured;
class TestURL extends URL {static createObjectURL(b){captured=b;return 'blob:test'}static revokeObjectURL(){}}
class TestDate extends Date { constructor(...args){super(...(args.length?args:['2026-11-04T20:00:00Z']))} static now(){return Date.parse('2026-11-04T20:00:00Z')} }
const ctx={Intl,Date:TestDate,Set,URL:TestURL,Blob,
 document:{querySelector(s){return elements[s]??=node()},querySelectorAll(){return []},addEventListener(){},createElement(){return {click(){}}}},
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
  vm.runInContext(`calendar(seed.filter(e=>e.id==='ikea-gnomes'))`,ctx);
  const ics=await captured.text();assert.match(ics,/DTEND;VALUE=DATE:20270101/);
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
  console.log('Passed frontend checks: feed loading, filters, ongoing order, calendar range, escaping, failure messages, source health, cached freshness, provenance, saved-ID migration, weekend selection, plan statuses, conflicts, directions, backup validation/merge, and visit badges.');
 }catch(e){console.error(e);process.exitCode=1}
});
