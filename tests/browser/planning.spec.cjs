const {test,expect}=require('@playwright/test');

// Fixed time and synthetic feed keep this journey independent of live listings.
const fixture={
  schema_version:1,generated_at:'2026-11-04T20:00:00Z',last_successful_collection:'2026-11-04T20:00:00Z',
  collection_summary:{previous_count:0,current_count:1,added:1,removed_expired:0,removed_other:0,retained_unchecked:0},
  collection_history:[
    ...[1,2,3].map(day=>({generated_at:`2026-11-0${day}T20:00:00Z`,event_count:8,sources:[{id:'test',name:'Example source',state:'ok',count:8,unit:'events'}]})),
    {generated_at:'2026-11-04T20:00:00Z',event_count:1,sources:[{id:'test',name:'Example source',state:'ok',count:1,unit:'events'}]}
  ],
  sources:[{id:'test',name:'Example source',url:'https://example.org/',mode:'automatic',state:'ok',count:1,last_success:'2026-11-04T20:00:00Z'}],
  events:[{id:'test-craft',title:'Family craft day',date:'2026-11-07',start:'10:00',end:'11:00',
    city:'Oakland',venue:'Example venue',price:'Free',min:null,max:null,cat:'Art & crafts',source:'Example source',
    source_id:'test',status:'Check organizer',desc:'Synthetic event for testing.',url:'https://example.org/event',checked_at:'2026-11-04T20:00:00Z'}],
  guides:[]
};

test.beforeEach(async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-04T20:00:00Z'));
  await page.route('**/data/events.json',route=>route.fulfill({json:fixture}));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto('/',{waitUntil:'domcontentloaded'});
});

test('save a plan, reload, and see collection dashboard',async ({page})=>{
  const cards=page.locator('#cards');
  await expect(cards.getByRole('heading',{name:'Family craft day'})).toBeVisible();
  await cards.getByRole('button',{name:'Save Family craft day'}).click();
  await page.getByRole('button',{name:/^My plans/}).click();
  await expect(page.getByRole('heading',{name:'Your saved outings'})).toBeVisible();
  await expect(cards.getByRole('heading',{name:'Family craft day'})).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/^My plans/}).click();
  await expect(cards.getByRole('heading',{name:'Family craft day'})).toBeVisible();
  await expect(cards.getByRole('button',{name:'Unsave Family craft day'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Sources',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Collection dashboard'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Collection history'})).toBeVisible();
  await expect(page.locator('.history-run').first()).toContainText('Example source');
  await expect(page.getByRole('heading',{name:'Unusual changes'})).toBeVisible();
  await expect(page.locator('.change-panel')).toContainText('typical count was 8');
  await expect(page.locator('#sources-view')).toContainText('1 events found in latest scan');
});

test('download a calendar event with the right date and time',async ({page})=>{
  const button=page.locator('#cards').getByRole('button',{name:'Add Family craft day to calendar'});
  await expect(button).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
  expect(download.suggestedFilename()).toBe('little-weekends.ics');
  const stream=await download.createReadStream();
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const calendar=Buffer.concat(chunks).toString('utf8').replace(/\r\n /g,'');
  expect(calendar).toContain('BEGIN:VCALENDAR');
  expect(calendar).toContain('DTSTART;TZID=America/Los_Angeles:20261107T100000');
  expect(calendar).toContain('DTEND;TZID=America/Los_Angeles:20261107T110000');
  expect(calendar).toContain('SUMMARY:Family craft day');
  expect(calendar).toContain('END:VCALENDAR');
});

test('preview the coming weekend without sending email',async ({page})=>{
  await page.getByText('Preview this weekend’s digest').click();
  const digest=page.locator('#digest-content');
  await expect(digest).toContainText('Family craft day');
  await expect(digest).toContainText('Preview only—no email is sent');
  await page.locator('#cards').getByRole('button',{name:'Hide Family craft day'}).click();
  await expect(digest).not.toContainText('Family craft day');
  await expect(digest).toContainText('No visible free events');
});

test('recommendations explain matches and persist locally',async ({page})=>{
  await page.getByText('Personalize recommendations').click();
  await page.getByLabel('Preferred city').selectOption({label:'Oakland'});
  await page.getByLabel('Preferred activity').selectOption({label:'Art & crafts'});
  await page.getByLabel('Age match').selectOption('both');
  await page.getByLabel('Rank by my preferences').check();
  const card=page.locator('#cards').locator('article').filter({hasText:'Family craft day'});
  await expect(card).toContainText('5 points');
  await expect(card).toContainText('Preferred city');
  await expect(card).toContainText('Age range not listed');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#cards').locator('article').filter({hasText:'Family craft day'})).toContainText('5 points');
});

test('phone layout fits and main controls can be used',async ({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile-chromium','Phone-sized viewport only');
  await expect(page.locator('#cards').getByRole('heading',{name:'Family craft day'})).toBeVisible();
  const dimensions=await page.evaluate(()=>({screen:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.screen);
  await page.getByRole('button',{name:'Sources',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Collection dashboard'})).toBeVisible();
  const sourcesDimensions=await page.evaluate(()=>({screen:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
  expect(sourcesDimensions.content).toBeLessThanOrEqual(sourcesDimensions.screen);
});
