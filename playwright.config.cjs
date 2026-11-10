const {defineConfig}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests/browser',
  timeout:30000,
  workers:1,
  reporter:'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    browserName:'chromium',
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {},
    trace:'retain-on-failure'
  },
  webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory site',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:15000}
});
