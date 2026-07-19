import fs from 'node:fs';
import { expect, test } from '@playwright/test';


const storageState = process.env.SVBK_E2E_STORAGE_STATE;
test.use(storageState && fs.existsSync(storageState) ? { storageState } : {});

test('@authenticated dashboard navigation and logout', async ({ page }) => {
  test.skip(!storageState || !fs.existsSync(storageState), 'Provide storage state from a synthetic test account.');
  await page.goto('./#/page/dashboard_processing');
  await expect(page.locator('body')).toContainText(/dashboard|processing/i);
  await page.goto('/auth/logout');
  await page.goto('./');
  await expect(page.locator('iframe[title="SVBK ERP Website and Login"]')).toBeVisible();
});
