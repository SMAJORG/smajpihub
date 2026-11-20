import { test, expect } from '@playwright/test';
const token = 'testnet_admin.' + 'a'.repeat(64);
const sender = 'G' + 'B'.repeat(55), recipient = 'G' + 'A'.repeat(55);

for (const theme of ['light', 'dark']) test(`isolated admin sign-in, payment confirmation and logout in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width: theme === 'light' ? 390 : 1280, height: 900 });
  let sent = 0, logins = 0;
  await page.route('**/admin/testnet/auth/login', async route => {
    logins++;
    expect(route.request().postDataJSON()).toEqual({ username: 'existing-admin', password: 'fixture-only-password' });
    expect(route.request().headers().cookie).toBeUndefined();
    if (logins === 1) return route.fulfill({ status: 401, json: { message: 'Invalid administrator credentials.' } });
    return route.fulfill({ json: { token, username: 'existing-admin', expiresAt: new Date(Date.now() + 1800000).toISOString(), scope: 'testnet-payouts' } });
  });
  await page.route('**/admin/testnet/auth/logout', route => {
    expect(route.request().headers().authorization).toBe('Bearer ' + token);
    return route.fulfill({ status: 204 });
  });
  await page.route('**/admin/testnet/a2u**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe('Bearer ' + token);
    const data = path.endsWith('/dashboard') ? { wallet: { address: sender, ready: true, balance: 5, spendable: 4, message: 'Wallet checks passed.' }, records: [], successfulUniqueWallets: 0, walletLocked: false, hasMore: false }
      : path.endsWith('/recipients') ? { recipients: [{ uid: 'verified-user', username: 'alice', displayName: 'Alice', walletAddress: recipient, canReceive: true }], hasMore: false }
      : path.endsWith('/preflight') ? { checksPassed: true, recipientWalletAddress: recipient, senderWalletAddress: sender, approvalToken: 'fixture-approval' }
      : { payout: { status: 'completed' } };
    if (request.method() === 'POST') sent++;
    await route.fulfill({ json: data });
  });
  await page.goto('/tests/payouts.html?standalone=1');
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await page.locator('.testnet-admin-access').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(theme === 'dark' ? 'rgb(7, 17, 31)' : 'rgb(255, 255, 255)');
  await expect(page.getByRole('heading', { name: 'Testnet administrator sign-in' })).toBeVisible();
  await page.getByLabel('Administrator username').fill('existing-admin');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to Testnet dashboard' }).focus();
  expect(await page.getByRole('button', { name: 'Sign in to Testnet dashboard' }).evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.getByRole('button', { name: 'Sign in to Testnet dashboard' }).hover();
  await page.getByRole('button', { name: 'Sign in to Testnet dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid administrator credentials.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to Testnet dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Testnet Payouts', exact: true })).toBeVisible();
  const send = page.getByRole('button', { name: 'Send 0.01 Test-Pi', exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole('button', { name: /Alice/ }).click();
  await expect(send).toBeEnabled(); await send.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: 'Confirm and send 0.01 Test-Pi' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(sent).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes('testnet_admin.')))).toBe(false);
  await page.screenshot({ path: test.info().outputPath(`admin-access-${theme}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Testnet administrator sign-in' })).toBeVisible();
});
