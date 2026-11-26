import {chromium,webkit,devices} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {extname,resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('dist');
const bank=JSON.parse(gunzipSync(await readFile('dist/ram-exams/POL1101.gz')).toString('utf8'));
const firstSet=String(bank.items[0].set);
const list=bank.items.filter(q=>String(q.set)===firstSet);
assert.ok(list.length>3);
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw Error('invalid path');
  const data=await readFile(path);
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});
  res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(3001,'127.0.0.1',r));
await mkdir('test-results',{recursive:true});
try{
 for(const [label,browserType,mobile] of [['desktop',chromium,false],['mobile-webkit',webkit,true]]){
  const browser=await browserType.launch();
  const context=await browser.newContext(mobile?{...devices['iPhone 13']}:{viewport:{width:1300,height:940}});
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:3001'?route.continue():route.abort());
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:3001/ram-exams/practice.html?course=POL1101');
   await page.locator('#options .choice').first().waitFor();
   assert.ok((await page.locator('#title').innerText()).includes('POL1101'));
   assert.ok(await page.locator('.ram-hero').isVisible(),'course heading has RU theme');
   assert.ok(await page.locator('.ram-overview').isVisible(),'live scorecards appear above questions');
   assert.equal(await page.locator('#stat-answered').innerText(),'0/'+list.length);
   const first=list[0],second=list[1];
   await page.locator('#options .choice').nth(first.a).click();
   assert.equal(await page.locator('#stat-correct').innerText(),'1');
   assert.ok((await page.locator('#feedback-title').innerText()).includes('ถูกต้อง'));
   // Reproduce the phone bug: navigation starts well below a tall explanation.
   await page.locator('#feedback-why').evaluate(node=>{node.textContent='คำอธิบายยาวมาก '.repeat(150);});
   await page.locator('#next').click();
   async function checkQuestionTop(){
    await page.waitForFunction(()=>{
     const q=document.getElementById('question').getBoundingClientRect(),bar=document.querySelector('.ram-topbar').getBoundingClientRect();
     return q.top>=bar.bottom-1&&q.top<Math.min(window.innerHeight-20,bar.bottom+150);
    });
   }
   await checkQuestionTop();
   assert.equal(await page.locator('#number').inputValue(),'2');
   await page.locator('#options .choice').nth((second.a+1)%second.o.length).click();
   assert.equal(await page.locator('#stat-wrong').innerText(),'1');
   await page.locator('#prev').click();await checkQuestionTop();
   assert.equal(await page.locator('#number').inputValue(),'1');
   await page.locator('#next').click();await checkQuestionTop();
   await page.locator('#finish').click();
   assert.ok(await page.locator('#results').isVisible(),'partial score is available');
   assert.equal(await page.locator('#final-score').innerText(),'1/'+list.length);
   assert.equal(await page.locator('#final-wrong').innerText(),'1');
   assert.equal(await page.locator('#final-pending').innerText(),String(list.length-2));
   await page.locator('#back-to-questions').click();
   assert.ok(await page.locator('#exercise').isVisible(),'return to questions without discarding answers');
   await checkQuestionTop();
   assert.equal(await page.locator('#stat-answered').innerText(),'2/'+list.length);

   // Answer remaining questions via the legacy keys, then reload the page to
   // prove final scoring uses previously persisted answers, not session state.
   await page.evaluate(entries=>{
    for(const q of entries)localStorage.setItem('ru:ram-test-hub:POL1101:'+q.id,String(q.a));
   },list.slice(2).map(q=>({id:q.id,a:q.a})));
   await page.reload();
   await page.locator('#options .choice').first().waitFor();
   assert.equal(await page.locator('#stat-answered').innerText(),list.length+'/'+list.length);
   await page.locator('#finish').click();
   assert.ok((await page.locator('#results-subtitle').innerText()).includes('ทำครบ'));
   assert.equal(await page.locator('#final-score').innerText(),(list.length-1)+'/'+list.length);
   assert.equal(await page.locator('#final-pending').innerText(),'0');
   assert.equal(await page.locator('#final-percent').innerText(),Math.round((list.length-1)/list.length*100)+'%');
   await page.locator('#review-wrong').click();
   assert.equal(await page.locator('#number').inputValue(),'2','review button jumps to an incorrect answer');
   await page.locator('#finish').click();
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#reset-set').click();
   assert.equal(await page.locator('#stat-answered').innerText(),'0/'+list.length,'restart clears only current-set answers');
   assert.equal(await page.evaluate(id=>localStorage.getItem('ru:ram-test-hub:POL1101:'+id),first.id),null);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(overflow<=2,'quiz should not overflow the viewport horizontally: '+overflow);
   assert.deepEqual(errors,[],'no JavaScript errors in quiz');
   await page.screenshot({path:'test-results/ram-practice-'+label+'.png',fullPage:true});
   console.log(label+': unified Ram quiz, final score, persistence and reset PASS');
  }finally{await context.close();await browser.close();}
 }
}finally{await new Promise(r=>server.close(r));}
