// Viewport regression for the iPhone home and the full-screen iPad app.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.js'?'text/javascript':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.AGENTHQ_TEST_CHROME||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const core=new Set(['app.js','agent-home-layout.js','agent-message-controls.js','agent-research-status.js','icons.js']);
await page.route('**/*',async route=>{const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1);if(url.hostname==='geocoding-api.open-meteo.com'){await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{latitude:39.96,longitude:-83,name:'Columbus'}]})});return;}if(url.hostname==='api.open-meteo.com'){await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({current:{temperature_2m:72,weather_code:0},daily:{time:['2026-10-25','2026-10-26'],temperature_2m_max:[75,73],temperature_2m_min:[55,51]}})});return;}if(url.origin!==base){await route.abort();return;}if(name.endsWith('.js')&&!core.has(name)){await route.fulfill({contentType:'text/javascript',body:''});return;}await route.continue();});
function approx(value,target){assert(Math.abs(value-target)<=1,`${value} instead of ${target}`)}
async function home(width,height,columns,file){
 await page.setViewportSize({width,height});
 await page.evaluate(()=>window.agentHQCameraReturnToChat(null));
 await page.waitForSelector('.home-pages .home-dashboard');
 await page.evaluate(()=>document.documentElement.style.setProperty('--wallpaper','linear-gradient(120deg,#dea35d,#173c56)'));
 const geometry=await page.evaluate(()=>{
  const shell=document.querySelector('.home-shell'),grid=document.querySelector('.home-dashboard'),icon=grid.querySelector('.app-icon'),label=grid.querySelector('.tile-label');
  const b=shell.getBoundingClientRect(),g=grid.getBoundingClientRect();
  return {x:b.x,width:b.width,height:b.height,gridRight:g.right,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,icon:icon.getBoundingClientRect().width,label:parseFloat(getComputedStyle(label).fontSize),wallpaper:getComputedStyle(shell).backgroundImage,scroll:document.documentElement.scrollWidth};
 });
 approx(geometry.x,0);approx(geometry.width,width);assert(geometry.height>=height-1);assert.equal(geometry.columns,columns);assert(geometry.gridRight<=width+1);assert(geometry.scroll<=width+1);assert.match(geometry.wallpaper,/linear-gradient/);
 if(width>=700){assert(geometry.icon>=64);assert(geometry.label>=12);}else{assert(geometry.icon<=60);assert(geometry.label<=11.5);}
 await page.screenshot({path:file});return geometry;
}
try{
 await page.goto(base+'/index.html');await page.waitForSelector('.home-pages .home-dashboard');await mkdir('/tmp/agenthq-ipad-layout',{recursive:true});
 await home(390,844,4,'/tmp/agenthq-ipad-layout/iphone.png');
 assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'iPhone home scrolls vertically');
 await page.locator('[data-home-page="1"]').click();assert.equal(await page.locator('[data-home-slide="1"] .home-widget').count(),3);assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));await page.locator('[data-home-page="0"]').click();
 await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>localStorage.removeItem('agenthq-home-layout-v1'));await page.reload();await page.waitForSelector('.home-pages .home-dashboard');
 await home(820,1180,6,'/tmp/agenthq-ipad-layout/ipad-portrait.png');
 assert.equal(await page.locator('[data-home-slide="0"] .home-widget').count(),5);
 const dots=await page.locator('.home-page-navigation').boundingBox();assert(dots.y>900,`Page dots too high: ${dots.y}`);
 await page.locator('[data-home-slide="0"] [data-home-widget-open="notes"]').click();
 await page.locator('#home-note').fill('Ask Riley about the campaign');await page.locator('[data-widget-note-form] button').click();
 assert.match(await page.locator('.widget-note-list').innerText(),/Ask Riley about the campaign/);
 await page.locator('.widget-sheet [data-widget-close]').click();
 await page.locator('[data-home-slide="0"] [data-home-widget-open="clock"]').click();await page.locator('[data-widget-clock-toggle]').click();
 assert.equal(await page.locator('[data-widget-clock-face] .widget-analog i').count(),2);await page.locator('.widget-sheet [data-widget-close]').click();
 await page.locator('[data-home-slide="0"] [data-home-widget-open="calendar"]').click();assert.match(await page.locator('.widget-sheet').innerText(),/View assignments/);const month=await page.locator('.widget-month-head strong').innerText();await page.locator('[data-widget-month="1"]').click();assert.notEqual(await page.locator('.widget-month-head strong').innerText(),month);await page.locator('.widget-sheet [data-widget-close]').click();
 await page.locator('[data-home-slide="0"] [data-home-widget-open="weather"]').click();await page.locator('#home-weather-city').fill('Columbus, Ohio');await page.locator('[data-widget-weather-form] button').click();await page.getByText('72° · Columbus').first().waitFor();await page.locator('.widget-sheet [data-widget-close]').click();
 const weatherBox=await page.locator('[data-home-slide="0"] [data-home-widget-tile="weather"]').boundingBox(),notesBox=await page.locator('[data-home-slide="0"] [data-home-widget-tile="notes"]').boundingBox();
 await page.mouse.move(weatherBox.x+weatherBox.width/2,weatherBox.y+weatherBox.height/2);await page.mouse.down();await page.waitForTimeout(520);await page.locator('.home-drag-ghost.home-widget-wrap').waitFor();await page.mouse.move(notesBox.x+notesBox.width/2,notesBox.y+notesBox.height/2,{steps:10});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.home-drag-ghost'));
 assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')).pages[0].order)).indexOf('widget:weather')>12,'Widget did not move in app grid');await page.locator('[data-home-edit]').click();
 const weatherMoved=await page.locator('[data-home-slide="0"] [data-home-widget-tile="weather"]').boundingBox();await page.mouse.move(weatherMoved.x+weatherMoved.width/2,weatherMoved.y+weatherMoved.height/2);await page.mouse.down();await page.waitForTimeout(100);await page.locator('.home-drag-ghost.home-widget-wrap').waitFor();await page.mouse.move(816,weatherMoved.y+weatherMoved.height/2,{steps:8});await page.waitForTimeout(650);await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.home-drag-ghost'));assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')).pages[1].widgets)).includes('weather'),'Widget did not cross pages');await page.locator('[data-home-edit]').click();await page.waitForTimeout(400);await page.locator('[data-home-page="0"]').click();
 await home(1180,820,8,'/tmp/agenthq-ipad-layout/ipad-landscape.png');
 await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>window.agentHQCameraReturnToChat(null));
 await page.emulateMedia({colorScheme:'dark'});assert.match(await page.locator('.home-shell').evaluate(e=>getComputedStyle(e).backgroundImage),/linear-gradient/);
 await page.emulateMedia({colorScheme:'light'});
 const first=await page.locator('[data-home-slide="0"] [data-home-item="office"] [data-home-tile]').boundingBox(),target=await page.locator('[data-home-slide="0"] [data-home-item="contacts"]').boundingBox();
 await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.locator('.home-drag-ghost').waitFor();
 await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:10});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.home-drag-ghost'));
 assert.equal(await page.locator('.home-pages .home-dashboard').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),6);
 const original=await page.locator('.home-dashboard').first().locator('[data-home-item]').evaluateAll(items=>items.map(e=>e.dataset.homeItem));
 await page.locator('[data-home-item="office"] [data-home-tile]').focus();await page.keyboard.press('Alt+ArrowDown');
 const moved=await page.locator('.home-dashboard').first().locator('[data-home-item]').evaluateAll(items=>items.map(e=>e.dataset.homeItem));
 assert.equal(moved.indexOf('office'),Math.min(original.length-1,original.indexOf('office')+6));
 await page.locator('[data-home-edit]').click();
 await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>window.agentHQCameraReturnToChat('riley'));await page.waitForSelector('.ios-chat-shell');
 let shell=await page.locator('.ios-chat-shell').boundingBox();approx(shell.x,0);approx(shell.width,820);
 let composer=await page.locator('#composer').boundingBox();assert(composer.x>=0&&composer.x+composer.width<=821);
 await page.evaluate(()=>window.agentHQCameraReturnToChat(null));await page.evaluate(()=>document.querySelector('[data-nav="settings"]').click());await page.waitForSelector('.settings-shell');
 shell=await page.locator('.settings-shell').boundingBox();approx(shell.x,0);approx(shell.width,820);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'/tmp/agenthq-ipad-layout/settings.png'});
 assert.deepEqual(errors,[]);console.log('iPhone, iPad portrait/landscape, Messages and Settings fill their viewports.');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
