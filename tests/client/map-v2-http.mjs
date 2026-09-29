import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=process.env.NO7_ENTRY_TEST_ROOT;assert.match(root??'',/^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture=JSON.parse(readFileSync(`${root}/economy-fixture.json`));
const origin='http://127.0.0.1:8792';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
 let session=await(await page.request.get(origin+'/client/session')).json();
 const login=await page.request.post(origin+'/login-user',{headers:{Accept:'application/json','X-CSRF-TOKEN':session.csrfToken},data:{username:fixture.user,password:'fixture-password'}});
 assert.equal(login.status(),200,await login.text());
 session=await(await page.request.get(origin+'/client/session')).json();const headers={Accept:'application/json','X-CSRF-TOKEN':session.csrfToken};
 const snapshot=JSON.parse(readFileSync('/tmp/no7-map-v2-40-30-7.json'));
 const saved=await page.request.post(origin+'/client/admin/api/maps',{headers,data:{name:'Microcell HTTP fixture',map:snapshot},timeout:120000});
 assert.equal(saved.status(),201,(await saved.text()).slice(0,700));const draft=await saved.json();
 const loaded=await page.request.get(origin+`/client/admin/api/maps/${draft.id}`,{headers});assert.equal(loaded.status(),200);assert.deepEqual((await loaded.json()).map,snapshot);
 const created=await page.request.post(origin+'/client/admin/api/games',{headers,data:{map_draft_id:draft.id},timeout:120000});assert.equal(created.status(),201,(await created.text()).slice(0,700));const game=await created.json();
 const publicMap=await page.request.get(origin+`/game/map?game_id=${game.game_id}`,{headers});assert.equal(publicMap.status(),200);assert.deepEqual((await publicMap.json()).map,snapshot);
 await page.goto(origin+'/client/admin');await page.getByRole('link',{name:'Map workspace',exact:true}).click();
 await page.waitForSelector('.map-studio-tabs');
 await page.screenshot({path:'test-results/client/map-workspace-v2-real-admin.png'});
 await page.goto(origin+`/client?game_id=${game.game_id}`);await page.waitForTimeout(1500);
 assert.deepEqual(errors,[]);console.log(`PASS: real HTTP saved/reloaded a custom world, created game ${game.game_id}, served identical geography and mounted administration/game without JS errors.`);
}finally{await browser.close();}
