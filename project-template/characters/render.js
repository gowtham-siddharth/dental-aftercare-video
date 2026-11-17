const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [,, html, out, w, h] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(html));
  await p.waitForFunction(() => document.title === 'done', null, { timeout: 10000 }).catch(()=>{});
  await (await p.$('canvas')).screenshot({ path: out });
  if (errs.length) console.log('ERRORS:', errs.join('\n'));
  await b.close();
})();
