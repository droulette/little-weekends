const {defineConfig}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests/browser',
  timeout:30000,
  workers:1,
  reporter:'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure'
  },
  projects:[
    {name:'chromium',use:{browserName:'chromium',viewport:{width:1280,height:800}}},
    {name:'firefox',use:{browserName:'firefox',viewport:{width:1280,height:800}}},
    // Chromium emulates a phone-sized touch viewport; this is not iOS Safari.
    {name:'mobile-chromium',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
  ],
  webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory site',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:15000}
});
