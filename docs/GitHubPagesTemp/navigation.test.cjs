const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function open(reduced = true) {
  const errors = [];
  const motion = {matches:reduced, listener:null, addEventListener(type, fn){this.listener = fn;}, removeEventListener(){this.listener = null;}};
  const stats = {started:0, cancelled:0};
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, {runScripts:'dangerously', url:'http://localhost/index.html', virtualConsole:console,
    beforeParse(window) {
      window.matchMedia = () => motion;
      window.Element.prototype.animate = () => { stats.started++; return {cancel(){stats.cancelled++;}}; };
    }});
  const root = () => dom.window.document.querySelector('#preview > div').shadowRoot;
  const heading = () => root().querySelector('h1').textContent;
  function click(selector, text) {
    const el = [...root().querySelectorAll(selector)].find(node => !text || node.textContent.includes(text));
    assert.ok(el, `missing ${selector} ${text || ''}`); el.click();
  }
  return {dom, errors, root, heading, click, motion, stats};
}
const routes = {
  personal: ['For myself', null, /make it yours/i],
  family: ['For my family', null, /make it yours/i],
  care: ['For people in my care', 'Bring care to the table', /small, thoughtful pilot/i],
  school: ['For people in my care', 'Nourish the next generation', /small, thoughtful pilot/i]
};
function enter(c, route) { const [first, second] = routes[route]; c.click('.choice', first); if (second) c.click('.choice', second); }
function validateSetup(c, route) {
  assert.match(c.heading(), routes[route][2]);
  const boundary = c.root().querySelector('.setup-materials .pilot-boundary').textContent;
  assert.match(boundary, route === 'school' ? /school-meal/ : route === 'care' ? /clinical system/ : /not medical advice/);
}
for (const route of Object.keys(routes)) {
  for (let index = 0; index < 4; index++) {
    for (const action of ['skip', 'setup']) test(`${route} chapter ${index + 1}: ${action} opens setup and back restores chapter`, () => {
      const c = open(); enter(c, route);
      for (let i = 0; i < index; i++) c.click('.next');
      const previous = c.heading();
      c.click(`[data-action=${action}]`); validateSetup(c, route);
      c.click('[data-action=back]'); assert.equal(c.heading(), previous);
      assert.deepEqual(c.errors, []); c.dom.window.close();
    });
  }
}
for (const start of ['opening', 'branches']) for (const action of ['skip', 'setup']) test(`${start}: ${action} opens general setup and back returns`, () => {
  const c = open(); if (start === 'branches') c.click('.choice', 'For people in my care');
  const previous = c.heading(); c.click(`[data-action=${action}]`); validateSetup(c, 'personal');
  c.click('[data-action=back]'); assert.equal(c.heading(), previous);
  assert.deepEqual(c.errors, []); c.dom.window.close();
});
test('replay and reduced motion remain functional', () => {
  const c = open(false); enter(c, 'personal');
  const started = c.stats.started; c.click('[data-action=replay]');
  assert.ok(c.stats.started > started); assert.ok(c.stats.cancelled > 0);
  const cancelled = c.stats.cancelled; c.motion.matches = true; c.motion.listener();
  assert.ok(c.stats.cancelled > cancelled);
  const after = c.stats.started; c.click('[data-action=replay]'); assert.equal(c.stats.started, after);
  assert.deepEqual(c.errors, []); c.dom.window.close();
});
test('school breakfast selection survives setup and back', () => {
  const c = open(); enter(c, 'school'); c.click('[data-meal=breakfast]');
  c.click('[data-action=setup]'); c.click('[data-action=back]');
  assert.equal(c.root().querySelector('[data-meal=breakfast]').getAttribute('aria-pressed'), 'true');
  c.dom.window.close();
});
test('setup controls remain usable on setup and restart requests a refresh', () => {
  const c = open(); enter(c, 'school'); c.click('[data-action=skip]');
  const setup = c.heading(); c.click('[data-action=setup]'); assert.equal(c.heading(), setup);
  c.click('[data-action=skip]'); assert.equal(c.heading(), setup);
  c.dom.window.eval('restartAdventure = () => { window.__restartRequested = true; }');
  c.click('[data-action=restart]'); assert.equal(c.dom.window.__restartRequested, true);
  assert.deepEqual(c.errors, []); c.dom.window.close();
});
