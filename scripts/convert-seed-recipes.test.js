const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const recipe = (title, ingredients) => `---\ntitle: ${title}\ntags: ['test']\n---\n\n## Ingredients\n\n${ingredients}\n\n## Directions\n\n1. Cook.\n`;

test('complete-only native JSON bundle contains only complete recipes without broken links or overwriting other bundles', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dietledger-seed-bundle-'));
  try {
    const scripts = path.join(temp, 'scripts');
    const seed = path.join(temp, 'seed-recipes');
    fs.mkdirSync(scripts);
    fs.mkdirSync(path.join(seed, 'complete'), { recursive: true });
    fs.mkdirSync(path.join(seed, 'incomplete'));
    fs.mkdirSync(path.join(seed, 'dist'));
    fs.mkdirSync(path.join(temp, 'public', 'demo'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'convert-seed-recipes.js'), path.join(scripts, 'convert-seed-recipes.js'));
    fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(temp, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(seed, 'complete', 'base.md'), recipe('Base', '* 100g flour'));
    fs.writeFileSync(path.join(seed, 'complete', 'dish.md'), recipe('Dish', '- 1 [base](/base)\n- 100g [excluded](/excluded)'));
    fs.writeFileSync(path.join(seed, 'incomplete', 'excluded.md'), recipe('Excluded', '- flour'));
    const allZip = path.join(seed, 'dist', 'seed-recipes.zip');
    const demoZip = path.join(temp, 'public', 'demo', 'demo-cookbook.zip');
    fs.writeFileSync(allZip, 'original bundle');
    fs.writeFileSync(demoZip, 'original demo');

    execFileSync(process.execPath, [path.join(scripts, 'convert-seed-recipes.js'), '--complete-only'], { cwd: temp, stdio: 'pipe' });

    const output = path.join(seed, 'dist', 'complete-recipes.dietledger-bundle.json');
    const bundle = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(bundle.format, 'dietledger.recipe-bundle');
    assert.equal(bundle.version, 1);
    assert.deepEqual(bundle.recipes.map((r) => r.bundleRecipeId).sort(), ['base', 'dish']);
    const dish = bundle.recipes.find((r) => r.bundleRecipeId === 'dish');
    assert.ok(dish.ingredients.some((i) => i.source.type === 'recipe' && i.source.bundleRecipeId === 'base'));
    assert.ok(dish.ingredients.every((i) => i.source.bundleRecipeId !== 'excluded'));
    const baseIngredient = bundle.recipes.find((r) => r.bundleRecipeId === 'base').ingredients[0];
    assert.equal(baseIngredient.name, 'flour');
    assert.deepEqual(baseIngredient.source, { type: 'manual' });
    assert.equal(baseIngredient.nutrients.calories, 0);
    assert.ok(bundle.recipes.flatMap((r) => r.ingredients).every((i) => i.bundleIngredientId && i.nutrients && i.source.type));
    assert.ok(bundle.recipeCategories.every((rc) => bundle.recipes.some((r) => r.bundleRecipeId === rc.bundleRecipeId)));
    assert.equal(fs.readFileSync(allZip, 'utf8'), 'original bundle');
    assert.equal(fs.readFileSync(demoZip, 'utf8'), 'original demo');
    assert.equal(fs.existsSync(path.join(seed, 'dist', 'seed-recipes.json')), false);
    assert.equal(fs.existsSync(path.join(seed, 'dist', 'complete-recipes.zip')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
