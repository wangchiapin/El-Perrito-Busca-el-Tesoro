// 補測試（選項覆蓋）：語速三檔、第 3 關、拼音＋注音同時顯示、一鍵靜音、鍵盤方向鍵、網址 ?audio= 與 ?vol= 參數。
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

async function open(browser, { ls = null, speechMs = 10, data = {}, ua = null } = {}){
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, ua ? { userAgent: ua } : {})); const page = await ctx.newPage();
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
    if(state.gapWait){ clearGapWait(); showCurrentInstruction(); }   // 略過「完成指令後的停頓」，不然整局要等很久
    pressDirection(state.instructions[state.curIndex].dir); await sl(2);} })()`;
async function solveAndWaitResult(page){
  await page.evaluate(SOLVE);
  await page.waitForFunction(() => document.getElementById('resultModal').style.display === 'flex', null, { timeout: 15000 });
}

const RATEOF = { slow: 0.45, normal: 0.65, fast: 0.85 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsOf = o => ({ [KEY]: JSON.stringify(Object.assign({ v:1, script:'trad', lang:'es', phon:'pinyin', rate:'normal' }, o)) });
const said = page => page.evaluate(() => window.__said);

(async () => {
  const browser = await chromium.launch();

  console.log('語速三檔：慢 0.45／正常 0.65／快 0.85，實際套到唸出來的聲音');
  for(const [rate, val] of [['slow', 0.45], ['normal', 0.65], ['fast', 0.85]]){
    const { page, ctx, errors } = await open(browser, { ls: lsOf({ rate }) });
    await enter(page, 'level2');
    await page.waitForTimeout(200);
    const s = await said(page);
    ok(s.length >= 1 && s[0].rate === val, `語速「${rate}」→ 第一句唸出來 rate = ${val}`, s.map(x => x.rate));
    await page.evaluate(() => { window.__said = []; });
    await page.click('#replayBtn');
    await page.waitForTimeout(200);
    const r2 = await said(page);
    ok(r2.length === 1 && r2[0].rate === val, `語速「${rate}」→ 按「再聽一次」也是 ${val}`, r2.map(x => x.rate));
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    // 設定檔裡的語速是亂寫的 → 退回正常
    const { page, ctx } = await open(browser, { ls: lsOf({ rate: 'turbo' }) });
    await enter(page, 'level1');
    const s = await said(page);
    ok(s.length >= 1 && s[0].rate === 0.65, '設定裡的語速是不認得的值 → 退回正常 0.65', s.map(x => x.rate));
    await ctx.close();
  }
  {
    // 遊戲中從 ⚙️ 改語速：下一次唸就用新速度
    const { page, ctx, errors } = await open(browser, { ls: lsOf({ rate: 'normal' }) });
    await enter(page, 'level2');
    await page.waitForTimeout(200);
    await page.click('#gameGear');
    await page.click('#setov .opt[data-k="rate"][data-v="fast"]');
    ok((await settings(page)).rate === 'fast', '遊戲中改成快 → 共用設定寫入 fast');
    await page.evaluate(() => { window.__said = []; });
    await page.click('#setDone');
    await page.waitForTimeout(250);
    const s = await said(page);
    ok(s.length === 1 && s[0].rate === 0.85, '關掉設定繼續後，重唸用 0.85', s.map(x => x.rate));
    await page.click('#gameGear');
    await page.click('#setov .opt[data-k="rate"][data-v="slow"]');
    await page.evaluate(() => { window.__said = []; });
    await page.click('#setDone');
    await page.waitForTimeout(250);
    const s2 = await said(page);
    ok(s2.length === 1 && s2[0].rate === 0.45, '再改成慢，重唸用 0.45', s2.map(x => x.rate));
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  // 第 4 關：句子之間的停頓跟著語速 慢 1000／正常 600／快 350
  for(const [rate, min, max] of [['slow', 1000, 1500], ['normal', 600, 1000], ['fast', 350, 580]]){
    const { page, ctx, errors } = await open(browser, { speechMs: 30, ls: lsOf({ rate }) });
    await enter(page, 'level4');
    for(let t = 0; t < 80; t++){
      if(await page.evaluate(() => { const c = state.chunkLabels.get(0); return c && c.texts.length >= 2; })) break;
      await page.evaluate(() => startGame());
    }
    await page.waitForTimeout(2600);   // 等前面幾次 startGame 留下的語音／計時都收尾，再量這一次
    await page.evaluate(() => { window.__said = []; });
    await page.click('#replayBtn');
    await page.waitForTimeout(min + 900);
    const s = await said(page);
    const gap = s.length >= 2 ? s[1].at - s[0].at : -1;
    ok(s.length >= 2 && s.every(x => x.rate === RATEOF[rate]) && gap >= min && gap < max, `第 4 關語速「${rate}」：句與句停 ${min}～${max} 毫秒，速度 ${RATEOF[rate]}`, { gap, rates: s.map(x => x.rate) });
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('第 3 關：要鑰匙、文字隱藏只聽語音、不分組、上排行榜');
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 20, ls: lsOf({ phon: 'both' }) });
    ok(await page.$eval('.gateDiffBtn[data-level="level3"] .diffName', e => /3/.test(e.textContent)), '開始頁有「第 3 關」按鈕', await txt(page, '.gateDiffBtn[data-level="level3"]'));
    await enter(page, 'level3', 'Luis');
    const st = await page.evaluate(() => ({ d: state.difficulty, key: state.requiresKey, hid: state.textHidden, chunked: state.chunked, stage: state.stage, obs: state.obstacles.size, kr: state.keyRow, num: levelNum(state.difficulty) }));
    ok(st.d === 'level3' && st.key === true && st.hid === true && st.chunked === false && st.stage === 'key', '第 3 關設定：有鑰匙、隱藏文字、不分組', st);
    ok(st.obs >= 20 && st.obs <= 30, '障礙物 20～30 顆', st.obs);
    ok(st.kr !== null && st.num === 3, '有放鑰匙；是第 3 關', st);
    ok((await page.$eval('#instructionBox', e => e.innerText)).includes('仔細聽') && !(await page.$('#instructionBox .ru')) && !(await page.$('#instructionBox .ph')), '指令框只寫「仔細聽」，沒有中文字也沒有拼音注音');
    ok((await txt(page, '#stageLabel')).includes('鑰匙') || (await txt(page, '#stageLabel')).toLowerCase().includes('llave'), '上方階段是找鑰匙', await txt(page, '#stageLabel'));
    await page.waitForTimeout(200);
    const s0 = await said(page);
    const cur = await page.evaluate(() => curChunk().texts);
    ok(cur.length === 1 && s0.length >= 1 && s0[0].text === cur[0], '一次唸一句（不分組），唸的就是目前指令', { cur, said: s0.map(x => x.text) });
    // 按錯 → 只退回這一句，不是整組
    const pos0 = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol }));
    await page.evaluate(() => { const r = state.instructions[state.curIndex].dir; pressDirection(DIRS.find(d => d !== r)); });
    const pos1 = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol, e: state.errorCount }));
    ok(pos1.e === 1 && pos1.r === pos0.r && pos1.c === pos0.c, '按錯算 1 次錯誤', pos1);
    // 一路按到鑰匙
    await page.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); for(let n = 0; n < 3000 && state.stage === 'key'; n++){ if(state.errWait) clearErrWait(); if(state.gapWait){ clearGapWait(); showCurrentInstruction(); } pressDirection(state.instructions[state.curIndex].dir); await sl(1); } });
    ok(await page.evaluate(() => state.keyFound && state.awaitingKeyAnnouncement && state.stage === 'treasure'), '到鑰匙格 → 找到鑰匙，進入找寶藏');
    ok((await page.$eval('#instructionBox', e => e.innerText)).includes('🔑'), '第 3 關找到鑰匙只顯示 🔑（不顯示文字）');
    await page.waitForFunction(() => !state.awaitingKeyAnnouncement, null, { timeout: 3000 });
    ok((await page.$eval('#instructionBox', e => e.innerText)).includes('仔細聽'), '宣布完又回到「仔細聽」');
    ok(await page.evaluate(() => window.__said.some(x => x.text === tradOf(KEY_TK))), '有唸「找到鑰匙了！前往寶藏」');
    await solveAndWaitResult(page);
    ok((await page.$eval('#instructionBox', e => e.innerText)).includes('🎉'), '找到寶藏只顯示 🎉，不顯示文字');
    await page.waitForFunction(() => /新紀錄|沒有超過/.test((document.getElementById('lbArea') || {}).innerText || ''), null, { timeout: 5000 });
    const d = await page.evaluate(() => window.__DATA['perrito_boards/level3/entries/anon']);
    ok(d && d.name === 'Luis' && d.score > 0, '第 3 關成績寫進 perrito_boards/level3', d);
    ok(!(await page.evaluate(() => Object.keys(window.__DATA).some(k => k.includes('/level2/') || k.includes('/level4/')))), '不會寫到別關的排行榜');
    ok(!(await page.$('#practiceHint')) && !!(await page.$('#lbArea')), '第 3 關有排行榜、沒有第 1 關的練習提示');
    ok(await page.isVisible('#nextLevelBtn'), '有「下一關」');
    await page.click('#nextLevelBtn');
    ok((await page.evaluate(() => state.difficulty)) === 'level4' && (await page.evaluate(() => state.chunked)), '下一關 → 第 4 關（分組）');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    // 開始頁排行榜有第 3 關分頁，點進去看得到該關資料
    const { page, ctx, errors } = await open(browser, { data: { 'perrito_boards/level3/entries/o': { name: 'Mei', score: 777, think: 10, secs: 30, errors: 0, presses: 20, acc: 100, replays: 0, rank: 777 * 100000 + 99999 } } });
    await page.click('#gateLbBtn');
    await page.click('#lbTabs .opt:nth-child(2)');
    await page.waitForFunction(() => /Mei/.test(document.getElementById('lbBody').innerText), null, { timeout: 5000 });
    ok((await txt(page, '#lbBody')).includes('777'), '排行榜「第 3 關」分頁顯示該關資料', await txt(page, '#lbBody'));
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('拼音＋注音同時顯示（both）');
  {
    const { page, ctx, errors } = await open(browser, { ls: lsOf({ phon: 'off' }) });
    await page.click('#gateGear');
    await page.click('#setov .opt[data-k="phon"][data-v="both"]');
    ok((await settings(page)).phon === 'both', '⚙️ 選「拼音＋注音」→ 共用設定 phon = both', await settings(page));
    await page.click('#setDone');
    await enter(page, 'level1');
    const info = await page.evaluate(() => { const ru = document.querySelectorAll('#instructionBox .ru'); const first = ru[0];
      return { n: ru.length, kids: [...first.children].map(c => c.className), py: first.querySelector('.ph:not(.zy)').textContent, zy: first.querySelector('.ph.zy').textContent, hz: first.querySelector('.hz').textContent }; });
    ok(info.n > 0 && info.kids.join('|') === 'ph|ph zy|hz', '每個字上面有兩行：拼音在上、注音在下、再來是漢字', info);
    ok(/^[a-züāáǎàēéěèīíǐìōóǒòūúǔù]+$/i.test(info.py) && /^[ㄅ-ㄩ˙ˊˇˋ]+$/.test(info.zy), '拼音是拉丁字母、注音是注音符號', info);
    ok(await page.evaluate(() => ZY.one(document.querySelector('#instructionBox .ru .ph:not(.zy)').textContent) === document.querySelector('#instructionBox .ru .ph.zy').textContent), '同一個字的注音就是那個拼音換成的注音');
    // 繁簡切換時兩種都還在
    await page.click('#gameGear');
    await page.click('#setov .opt[data-k="script"][data-v="simp"]');
    const after = await page.evaluate(() => ({ py: document.querySelectorAll('#instructionBox .ph:not(.zy)').length, zy: document.querySelectorAll('#instructionBox .ph.zy').length, hz: document.querySelectorAll('#instructionBox .hz').length }));
    ok(after.py === after.zy && after.py === after.hz && after.hz > 0, '改成简体後，拼音與注音仍同時存在、數量一致', after);
    // 輪流切四種，確認各自的樣子
    for(const [v, py, zy] of [['pinyin', true, false], ['zhuyin', false, true], ['both', true, true], ['off', false, false]]){
      await page.click(`#setov .opt[data-k="phon"][data-v="${v}"]`);
      const c = await page.evaluate(() => ({ py: document.querySelectorAll('#instructionBox .ph:not(.zy)').length > 0, zy: document.querySelectorAll('#instructionBox .ph.zy').length > 0 }));
      ok(c.py === py && c.zy === zy, `phon=${v}：拼音${py ? '有' : '無'}、注音${zy ? '有' : '無'}`, c);
    }
    await page.click('#setDone');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    // both 時，指令框仍然完整放得下（高度規則）
    const { page, ctx } = await open(browser, { ls: lsOf({ phon: 'both' }) });
    await enter(page, 'level1');
    const r = await page.evaluate(() => { const b = document.getElementById('instructionBox'); return { sh: b.scrollHeight, ch: b.clientHeight }; });
    ok(r.sh <= r.ch + 2, '拼音＋注音同時時，指令框裡的字沒有被切掉', r);
    await ctx.close();
  }

  console.log('一鍵靜音（只關音效，不影響念字的語音）');
  {
    const { page, ctx, errors } = await open(browser);
    ok(await page.isVisible('#hgMute') && (await txt(page, '#hgMute')) === '🔊' && (await page.getAttribute('#hgMute', 'aria-pressed')) === 'false', '一開始有 🔊 按鈕、未靜音');
    await enter(page, 'level1');
    const gainOf = () => page.evaluate(() => audioCtx.destination.gain.value);
    ok(await gainOf() === 1, '未靜音：Web Audio 總音量 1', await gainOf());
    await page.click('#hgMute');
    ok((await txt(page, '#hgMute')) === '🔇' && (await page.getAttribute('#hgMute', 'aria-pressed')) === 'true', '按下去 → 🔇、aria-pressed = true');
    await page.waitForTimeout(100);
    ok(await gainOf() === 0, '靜音：總音量變 0', await gainOf());
    ok((await page.evaluate(() => localStorage.getItem('hg.mute.perrito'))) === '1', '靜音狀態記在 localStorage hg.mute.perrito');
    // 靜音後按鍵音的來源仍連到總音量（audioCtx.destination 被換成總音量 GainNode）
    ok(await page.evaluate(() => audioCtx.destination.constructor.name === 'GainNode'), '所有音效都經過總音量（靜音時一起被關）');
    // 語音不受影響
    await page.evaluate(() => { window.__said = []; });
    await page.click('#replayBtn');
    await page.waitForTimeout(200);
    ok((await said(page)).length === 1, '靜音時念指令的語音照常唸');
    // 遊戲操作不會因靜音壞掉
    await page.evaluate(() => pressDirection(state.instructions[state.curIndex].dir));
    ok(await page.evaluate(() => state.totalPresses === 1), '靜音時仍可正常玩');
    // 重新整理後記住
    await page.reload(); await page.waitForTimeout(300);
    ok((await txt(page, '#hgMute')) === '🔇', '重新整理後仍是靜音');
    await enter(page, 'level1');
    ok(await page.evaluate(() => audioCtx.destination.gain.value) === 0, '重新整理後新建的音效通道一開始就是 0');
    await page.click('#hgMute');
    await page.waitForTimeout(100);
    ok((await txt(page, '#hgMute')) === '🔊' && await gainOf() === 1 && (await page.evaluate(() => localStorage.getItem('hg.mute.perrito'))) === '0', '再按一次 → 取消靜音、總音量回 1');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    // 備用播放（iPhone Chrome 的 <audio>）靜音時 muted = true
    const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    const { page, ctx, errors } = await open(browser, { ua: CHROME_IOS });
    await enter(page, 'level1');
    await page.evaluate(() => { const orig = HTMLMediaElement.prototype.play; window.__mutedAtPlay = []; HTMLMediaElement.prototype.play = function(){ const r = orig.apply(this, arguments); window.__mutedAtPlay.push(this.muted); return Promise.resolve(); }; });
    await page.click('#hgMute');
    await page.evaluate(() => { const g = state.instructions[state.curIndex].dir; pressDirection(DIRS.find(d => d !== g)); pressDirection(g); });
    const m1 = await page.evaluate(() => window.__mutedAtPlay);
    ok(m1.length >= 2 && m1.every(x => x === true), '靜音：備用 <audio> 播放時 muted = true（按對、按錯都是）', m1);
    await page.click('#hgMute');
    await page.evaluate(() => { window.__mutedAtPlay = []; const g = state.instructions[state.curIndex]; if(state.gapWait){ clearGapWait(); showCurrentInstruction(); } pressDirection(state.instructions[state.curIndex].dir); });
    const m2 = await page.evaluate(() => window.__mutedAtPlay);
    ok(m2.length >= 1 && m2.every(x => x === false), '取消靜音：備用播放 muted = false', m2);
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('鍵盤方向鍵');
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 10 });
    await page.keyboard.press('ArrowUp');
    ok(await page.evaluate(() => !state.playing && state.totalPresses === 0), '開始頁（還沒進遊戲）按方向鍵不會有動作');
    await enter(page, 'level1');
    await page.waitForTimeout(100);
    const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    // 對的方向鍵：四個方向都試（一關一關轉向直到各方向都出現過）
    const seen = new Set();
    for(let n = 0; n < 400 && seen.size < 4 && await page.evaluate(() => state.playing); n++){
      if(await page.evaluate(() => state.gapWait || state.awaitingKeyAnnouncement)){ await page.evaluate(() => { if(state.gapWait){ clearGapWait(); showCurrentInstruction(); } }); await sleep(30); continue; }
      const need = await page.evaluate(() => state.instructions[state.curIndex].dir);
      const before = await page.evaluate(() => ({ p: state.totalPresses, f: state.facing, r: state.dogRow, c: state.dogCol, e: state.errorCount }));
      await page.keyboard.press(KEYS[need]);
      const after = await page.evaluate(() => ({ p: state.totalPresses, f: state.facing, r: state.dogRow, c: state.dogCol, e: state.errorCount }));
      ok(after.p === before.p + 1 && after.e === before.e && (after.r !== before.r || after.c !== before.c || after.f === need), `鍵盤 ${KEYS[need]} 是對的 → 算 1 次正確按鍵且小狗有動／轉向`, { before, after });
      seen.add(need);
      if(!(await page.evaluate(() => state.playing))) break;
    }
    ok(seen.size >= 2, '實際用鍵盤按過至少兩種方向', [...seen]);
    // 對應表
    ok(await page.evaluate(() => JSON.stringify(KEYMAP) === JSON.stringify({ ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' })), '四個方向鍵對應 上下左右');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    const { page, ctx, errors } = await open(browser, { speechMs: 10 });
    await enter(page, 'level2');
    await page.waitForTimeout(150);
    // 錯的方向鍵 → 算錯、不動
    const need = await page.evaluate(() => state.instructions[state.curIndex].dir);
    const wrongKey = { up: 'ArrowDown', down: 'ArrowUp', left: 'ArrowRight', right: 'ArrowLeft' }[need];
    const b = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol }));
    await page.keyboard.press(wrongKey);
    const a = await page.evaluate(() => ({ r: state.dogRow, c: state.dogCol, e: state.errorCount }));
    ok(a.e === 1 && a.r === b.r && a.c === b.c, '鍵盤按錯方向 → 錯誤 +1、小狗不動', { b, a });
    ok((await page.$eval('#errorMsg', e => e.innerText.trim())).length > 0, '鍵盤按錯也會出現錯誤訊息');
    // 其他鍵沒反應
    await page.evaluate(() => clearErrWait());
    const p0 = await page.evaluate(() => state.totalPresses + state.errorCount);
    for(const k of ['a', 'Enter', 'Space', 'w']) await page.keyboard.press(k);
    ok(await page.evaluate(p => state.totalPresses + state.errorCount === p, p0), '字母、Enter、空白鍵都沒有反應');
    // 方向鍵會被攔下（不讓頁面捲動）
    const prevented = await page.evaluate(() => { const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true }); document.dispatchEvent(ev); return ev.defaultPrevented; });
    ok(prevented, '遊戲中方向鍵 preventDefault（頁面不會跟著捲動）');
    // 暫停中按方向鍵：不算
    await page.click('#pauseBtn');
    const p1 = await page.evaluate(() => state.totalPresses + state.errorCount);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft');
    ok(await page.evaluate(p => state.totalPresses + state.errorCount === p, p1), '暫停中按方向鍵不算');
    await page.click('#resumeBtn');
    // ⚙️ 設定視窗開著：方向鍵不算也不攔
    await page.click('#gameGear');
    const p2 = await page.evaluate(() => state.totalPresses + state.errorCount);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight');
    ok(await page.evaluate(p => state.totalPresses + state.errorCount === p, p2), '設定視窗開著時按方向鍵不算');
    const notPrev = await page.evaluate(() => { const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true }); document.dispatchEvent(ev); return ev.defaultPrevented; });
    ok(!notPrev, '設定視窗開著時不攔截方向鍵');
    await page.click('#setDone');
    // 回到開始頁後方向鍵不再有效（名字框要能用方向鍵移動游標）
    await page.click('#menuBtn'); await page.click('#confirmYes');
    const p3 = await page.evaluate(() => state.totalPresses + state.errorCount);
    await page.fill('#playerNameInput', 'abc');
    await page.focus('#playerNameInput');
    await page.keyboard.press('ArrowLeft');
    ok(await page.evaluate(p => state.totalPresses + state.errorCount === p, p3), '回到開始頁 → 方向鍵不再當遊戲按鍵');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }
  {
    // 停頓期間用鍵盤也被忽略；一路用鍵盤玩到結束
    const { page, ctx, errors } = await open(browser, { speechMs: 5 });
    await enter(page, 'level1');
    const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    for(let n = 0; n < 600 && await page.evaluate(() => state.playing); n++){
      if(await page.evaluate(() => state.gapWait)){ await page.evaluate(() => { clearGapWait(); showCurrentInstruction(); }); }
      const need = await page.evaluate(() => state.instructions[state.curIndex] && state.instructions[state.curIndex].dir);
      if(need) await page.keyboard.press(KEYS[need]);
    }
    await page.waitForFunction(() => document.getElementById('resultModal').style.display === 'flex', null, { timeout: 5000 });
    ok(await page.evaluate(() => state.treasureFound && state.errorCount === 0), '整局只用鍵盤方向鍵就能玩到找到寶藏，且零錯誤');
    await page.keyboard.press('ArrowUp');
    ok(await page.evaluate(() => state.errorCount === 0), '結束後再按方向鍵不會出錯');
    ok(errors.length === 0, '沒有錯誤', errors);
    await ctx.close();
  }

  console.log('網址參數 ?audio= 與 ?vol=');
  {
    const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const run = async (ua, query, fn) => { const { page, ctx, errors } = await open(browser, { ua }); await page.goto(BASE + '/index.html' + query); await page.waitForTimeout(300); const r = await fn(page); r.errors = errors; await ctx.close(); return r; };
    const probe = page => page.evaluate(() => ({ html: USE_HTML_AUDIO, vol: SFX_VOL, crios: IS_CRIOS, g: sfxGain(0.1) }));
    let r = await run(null, '?audio=html', probe);
    ok(r.html === true && r.crios === false, '桌面 Chrome + ?audio=html → 強制備用播放', r);
    r = await run(CHROME_IOS, '', probe);
    ok(r.html === true && r.vol === 4, '（對照）iPhone Chrome 預設：備用播放、音量 4', r);
    r = await run(CHROME_IOS, '?audio=web', probe);
    ok(r.html === false && r.vol === 4, 'iPhone Chrome + ?audio=web → 改走 Web Audio，音量倍數不變', r);
    r = await run(SAFARI, '?audio=html', probe);
    ok(r.html === true && r.vol === 1, 'Safari + ?audio=html → 強制備用播放', r);
    r = await run(null, '?audio=abc', probe);
    ok(r.html === false, '?audio=abc（不認得的值）→ 忽略，維持預設', r);
    r = await run(CHROME_IOS, '?audio=html&vol=2', probe);
    ok(r.html === true && r.vol === 2, '兩個參數可以一起用（?audio=html&vol=2）', r);
    r = await run(null, '?vol=2', probe);
    ok(r.vol === 2 && r.g === 0.2, '?vol=2：音量倍數 2、sfxGain(0.1) = 0.2', r);
    r = await run(null, '?vol=0.5', probe);
    ok(r.vol === 0.5 && r.g === 0.05, '?vol=0.5：下限剛好 0.5', r);
    r = await run(null, '?vol=0.1', probe);
    ok(r.vol === 0.5, '?vol=0.1 太小 → 拉到下限 0.5', r);
    r = await run(null, '?vol=9', probe);
    ok(r.vol === 4, '?vol=9 太大 → 壓到上限 4', r);
    r = await run(null, '?vol=abc', probe);
    ok(r.vol === 1, '?vol=abc（不是數字）→ 忽略，桌面預設 1', r);
    r = await run(CHROME_IOS, '?vol=abc', probe);
    ok(r.vol === 4, '?vol=abc 在 iPhone Chrome → 退回預設 4', r);
    r = await run(CHROME_IOS, '?vol=1', probe);
    ok(r.vol === 1, 'iPhone Chrome + ?vol=1 → 可以調回 1', r);
    r = await run(null, '?vol=4', async page => ({ g: await page.evaluate(() => sfxGain(0.5)) }));
    ok(r.g === 0.9 && r.errors.length === 0, '?vol=4 時 sfxGain(0.5) 被壓在 0.9 上限（避免爆音）', r);
  }
  {
    // ?vol 真的影響按鍵音大小：備用播放的 WAV 峰值
    const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    const peakOf = async q => { const { page, ctx, errors } = await open(browser, { ua: CHROME_IOS }); await page.goto(BASE + '/index.html' + q); await page.waitForTimeout(300); await enter(page, 'level1');
      const p = await page.evaluate(() => fetch(htmlSfx.beep[0].pool[0].src).then(x => x.arrayBuffer()).then(b => { const v = new DataView(b); let m = 0; for(let i = 44; i < b.byteLength; i += 2) m = Math.max(m, Math.abs(v.getInt16(i, true))); return m / 32768; }));
      await ctx.close(); return [p, errors]; };
    const [p1, e1] = await peakOf('?vol=1'), [p2, e2] = await peakOf('?vol=2');
    ok(p1 > 0.2 && p1 < 0.24 && p2 > 0.43 && p2 < 0.46, '?vol=1 按鍵音峰值約 0.22、?vol=2 約 0.44（真的變大聲）', [p1, p2]);
    ok(e1.length === 0 && e2.length === 0, '沒有錯誤', [e1, e2]);
  }

  await browser.close();
  console.log(`\n通過 ${pass}，失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
