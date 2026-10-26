import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

// Run inside the UI container in the isolated, auth-disabled CI stack.
const endpoint = process.env.EDITOR_SMOKE_URL || 'http://localhost:8080';
const alias = "owner's \\n dataset";
const expectedRows = [['editor-smoke', 'dataset-id', 42]];

async function waitForUi() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${endpoint}/ping`, {signal: AbortSignal.timeout(2000)});
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await delay(1000);
  }
  throw new Error('UI did not become ready within the startup deadline');
}

await waitForUi();
const response = await fetch(`${endpoint}/api/run`, {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  signal: AbortSignal.timeout(30000),
  body: JSON.stringify({
    params: {},
    config: {
      key: 'editor-smoke',
      meta: {stype: 'table_node'},
      data: {
        meta: JSON.stringify({links: {[alias]: 'dataset-id'}}),
        params: 'module.exports = {};',
        url: 'module.exports = {};',
        ui: 'module.exports = [];',
        js: `
          const dataset = require('libs/dataset/v2');
          const source = dataset.buildSource({id: 'dataset-id', columns: ['value']});
          if (!source) throw new Error('Bundled dataset helper did not run');
          module.exports = {
            head: [{id: 'name'}, {id: 'dataset'}, {id: 'value'}],
            rows: [['editor-smoke', ChartEditor.getId(${JSON.stringify(alias)}), 6 * 7]],
          };
        `,
      },
    },
  }),
});
const body = await response.text();
assert.equal(response.status, 200, `Editor API returned ${response.status}: ${body}`);
const result = JSON.parse(body);
assert.equal(result.error, undefined, JSON.stringify(result.error));
assert.deepEqual(result.data?.rows, expectedRows);
console.log('Editor smoke passed: table_node, bundled dataset helper, literal link alias, output rows');
