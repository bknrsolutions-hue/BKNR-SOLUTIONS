import { expect, test } from '@playwright/test';


test('@public login shell loads without browser errors', async ({ page }) => {
  const consoleErrors = [];
  const networkFailures = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => networkFailures.push(`${request.method()} ${request.url()}`));

  await page.goto('./');
  const loginFrame = page.frameLocator('iframe[title="SVBK ERP Website and Login"]');
  await expect(loginFrame.locator('#loginBox h2')).toHaveText('Login');
  await expect(loginFrame.getByText('ERP Tenant Code', { exact: false }).first()).toBeVisible();

  expect(networkFailures).toEqual([]);
  expect(consoleErrors.filter(message => !message.includes('favicon'))).toEqual([]);
});


test('@public protected JSON resource requires a session', async ({ request, baseURL }) => {
  const response = await request.get(
    new URL('/processing/gate_entry?format=json', baseURL).toString(),
  );
  expect(response.status()).toBe(401);
  expect((await response.json()).session_expired).toBe(true);
});
