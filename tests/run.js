// 執行所有 tests/test_*.js：自帶靜態伺服器（網站根目錄 = repo 根目錄），不需要另外開伺服器。
// 用法：node tests/run.js        （需要 Playwright 與 Chromium，見 tests/README.md）
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.normalize(path.join(ROOT, p));
  if(!f.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
  if(fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if(!fs.existsSync(f)){ res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, 'localhost', async () => {
  const BASE_URL = 'http://localhost:' + server.address().port;
  const files = fs.readdirSync(__dirname).filter(n => /^test_.*\.js$/.test(n)).sort();
  const failed = [];
  for(const n of files){
    console.log('\n===== ' + n + ' =====');
    // 一定要用非同步 spawn：同步執行會卡住這個程式裡的伺服器，頁面就載入不了
    const code = await new Promise(res => spawn(process.execPath, [path.join(__dirname, n)], { stdio: 'inherit', env: Object.assign({}, process.env, { BASE_URL }) }).on('close', res));
    if(code !== 0) failed.push(n);
  }
  server.close();
  console.log('\n' + (failed.length ? '失敗的測試檔：' + failed.join(', ') : '全部測試檔通過（' + files.length + ' 個）'));
  process.exit(failed.length ? 1 : 0);
});
