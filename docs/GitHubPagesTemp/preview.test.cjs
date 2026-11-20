const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function open(reduced = true) {
  const errors = [];
  const motion = {matches: reduced, listener: null, addEventListener(type, fn) { this.listener = fn; }, removeEventListener() { this.listener = null; }};
  const animationStats = {started: 0, cancelled: 0};
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/index.html', virtualConsole: console,
    beforeParse(window) {
      window.matchMedia = () => motion;
      window.Element.prototype.animate = function () {
        animationStats.started++;
        return {cancel() {animationStats.cancelled++;}, onfinish: null};
      };
    }
  });
  function root() { return dom.window.document.querySelector('#preview > div')?.shadowRoot; }
  function click(selector, text) {
    const nodes = [...root().querySelectorAll(selector)];
    const button = text ? nodes.find(node => node.textContent.includes(text)) : nodes[0];
    assert.ok(button, `missing ${selector}: ${text || ''}`);
    button.click();
  }
  function heading(expected) { assert.match(root().querySelector('h1').textContent, expected); }
  return {dom, root, click, heading, errors, motion, animationStats};
}

function fromOpening(ctx, route) {
  ctx.click('.choice', route === 'personal' ? 'For myself' : route === 'family' ? 'For my family' : 'For people in my care');
  if (route === 'care') ctx.click('.choice', 'Bring care to the table');
}

const sequences = {
  personal: [/Your needs deserve/, /Find possibilities/, /Give tomorrow/, /One day is a beginning/],
  family: [/future doesn.t always start/i, /planning can make room/i, /meals shape the shopping list/i, /recipes become part/i],
  care: [/person behind every meal/i, /care more context/i, /next few meals/i, /human part of care/i]
};
for (const [route, headings] of Object.entries(sequences)) {
  test(`${route} journey, reverse navigation, setup, and path switching`, () => {
    const ctx = open();
    fromOpening(ctx, route);
    for (let i = 0; i < headings.length; i++) {
      ctx.heading(headings[i]);
      assert.doesNotMatch(ctx.root().querySelector('.status').textContent, /Chapter \d+ of 4/);
      if (route === 'personal' && i === 0) {
        assert.doesNotMatch(ctx.root().textContent, /Maybe you simply want your meals to reflect what matters to you\./);
      }
      if (i === 1) {
        ctx.click('[data-action=back]');
        ctx.heading(headings[0]);
        ctx.click('.next');
        ctx.heading(headings[1]);
      }
      ctx.click('.next');
    }
    ctx.heading(route === 'care' ? /thoughtful pilot/i : /make it yours/i);
    assert.doesNotMatch(ctx.root().textContent, /Change path/i, 'final setup page omits Change path');
    assert.match(ctx.root().textContent, /Community Care License/);
    if (route === 'care') {
      assert.match(ctx.root().textContent, /not a clinical system/i);
      assert.match(ctx.root().textContent, /allergies/i);
      assert.doesNotMatch(ctx.root().textContent, /not a school-meal compliance system/i);
    }
    ctx.click('[data-action=back]');
    ctx.heading(headings[3]);
    const change = [...ctx.root().querySelectorAll('button')].find(b => b.textContent.includes('Change path'));
    assert.ok(change, 'Change path is available');
    change.click();
    ctx.heading(/next chapter starts/i);
    assert.deepEqual(ctx.errors, []);
    ctx.dom.window.close();
  });
}

test('journey copy is direct without illustration disclaimers or path labels', () => {
  const ctx = open();
  for (const route of Object.keys(sequences)) {
    fromOpening(ctx, route);
    for (let i = 0; i < 4; i++) {
      const root = ctx.root();
      assert.doesNotMatch(root.querySelector('.page').textContent, /illustrat|conceptual|not a product demonstration|not a live product demonstration|this illustration contains no measured values|your path:/i);
      for (const el of root.querySelectorAll('[aria-label]')) assert.doesNotMatch(el.getAttribute('aria-label'), /illustrat|conceptual/i);
      if (route === 'family' && i === 1) assert.equal(root.querySelectorAll('.f-week-art use[href="#plate"]').length, 0, 'family planner has no floating plates');
      ctx.click('.next');
    }
    assert.doesNotMatch(ctx.root().querySelector('.page').textContent, /your path:/i);
    assert.doesNotMatch(ctx.root().textContent, /Maybe you simply want your meals to reflect what matters to you\./);
    assert.match(ctx.root().querySelector('.page').textContent, /beta software/i);
    ctx.click('[data-action=back]');
    [...ctx.root().querySelectorAll('button')].find(b => b.textContent.includes('Change path')).click();
  }
  assert.deepEqual(ctx.errors, []);
  ctx.dom.window.close();
});

test('motion can be skipped, replayed, cancelled by preference change, and cleaned up', () => {
  const ctx = open(false);
  fromOpening(ctx, 'personal');
  const firstSceneStarts = ctx.animationStats.started;
  assert.ok(firstSceneStarts > 0);
  ctx.click('[data-action=replay]');
  assert.ok(ctx.animationStats.cancelled > 0);
  assert.ok(ctx.animationStats.started > firstSceneStarts);
  const before = ctx.animationStats.cancelled;
  ctx.motion.matches = true;
  ctx.motion.listener();
  assert.ok(ctx.animationStats.cancelled > before);
  const after = ctx.animationStats.started;
  ctx.click('[data-action=replay]');
  assert.equal(ctx.animationStats.started, after);
  ctx.click('.next');
  assert.equal(ctx.animationStats.started, after);
  assert.deepEqual(ctx.errors, []);
  ctx.dom.window.close();
});

test('all new scenes reference existing inline SVG artwork', () => {
  const ctx = open();
  for (const route of Object.keys(sequences)) {
    if (!ctx.root().querySelector('.choice')) throw Error('opening choices missing');
    fromOpening(ctx, route);
    for (let i = 0; i < 4; i++) {
      const root = ctx.root();
      for (const svg of root.querySelectorAll('.story-art svg.adventure-animate')) {
        assert.notEqual(svg.parentElement?.localName, 'g', 'outer HTML-layout SVG must not be wrapped in an SVG group');
      }
      for (const use of root.querySelectorAll('.story-art use[href^="#"]')) {
        const id = use.getAttribute('href').slice(1);
        assert.ok(root.getElementById(id), `${route} scene ${i + 1}: missing #${id}`);
      }
      ctx.click('.next');
    }
    ctx.click('[data-action=back]');
    [...ctx.root().querySelectorAll('button')].find(b => b.textContent.includes('Change path')).click();
  }
  assert.deepEqual(ctx.errors, []);
  ctx.dom.window.close();
});

test('existing school route and vetted recipe remain accessible', () => {
  const ctx = open();
  ctx.click('.choice', 'For people in my care');
  ctx.click('.choice', 'Nourish the next generation');
  ctx.click('.next');
  for (const expected of ['English muffin mini pizzas', '100 whole-grain English muffins', '400 tbsp tomato sauce', '400 tbsp grated mozzarella', '300 cherry tomatoes', '100 basil leaves', '200 mini pizzas', '2 mini pizzas', '438 calories', '27.6 g', '10.2 g', '794 mg']) {
    assert.ok(ctx.root().textContent.includes(expected), `preserve recipe data: ${expected}`);
  }
  ctx.click('.next'); ctx.click('.next'); ctx.click('.next');
  ctx.heading(/small, thoughtful pilot/i);
  assert.match(ctx.root().textContent, /not a school-meal compliance system/i);
  assert.deepEqual(ctx.errors, []);
  ctx.dom.window.close();
});
