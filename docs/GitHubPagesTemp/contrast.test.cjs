// Visual-only acceptance criteria for the requested preview fixes:
// guide text >= 4.5:1; bookmarks >= 3:1 against every oak stop;
// hands have distinct skin fills (>= 1.5:1) and dark edges (>= 3:1).
// Run with existing Playwright/Chromium; no installation or service required:
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node --test docs/GitHubPagesTemp/contrast.test.cjs
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
let chromium;
try { ({chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch { /* Optional browser verification. */ }
let browser;
before(async () => {
  if (!chromium) return;
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE_PATH, args:['--no-sandbox']});
});
after(async () => { await browser?.close(); });

function luminance(color) {
  const rgb = color.startsWith('#') ? color.slice(1).match(/../g).map(v => parseInt(v, 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
  return rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
}
async function open(t, width = 1440) {
  const page = await browser.newPage({viewport:{width,height:1000}, reducedMotion:'reduce'});
  t.after(() => page.close());
  await page.route('http**/*', route => route.abort());
  await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
  return page;
}
async function screenshot(page, name) {
  if (!process.env.CONTRAST_SCREENSHOTS_DIR) return;
  fs.mkdirSync(process.env.CONTRAST_SCREENSHOTS_DIR, {recursive:true});
  await page.screenshot({path:path.join(process.env.CONTRAST_SCREENSHOTS_DIR, name + '.png'),fullPage:true});
}

test('both green setup links remain readable normally, hovered and focused on desktop and mobile', {skip: !chromium}, async t => {
  for (const width of [1440, 390]) {
    const page = await open(t, width);
    await page.getByRole('button', {name:'For my family'}).click();
    for (let i = 0; i < 4; i++) await page.locator('#preview .next').click();
    for (const id of ['beginner-guide', 'technical-guide']) {
      await page.locator(`#preview button[aria-controls="${id}"]`).click();
      const link = page.locator(`#preview #${id} .guide-link`);
      await screenshot(page, `${width}-${id}`);
      for (const state of ['normal', 'hover', 'focus']) {
        if (state === 'hover') await link.hover();
        if (state === 'focus') { await page.mouse.move(0, 0); await link.focus(); }
        const colors = await link.evaluate(el => ({text:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
        const ratio = contrast(colors.text, colors.background);
        assert.ok(ratio >= 4.5, `${width} ${id} ${state}: guide text contrast ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('F4 and H1 bookmarks stand apart from the oak tabletop', {skip: !chromium}, async t => {
  const page = await open(t);
  await page.getByRole('button', {name:'For my family'}).click();
  for (let i = 0; i < 3; i++) await page.locator('#preview .next').click();
  await screenshot(page, 'family-f4');
  const colors = await page.evaluate(() => {
    const root = document.querySelector('#preview > div').shadowRoot;
    return {
      oak:[...root.querySelectorAll('#oak stop')].map(el => el.getAttribute('stop-color')),
      f4:root.querySelector('.f-book-stage path[d="M199 224v30l9-6 9 6v-33"]').getAttribute('fill'),
      h1:root.querySelector('#setup-notebook path[d="m1 12 7 1 3 12-5-2-3 2Z"]').getAttribute('fill')
    };
  });
  for (const scene of ['f4', 'h1']) for (const oak of colors.oak) {
    assert.ok(contrast(colors[scene], oak) >= 3, `${scene} bookmark blends into oak ${oak}`);
  }
  await page.locator('#preview .next').click();
  await screenshot(page, 'hosting-h1');
});

test('school pilot roadmap link stays readable on the dark green boundary', {skip: !chromium}, async t => {
  const page = await open(t);
  await page.getByRole('button', {name:'For people in my care'}).click();
  await page.getByRole('button', {name:'Nourish the next generation'}).click();
  for (let i = 0; i < 4; i++) await page.locator('#preview .next').click();
  const link = page.locator('#preview .pilot-boundary a');
  await screenshot(page, 'school-pilot-boundary-link');
  const colors = await link.evaluate(el => ({text:getComputedStyle(el).color,background:getComputedStyle(el.parentElement).backgroundColor}));
  assert.ok(contrast(colors.text, colors.background) >= 4.5, `school pilot roadmap link contrast ${contrast(colors.text, colors.background).toFixed(2)}:1`);
});

test('restart reloads the page and returns to the opening', {skip: !chromium}, async t => {
  const page = await open(t, 390);
  await page.getByRole('button', {name:'For my family'}).click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name:'Restart', exact:true}).click()]);
  assert.match(await page.locator('#preview h1').textContent(), /next chapter starts/i);
});

test('G1 care hands have distinct skin tones and visible edges against the table', {skip: !chromium}, async t => {
  const page = await open(t);
  await page.getByRole('button', {name:'For people in my care'}).click();
  await screenshot(page, 'care-g1');
  await page.getByRole('button', {name:'Bring care to the table'}).click();
  const art = await page.evaluate(() => {
    const root = document.querySelector('#preview > div').shadowRoot;
    return {
      oak:[...root.querySelectorAll('#oak stop')].map(el => el.getAttribute('stop-color')),
      hands:['m99 106 22-5q6-1 12 2', 'm198 104-18-3q-7-1-13 3'].map(d => {
        const layers = [...root.querySelectorAll('#dining-setting path')].filter(el => el.getAttribute('d') === d);
        return layers.map(el => ({color:getComputedStyle(el).stroke,width:parseFloat(getComputedStyle(el).strokeWidth)}));
      })
    };
  });
  for (const [index, layers] of art.hands.entries()) {
    const skin = layers.at(-1);
    for (const oak of art.oak) assert.ok(contrast(skin.color, oak) >= 1.5, `person ${index + 1}: skin blends into oak ${oak}`);
    assert.ok(layers.length >= 2 && layers[0].width > skin.width, `person ${index + 1}: missing visible hand outline`);
    for (const oak of art.oak) assert.ok(contrast(layers[0].color, oak) >= 3, `person ${index + 1}: hand edge blends into oak ${oak}`);
  }
});
