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
function node(){return {value:'',textContent:'',innerHTML:'',style:{},classList:{toggle(){}},addEventListener(){},showModal(){},close(){}}}
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
  console.log('Passed frontend checks: feed loading, filters, ongoing order, calendar range, escaping, failure messages, source health, cached freshness, provenance, and saved-ID migration.');
 }catch(e){console.error(e);process.exitCode=1}
});
