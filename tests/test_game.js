// 小狗找寶藏 v2 測試：共用 ⚙️ 設定、拼音／注音、繁簡、三語介面、語速、第 4 關按錯整組重來、
// 第 1 關提示、暫停／再聽一次、計分不含語音時間、排行榜只留最高分、GA 不送名字。
// 用法：node tests/run.js（語音與 Firebase 都用替身，不會碰到真的資料庫）
let chromium; try{ ({ chromium } = require('playwright')); }catch(e){ ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
let pass = 0, fail = 0;
const ok = (c, n, x) => { if(c){ pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x !== undefined ? '→ ' + JSON.stringify(x) : ''); } };
const BASE = process.env.BASE_URL || 'http://localhost:8766';
const KEY = 'hanziGames.settings';

const APP = `export const initializeApp=(cfg,name)=>({name:name||'[DEFAULT]',options:cfg});`;
const AUTH = `
export const getAuth=app=>({currentUser:null,authStateReady:async()=>{},app});
export const signInAnonymously=async()=>({user:{uid:'anon',isAnonymous:true}});`;
const FS = `
const D=window.__DATA=window.__DATA||{};
export const getFirestore=app=>({app});
export const collection=(db,...p)=>({path:p.join('/')});
export const doc=(db,...p)=>({path:p.join('/'),id:p[p.length-1]});
export const query=(c)=>c; export const orderBy=()=>0; export const limit=()=>0;
export const getDoc=async r=>({exists:()=>D[r.path]!==undefined,data:()=>JSON.parse(JSON.stringify(D[r.path])),id:r.id});
export const getDocs=async q=>({docs:Object.keys(D).filter(k=>k.startsWith(q.path+'/')&&k.split('/').length===q.path.split('/').length+1).map(k=>({id:k.split('/').pop(),data:()=>JSON.parse(JSON.stringify(D[k]))}))});
export const setDoc=async(r,d)=>{D[r.path]=JSON.parse(JSON.stringify(d));};
export const serverTimestamp=()=>Date.now();`;

// 語音替身：記錄唸了什麼、用什麼速度；每句 speechMs 毫秒後唸完
const SPEECH = ms => `
  window.__said=[];window.SpeechSynthesisUtterance=function(t){this.text=t;};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'zh-TW',name:'tw'}],cancel(){},
    speak(u){window.__said.push({text:u.text,rate:u.rate,at:Date.now()});setTimeout(()=>u.onend&&u.onend(),${ms});}}});`;

async function open(browser, { ls = null, speechMs = 10, data = {} } = {}){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', r => {
    const u = r.request().url();
    if(u.startsWith('http://localhost')) return r.continue();
    const js = b => r.fulfill({ status: 200, contentType: 'application/javascript', body: b });
    if(u.endsWith('/firebase-app.js')) return js(APP);
    if(u.endsWith('/firebase-auth.js')) return js(AUTH);
    if(u.endsWith('/firebase-firestore.js')) return js(FS);
    return r.abort();
  });
  await page.addInitScript('window.__DATA=' + JSON.stringify(data) + ';');
  await page.addInitScript(SPEECH(speechMs));
  if(ls) await page.addInitScript('try{if(!sessionStorage.getItem("__ls")){' + Object.keys(ls).map(k => 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(ls[k]) + ');').join('') + 'sessionStorage.setItem("__ls","1");}}catch(e){}');
  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(300);
  return { page, ctx, errors };
}
const settings = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const txt = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());
async function enter(page, level = 'level1', name = 'Ana'){
  await page.fill('#playerNameInput', name);
  await page.click(`.gateDiffBtn[data-level="${level}"]`);
  await page.click('#nameGateBtn');
  await page.waitForTimeout(150);
}
// 照指令一直按對的方向，直到找到寶藏
const SOLVE = `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));
  for(let n=0;n<3000&&state.playing;n++){ if(state.awaitingKeyAnnouncement||state.paused){await sl(20);continue;}
    pressDirection(state.instructions[state.curIndex].dir); await sl(2);} })()`;
async function solveAndWaitResult(page){
  await page.evaluate(SOLVE);
  await page.waitForFunction(() => document.getElementById('resultModal').style.display === 'flex', null, { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();

  console.log('共用 ⚙️ 設定');
  {
    const { page, ctx, errors } = await open(browser, { ls: { [KEY]: JSON.stringify({ v:1, script:'simp', lang:'en', phon:'zhuyin', rate:'slow', other:'keep' }) } });
    const s = await settings(page);
    ok(s.script === 'simp' && s.lang === 'en' && s.phon === 'zhuyin' && s.rate === 'slow', '讀到別款遊戲存的設定', s);
    const title = await txt(page, '#nameCard h1');
    ok(title.includes('小狗找宝藏') && title.includes('El Perrito'), '標題跟著简体＋英文', title);
    ok((await txt(page, '#namePrompt')).includes('explorer'), '介面英文小字', await txt(page, '#namePrompt'));
    await page.click('#gateGear');
    ok(await page.isVisible('#setov'), '⚙️ 打開設定視窗');
    await page.click('#setov .opt[data-k="lang"][data-v="es"]');
    await page.click('#setov .opt[data-k="script"][data-v="trad"]');
    await page.click('#setov .opt[data-k="rate"][data-v="normal"]');
    await page.waitForTimeout(150);
    const s2 = await settings(page);
    ok(s2.lang === 'es' && s2.script === 'trad' && s2.rate === 'normal' && s2.other === 'keep', '寫回共用設定且保留別款的欄位', s2);
    const said = await page.evaluate(() => window.__said);
    ok(said.length === 0, '改語速不會唸任何聲音', said);
    await page.click('#setDone');
    ok((await txt(page, '#nameCard h1')).includes('小狗找寶藏'), '關掉後畫面變繁體');
    ok((await page.$eval('#playerNameInput', e => e.maxLength)) === 12, '名字最多 12 字');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('只有中文、拼音／注音、繁簡');
  {
    const { page, ctx, errors } = await open(browser, { ls: { [KEY]: JSON.stringify({ v:1, script:'trad', lang:'zh', phon:'pinyin', rate:'normal' }) } });
    ok(!(await txt(page, '#namePrompt')).match(/[a-z]/i), '只有中文：沒有外語小字', await txt(page, '#namePrompt'));
    await page.evaluate(() => { Math.random = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })(); });
    await enter(page, 'level1');
    const box = await page.$eval('#instructionBox', e => e.innerHTML);
    ok(/class="ph"/.test(box) && /(qián|xiàng|hòu)/.test(box), '指令上方有拼音', box.slice(0, 200));
    // 「一格」唸 yì、「兩格」liǎng
    const tk1 = await page.evaluate(() => moveToks('forward', 1).map(x => x.p).join(' '));
    const tk2 = await page.evaluate(() => moveToks('backward', 2).map(x => x.p).join(' '));
    const tk11 = await page.evaluate(() => moveToks('forward', 11).map(x => x.p).join(' '));
    ok(tk1 === 'qián jìn yì gé' && tk2 === 'hòu tuì liǎng gé' && tk11 === 'qián jìn shí yī gé', '讀音：一格 yì、兩格 liǎng、十一格 shí yī', [tk1, tk2, tk11]);
    ok((await page.evaluate(() => tradOf(KEY_TK))) === '找到鑰匙了！前往寶藏', '找到鑰匙的句子');
    await page.click('#gameGear');
    ok(await page.evaluate(() => state.paused), '遊戲中按 ⚙️ 會暫停');
    await page.click('#setov .opt[data-k="phon"][data-v="zhuyin"]');
    await page.click('#setov .opt[data-k="script"][data-v="simp"]');
    const box2 = await page.$eval('#instructionBox', e => e.innerHTML);
    ok(/ph zy/.test(box2) && /[ㄅ-ㄩ]/.test(box2) && !/class="ph">[a-z]/.test(box2), '改成注音', box2.slice(0, 200));
    const zy = await page.evaluate(() => zhHtml(KEY_TK));
    ok(zy.includes('˙ㄕ') && zy.includes('˙ㄌㄜ') && zy.includes('钥'), '注音：匙 ˙ㄕ、了 ˙ㄌㄜ；简体「钥」', zy.slice(0, 120));
    await page.click('#setov .opt[data-k="phon"][data-v="off"]');
    ok(!(await page.$eval('#instructionBox', e => e.innerHTML)).includes('class="ph'), '關掉就沒有拼音注音');
    await page.click('#setDone');
    ok(!(await page.evaluate(() => state.paused)), '關掉設定後繼續');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('第 1 關：整局、評語、提示、GA 不送名字、不上排行榜');
  {
    const { page, ctx, errors } = await open(browser);
    await enter(page, 'level1', 'Pedrito');
    const rate = await page.evaluate(() => window.__said[0] && window.__said[0].rate);
    ok(rate === 0.65, '預設語速正常 = 0.65', rate);
    // 同一句連錯 3 次 → 方向鍵發亮
    await page.waitForTimeout(100);
    await page.evaluate(() => { const right = state.instructions[state.curIndex].dir; const wrong = DIRS.find(d => d !== right); pressDirection(wrong); pressDirection(wrong); pressDirection(wrong); });
    await page.waitForTimeout(1100);
    const glow = await page.evaluate(() => { const b = document.querySelector('#dpad .hintGlow'); return b && b.id === DPAD_ID[state.instructions[state.curIndex].dir]; });
    ok(glow, '同一句錯 3 次，該按的方向鍵發亮');
    await page.evaluate(() => pressDirection(state.instructions[state.curIndex].dir));
    ok(!(await page.$('#dpad .hintGlow')), '按對之後提示消失');
    await solveAndWaitResult(page);
    const res = await txt(page, '#resultCard');
    ok(res.includes('慢慢來') || res.includes('不錯') || res.includes('很棒') || res.includes('沒關係'), '有錯 → 不是「完美」評語', res);
    ok(await page.$('#practiceHint') && !(await page.$('#lbArea')), '第 1 關顯示練習提示、不上排行榜');
    const order = await page.$eval('#resultCard', el => ['resScore', 'commentLine', 'practiceHint', 'againBtn', 'nextLevelBtn', 'resMenuBtn'].map(id => [...el.querySelectorAll('*')].findIndex(x => x.id === id)));
    ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), '結果順序：分數 → 評語 → 提示 → 再玩 → 下一關 → 主選單', order);
    const leak = await page.evaluate(() => JSON.stringify(window.dataLayer || []).includes('Pedrito'));
    ok(!leak, 'Analytics 沒有送名字');
    const data = await page.evaluate(() => Object.keys(window.__DATA));
    ok(!data.length, '第 1 關不寫排行榜', data);
    // 下一關
    await page.click('#nextLevelBtn');
    ok((await page.evaluate(() => state.difficulty)) === 'level2' && (await page.evaluate(() => state.playing)), '下一關 → 第 2 關開始');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('第 4 關：連續指令一句一句唸、按錯整組重來');
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 30 });
    // 找一個「第一組至少兩句、第一句是前進或後退好幾格」的地圖
    await page.evaluate(() => {
      state.selectedLevel = 'level4';
    });
    await enter(page, 'level4');
    let tries = 0;
    while(tries++ < 60){
      const okMap = await page.evaluate(() => { const c = state.chunkLabels.get(0); return c && c.texts.length >= 2; });
      if(okMap) break;
      await page.evaluate(() => startGame());
    }
    await page.waitForTimeout(1200);
    const said = await page.evaluate(() => window.__said.map(s => s.text));
    const chunk = await page.evaluate(() => state.chunkLabels.get(0).texts);
    ok(chunk.every(t => said.includes(t)), '一組裡的每一句都分開唸', { said, chunk });
    const gap = await page.evaluate(() => { const s = window.__said; return s.length >= 2 ? s[1].at - s[0].at : 0; });
    ok(gap >= 600, '句子之間有停頓（正常 0.6 秒）', gap);
    ok((await txt(page, '#instructionBox')).includes('仔細聽'), '第 4 關不顯示文字');
    // 先按對第一句，再按錯 → 回到這一組起點
    const before = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol, f: state.facing }));
    await page.evaluate(() => pressDirection(state.instructions[state.curIndex].dir));
    const mid = await page.evaluate(() => state.curIndex + state.stepsDone);
    ok(mid > 0, '按對一下有前進');
    await page.evaluate(() => { const right = state.instructions[state.curIndex].dir; pressDirection(DIRS.find(d => d !== right)); });
    const after = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol, f: state.facing, i: state.curIndex, s: state.stepsDone }));
    ok(after.r === before.r && after.c === before.c && after.f === before.f && after.i === 0 && after.s === 0, '按錯 → 小狗回到這一組的起點', { before, after });
    await page.evaluate(() => { window.__said = []; });
    await page.waitForTimeout(2600);
    const re = await page.evaluate(() => window.__said.map(s => s.text));
    ok(chunk.every(t => re.includes(t)), '按錯後整組重唸', re);
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('暫停、再聽一次、計時不含語音');
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 1500 });
    await enter(page, 'level2');
    await page.waitForTimeout(1700);   // 語音 1.5 秒
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => { clockTick(); return { a: state.activeMs, k: state.thinkMs }; });
    ok(t.a >= 1900 && t.k < 900, '語音播放時不算思考時間', t);
    await page.click('#pauseBtn');
    ok(await page.isVisible('#pauseov'), '暫停畫面蓋住');
    const a1 = await page.evaluate(() => state.activeMs);
    await page.waitForTimeout(800);
    const a2 = await page.evaluate(() => { clockTick(); return state.activeMs; });
    ok(a2 - a1 < 50, '暫停時不計時', [a1, a2]);
    await page.evaluate(() => { window.__said = []; });
    await page.click('#resumeBtn');
    await page.waitForTimeout(150);
    ok((await page.evaluate(() => window.__said.length)) === 1, '繼續時重唸目前指令');
    await page.waitForTimeout(1500);
    await page.click('#replayBtn');
    await page.click('#replayBtn');
    ok((await page.evaluate(() => state.replays)) === 2, '再聽一次不限次數，有記次數');
    // 重新開始要先確認；取消就繼續
    await page.click('#restartBtn');
    ok(await page.isVisible('#confirmov') && await page.evaluate(() => state.paused), '重新開始會先問、遊戲先暫停');
    await page.click('#confirmNo');
    ok(!(await page.evaluate(() => state.paused)), '取消 → 繼續原本這局');
    await page.click('#menuBtn');
    await page.click('#confirmYes');
    ok(await page.isVisible('#nameGate') && !(await page.evaluate(() => state.playing)), '主選單 → 回到開始頁');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('排行榜：一台裝置一關只留最高分');
  {
    const { page, ctx, errors } = await open(browser, { data: { 'perrito_boards/level2/entries/other': { name: 'Luz', score: 300, think: 50, secs: 80, errors: 9, presses: 20, acc: 69, replays: 0, rank: 300 * 100000 + 99499 } } });
    await enter(page, 'level2', 'Ana');
    await solveAndWaitResult(page);
    await page.waitForFunction(() => /新紀錄|沒有超過/.test(document.getElementById('lbArea').innerText), null, { timeout: 5000 });
    const d1 = await page.evaluate(() => window.__DATA['perrito_boards/level2/entries/anon']);
    ok(d1 && d1.name === 'Ana' && d1.score > 900 && d1.acc === 100, '第一次存進排行榜', d1);
    ok((await txt(page, '#lbArea')).includes('新紀錄') && (await txt(page, '#lbArea')).includes('Luz'), '顯示新紀錄與排行榜', await txt(page, '#lbArea'));
    ok((await page.$$('#lbArea .lbRowMe')).length === 1, '自己那一列有標出來');
    ok((await txt(page, '#commentLine')).includes('完美'), '一次都沒錯 → 完美');
    // 第二局故意錯很多 → 分數較低，不覆蓋
    await page.click('#againBtn');
    await page.evaluate(() => { for(let i = 0; i < 6; i++){ const r = state.instructions[state.curIndex].dir; pressDirection(DIRS.find(d => d !== r)); } });
    await solveAndWaitResult(page);
    await page.waitForFunction(() => /新紀錄|沒有超過/.test((document.getElementById('lbArea') || {}).innerText || ''), null, { timeout: 5000 });
    const d2 = await page.evaluate(() => window.__DATA['perrito_boards/level2/entries/anon']);
    ok(d2.score === d1.score && (await txt(page, '#lbArea')).includes('沒有超過'), '比較低的分數不覆蓋最佳成績', [d1.score, d2.score]);
    // 開始頁的排行榜按鈕
    await page.click('#resMenuBtn');
    await page.click('#gateLbBtn');
    await page.waitForFunction(() => document.querySelectorAll('#lbBody .lbRow').length >= 2, null, { timeout: 5000 });
    ok((await page.$$('#lbTabs .opt')).length === 3, '開始頁排行榜：第 2～4 關三個分頁');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('第 2 關：找到鑰匙後暫停不會亂唸');
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 400 });
    await enter(page, 'level2');
    await page.waitForTimeout(500);
    // 一路按到找到鑰匙
    await page.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); for(let n = 0; n < 2000 && state.stage === 'key'; n++){ pressDirection(state.instructions[state.curIndex].dir); await sl(1); } });
    ok(await page.evaluate(() => state.awaitingKeyAnnouncement), '找到鑰匙，正在宣布');
    await page.click('#pauseBtn');
    await page.evaluate(() => { window.__said = []; });
    await page.waitForTimeout(800);
    ok((await page.evaluate(() => window.__said.length)) === 0, '暫停中不會唸下一句');
    await page.click('#resumeBtn');
    await page.waitForTimeout(100);
    ok((await page.evaluate(() => !state.awaitingKeyAnnouncement && window.__said.length === 1)), '繼續後唸往寶藏的第一句');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('桌面版畫面');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', r => r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
    await page.goto(BASE + '/index.html');
    await enter(page, 'level1');
    const fit = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2);
    ok(fit, '桌面版不用捲動');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('開始頁：沒有標語、窗口矮時可以捲動');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 420 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', r => r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    ok(await page.$('[data-t="tagline"]') === null, '開始頁與遊戲畫面都沒有標語');
    const r = await page.evaluate(async () => {
      const g = document.getElementById('nameGate'), c = document.getElementById('nameCard');
      const tooTall = g.scrollHeight > g.clientHeight;
      const topBefore = c.getBoundingClientRect().top;
      g.scrollTop = g.scrollHeight;
      await new Promise(r => setTimeout(r, 50));
      const btn = document.getElementById('nameGateBtn').getBoundingClientRect();
      return { tooTall, topBefore, scrolled: g.scrollTop, btnBottom: btn.bottom, vh: window.innerHeight };
    });
    ok(r.tooTall, '（前提）矮視窗下卡片比視窗高', r);
    ok(r.topBefore >= 0, '卡片頂端沒有被切掉', r);
    ok(r.scrolled > 0, '外框可以往下捲', r);
    ok(r.btnBottom <= r.vh, '捲到底後看得到最下面的按鈕', r);
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('手機版：進遊戲後頁面回到最上面（鍵盤把頁面推偏的情況）');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 560 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', r => r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
    await page.addInitScript(SPEECH(10));
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await page.fill('#playerNameInput', 'Ana');
    await page.click('.gateDiffBtn[data-level="level2"]');
    await page.evaluate(() => window.scrollTo(0, 300));   // 模擬鍵盤把頁面推偏
    await page.click('#nameGateBtn');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ y: window.scrollY, statTop: document.getElementById('statRow').getBoundingClientRect().top }));
    ok(r.y === 0 && r.statTop >= 0, '進遊戲後頁面在最上面，「時間／錯誤」那列看得到', r);
    await page.evaluate(() => window.scrollTo(0, 5));
    ok(await page.evaluate(() => window.scrollY) >= 0, '仍然可以自己捲動');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('開始頁：沒有錯誤訊息時不佔位置；手機版遊戲畫面：中文靠左、外語靠右同一行');
  for(const [tag, vp, mobile] of [['手機', { width: 390, height: 760 }, true], ['電腦', { width: 1280, height: 800 }, false]]){
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', r => r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
    await page.addInitScript(SPEECH(10));
    await page.addInitScript('try{localStorage.setItem(' + JSON.stringify(KEY) + ',' + JSON.stringify(JSON.stringify({ v:1, script:'trad', lang:'es', phon:'pinyin', rate:'normal' })) + ');}catch(e){}');
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    ok(await page.$eval('#nameGateError', e => getComputedStyle(e).display === 'none'), tag + '：沒有錯誤訊息時，錯誤那行不佔位置');
    const gap = await page.evaluate(() => document.getElementById('gateDifficultyLabel').getBoundingClientRect().top - document.getElementById('playerNameInput').getBoundingClientRect().bottom);
    ok(gap < 16, tag + '：名字框到「選擇難度」之間的空白收緊了', gap);
    await page.click('#nameGateBtn');   // 沒填名字 → 出現錯誤訊息
    await page.waitForTimeout(100);
    ok(await page.$eval('#nameGateError', e => getComputedStyle(e).display !== 'none' && e.textContent.trim().length > 0), tag + '：沒填名字時錯誤訊息會出現');
    if(mobile){
      await enter(page, 'level2');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const pair = sel => { const el = document.querySelector(sel), sm = el.querySelector('small'); if(!sm) return null;
          const a = el.getBoundingClientRect(), b = sm.getBoundingClientRect(); return { zhTop: Math.round(el.firstChild.nodeType === 3 ? (()=>{const rg=document.createRange();rg.selectNodeContents(el.firstChild);return rg.getBoundingClientRect().top;})() : a.top), smTop: Math.round(b.top), smRight: Math.round(b.right), boxRight: Math.round(a.right), h: Math.round(a.height) }; };
        return { stage: pair('#stageLabel'), time: pair('#statRow .statLbl') };
      });
      ok(r.stage && Math.abs(r.stage.zhTop - r.stage.smTop) <= 6, '手機：第幾步的中文與外語在同一行', r.stage);
      ok(r.stage && r.stage.boxRight - r.stage.smRight <= 2, '手機：外語靠右', r.stage);
      ok(r.time && Math.abs(r.time.zhTop - r.time.smTop) <= 6, '手機：「時間」的中文與外語在同一行', r.time);
      ok(r.stage && r.stage.h < 24, '手機：第幾步那一行只有一行高', r.stage);
      ok(await page.$eval('#ctlRow #replayBtn small', e => getComputedStyle(e).display === 'block'), '手機：下方四顆按鈕維持兩行（中文上、外語下）');
    }
    ok(errors.length === 0, tag + '：沒有錯誤', errors);
    await ctx.close();
  }

  console.log('手機版：棋盤大小整局固定，不會因為工具列收合或提示出現而忽大忽小');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', r => r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
    await page.addInitScript(SPEECH(10));
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await enter(page, 'level2');
    await page.waitForTimeout(400);
    const cv = () => page.$eval('#board', e => e.width);
    const first = await cv();
    ok(first >= 180, '（前提）棋盤有大小', first);
    await page.setViewportSize({ width: 390, height: 600 }); await page.waitForTimeout(200);
    ok(await cv() === first, '工具列跳出（高度變矮）時棋盤大小不變', await cv());
    await page.setViewportSize({ width: 390, height: 664 }); await page.waitForTimeout(200);
    ok(await cv() === first, '工具列收起（高度變高）時棋盤大小不變', await cv());
    await page.evaluate(() => { document.getElementById('errorMsg').innerHTML = '<span>錯了</span><small>Incorrecto, vuelve a intentar con otra respuesta más larga</small>'; });
    await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(100);
    ok(await cv() === first, '答錯提示出現時棋盤大小不變', await cv());
    await page.setViewportSize({ width: 340, height: 664 }); await page.waitForTimeout(200);
    ok(await cv() < first, '寬度改變（轉向／換螢幕）時才重新計算', await cv());
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n通過 ${pass}，失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
