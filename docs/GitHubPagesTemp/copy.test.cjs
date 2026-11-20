const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function open() {
  const dom = new JSDOM(html, {runScripts:'dangerously', url:'http://localhost/index.html', beforeParse(w) {w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})}});
  const root=()=>dom.window.document.querySelector('#preview>div').shadowRoot;
  const click=(selector,text)=>{const b=[...root().querySelectorAll(selector)].find(x=>!text||x.textContent.includes(text));assert.ok(b,`missing ${selector} ${text||''}`);b.click()};
  return {dom,root,click};
}

test('personal journey weight goal, removed copy, and self-hosted data ownership',()=>{
 const t=open();t.click('.choice','For myself');assert.match(t.root().textContent,/paying closer attention to nutrition, or maybe you just want to lose weight/i);
 t.click('.next');assert.doesNotMatch(t.root().textContent,/Explore recipes against editable targets\. Missing required nutrition/);
 t.click('.next');t.click('.next');t.click('.next');assert.match(t.root().textContent,/your data/i);assert.match(t.root().textContent,/advertis/i);assert.match(t.root().textContent,/machine/i);t.dom.window.close();
});

test('family journey promotes synergies, a shorter list, and an heirloom cookbook',()=>{
 const t=open();t.click('.choice','For my family');t.click('.next');assert.match(t.root().textContent,/A week with a plan: Less Time Cooking and More Time Living/);
 t.click('.next');assert.match(t.root().textContent,/synerg/i);assert.match(t.root().textContent,/ingredient/i);assert.match(t.root().textContent,/serving/i);assert.match(t.root().textContent,/waste/i);assert.match(t.root().textContent,/grocery/i);
 t.click('.next');assert.match(t.root().textContent,/family recipe book/i);assert.match(t.root().textContent,/grandma/i);assert.match(t.root().textContent,/heirloom/i);t.dom.window.close();
});

test('care copy omissions and school beta future-goal note',()=>{
 const t=open();t.click('.choice','For people in my care');t.click('.choice','Bring care to the table');t.click('.next');assert.doesNotMatch(t.root().textContent,/Missing information matters\. Check unreported nutrients/);
 t.click('.next');assert.doesNotMatch(t.root().textContent,/Choose planned servings/);t.click('.next');assert.doesNotMatch(t.root().textContent,/Begin with examples, not real care information/);
 [...t.root().querySelectorAll('button')].find(b=>b.textContent.includes('Change path')).click();t.click('.choice','For people in my care');t.click('.choice','Nourish the next generation');t.click('.next');t.click('.next');assert.doesNotMatch(t.root().textContent,/Sample quantities\. Review kitchen suitability independently/);
 t.click('.next');assert.match(t.root().textContent,/Beta software/i);assert.match(t.root().textContent,/USDA/i);assert.match(t.root().textContent,/future|after beta/i);const link=[...t.root().querySelectorAll('a')].find(a=>/USDA|school.meal/i.test(a.textContent));assert.ok(link,'link to school meal roadmap');t.dom.window.close();
});
