import { test, expect } from '@playwright/test';
for (const theme of ['light', 'dark']) test(`identity verification and controls follow ${theme} theme`, async ({ page }) => {
  await page.addInitScript((selected) => {
    localStorage.setItem('smaj_public_theme', selected);
    (window as any).Pi = { init: async()=>undefined, authenticate: async()=>({accessToken:'test-token',user:{uid:'ignored-client-uid'}}) };
  }, theme);
  const code='A'.repeat(43);
  await page.route('**/user/pi-identities/*', async route => {
    const body=route.request().postDataJSON();
    expect(body.accessToken).toBe('test-token');
    const action=route.request().url().split('/').pop();
    const original={uid:'original-uid',username:'Original seller',role:'seller'};
    if(action==='complete')expect(body.confirmedOriginalUid).toBe(original.uid);
    await route.fulfill({json:action==='start'?{code,original,expiresAt:new Date(Date.now()+600000).toISOString()}:action==='preview'?{original,incoming:{uid:'second-uid',username:'Second identity'},existingSecondaryAccount:true}:{linked:true}});
  });
  await page.goto('/tests/piLink.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(selected=>{document.documentElement.dataset.theme=selected;}, theme);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:'Verify second identity'})).toBeDisabled();
  await page.getByRole('button',{name:'Verify original identity'}).click();
  await expect(page.getByLabel('Private one-time verification code')).toHaveValue(code);
  await page.getByLabel('Code from your original app').fill(code);
  await page.getByRole('button',{name:'Verify second identity'}).click();
  const confirm=page.getByRole('button',{name:'Confirm connection to my original account'});
  await expect(confirm).toBeVisible();
  await confirm.hover();await confirm.focus();
  const styles=await page.locator('.pi-account-link').evaluate(root=>{
    const section=root.querySelector('section')!,input=root.querySelector('input')!,button=root.querySelector('button')!;
    const token=(name:string)=>{const probe=document.createElement('span');probe.style.color=`var(${name})`;root.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;};
    return {theme:document.documentElement.dataset.theme,text:getComputedStyle(root).color,expectedText:token('--text'),panel:getComputedStyle(section).backgroundColor,expectedPanel:token('--surface'),input:getComputedStyle(input).color,button:getComputedStyle(button).color};
  });
  expect(styles.theme).toBe(theme);expect(styles.text).toBe(styles.expectedText);expect(styles.panel).toBe(styles.expectedPanel);expect(styles.input).toBe(styles.expectedText);expect(styles.button).toBe(styles.expectedText);
  await page.screenshot({path:`test-results/pi-link-${theme}.png`,fullPage:true});
  await confirm.click();await expect(page.getByRole('status')).toContainText('Identities connected');
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain(code);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('test-token');
  await page.goto('/tests/piLink.html?dialog', { waitUntil: 'domcontentloaded' });
  await page.evaluate(selected=>{document.documentElement.dataset.theme=selected;}, theme);
  const dialog=page.getByRole('dialog',{name:'Pi sign-in'});
  await expect(dialog).toBeVisible();
  const dialogStyles=await dialog.evaluate(node=>({text:getComputedStyle(node).color,button:getComputedStyle(node.querySelector('button')!).color,background:getComputedStyle(node).backgroundColor}));
  expect(dialogStyles.text).toBe(styles.expectedText);expect(dialogStyles.button).toBe(styles.expectedText);expect(dialogStyles.background).toBe(styles.expectedPanel);
  await page.screenshot({path:`test-results/pi-signin-${theme}.png`,fullPage:true});
});
