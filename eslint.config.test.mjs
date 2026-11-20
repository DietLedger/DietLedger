import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const harnesses = ['contrast', 'copy', 'navigation', 'preview'];

for (const name of harnesses) {
  test(`standalone Pages ${name} CommonJS harness permits require`, async () => {
    const [result] = await eslint.lintText("const assert = require('node:assert/strict');\n", {
      filePath: `docs/GitHubPagesTemp/${name}.test.cjs`,
    });
    assert.equal(result.messages.some(message => message.ruleId === '@typescript-eslint/no-require-imports'), false);
  });
}

for (const filePath of ['src/lib/lint-policy-probe.ts', 'lint-policy-probe.cjs']) {
  test(`require remains prohibited outside the standalone harnesses: ${filePath}`, async () => {
    const [result] = await eslint.lintText("const assert = require('node:assert/strict');\n", { filePath });
    assert.equal(result.messages.some(message => message.ruleId === '@typescript-eslint/no-require-imports'), true);
  });
}
