import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

// The upstream image reuses one storageState for the entire suite. After its token
// enters the refresh window, independent contexts race over the same session.
// Mount a fixture that signs in separately for each test, without changing auth
// policy, session TTLs, the application image, or the tests being exercised.
assert(process.argv[2], 'Usage: node scripts/prepare-upstream-auth.mjs <upstream-ui-checkout>');
const root = path.resolve(process.argv[2]);
const fixturePath = path.join(root, 'tests/utils/playwright/globalTestDefinition.ts');
const source = readFileSync(fixturePath, 'utf8');
const anchor = 'const datalensTest = baseTest.extend<DatalensTestFixtures>({';
assert.equal(source.split(anchor).length, 2, 'Upstream fixture changed; review the auth adapter');
const fixture = `
    storageState: async ({browser, baseURL}, use) => {
        if (!baseURL) throw new Error('E2E baseURL is required');
        const authContext = await browser.newContext();
        let state;
        try {
            const page = await authContext.newPage();
            await page.goto(baseURL + '/auth/signin');
            await page.locator('[data-qa="sign-in-login"] input').fill(process.env.E2E_USER_LOGIN || 'admin');
            await page.locator('[data-qa="sign-in-password"] input').fill(process.env.E2E_USER_PASSWORD || 'admin');
            await page.locator('button[type="submit"]').click();
            await page.waitForURL((url) => !url.pathname.startsWith('/auth/'));
            state = await authContext.storageState();
        } finally {
            await authContext.close();
        }
        await use(state);
    },
`;
writeFileSync(fixturePath, source.replace(anchor, anchor + fixture));
writeFileSync(
    path.join(root, 'tests/docker-compose.auth-isolation.yml'),
    `services:
  datalens-from-image-tests:
    volumes:
      - type: bind
        source: ${JSON.stringify(fixturePath)}
        target: /opt/app/tests/utils/playwright/globalTestDefinition.ts
        read_only: true
`,
);
console.log('Prepared isolated per-test sessions for upstream compatibility tests');
