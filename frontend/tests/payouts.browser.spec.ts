import { test, expect } from '@playwright/test';
const address='G'+'A'.repeat(55), sender='G'+'B'.repeat(55);
test.beforeEach(async ({page})=>{
 await page.addInitScript(()=>localStorage.setItem('smaj_pi_user',JSON.stringify({uid:'admin',username:'admin',displayName:'Admin',role:'admin',accessToken:'hub_access.test.fixture'})));
 await page.route(/\/user(?:[/?]|$)/,route=>route.fulfill({json:{user:{uid:'admin',username:'admin',displayName:'Admin',role:'admin'}}}));
});
for(const width of [390,1280]) {
 test(`session, confirmation, unique progress and history at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(theme=>localStorage.setItem('smaj_admin_theme_v3',theme),width===390?'light':'dark');
  let sends=0;
  await page.route('**/admin/testnet/a2u**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;expect(req.headers().authorization).toBe('Bearer hub_access.test.fixture');let data:unknown;
   if(path.endsWith('/dashboard'))data={wallet:{address:sender,balance:5,spendable:4,ready:true,apiKeyAccepted:true,apiStatus:200,message:'Wallet checks passed.'},records:sends?[{recipientUid:'user',recipientWalletAddress:address,amount:0.01,status:'completed',paymentId:'payment-123',txid:'tx-123'}]:[],successfulUniqueWallets:sends?1:0,walletLocked:false,hasMore:false,appWalletConnection:'Confirm connected Testnet wallet in Pi Developer Portal.'};
   else if(path.endsWith('/recipients'))data={recipients:[{uid:'user',username:'alice',displayName:'Alice',walletAddress:address,canReceive:!sends,status:sends?'completed':'eligible'}],hasMore:false};
   else if(path.endsWith('/preflight'))data={checksPassed:true,recipientWalletAddress:address,senderWalletAddress:sender};
   else{expect(req.method()).toBe('POST');expect(req.postDataJSON()).toEqual({uid:'user',recipientWalletAddress:address,senderWalletAddress:sender});sends++;data={payout:{status:'completed',paymentId:'payment-123'}};}
   await route.fulfill({json:data});
  });
  await page.goto('/tests/payouts.html');await expect(page.getByRole('heading',{name:'Testnet Payouts',exact:true})).toBeVisible();
  expect(await page.getByRole('textbox',{name:'Find a user'}).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(width===390?'rgb(255, 255, 255)':'rgb(29, 41, 57)');
  const send=page.getByRole('button',{name:'Send 0.01 Test-Pi',exact:true});await expect(send).toBeDisabled();await page.getByRole('button',{name:/Alice/}).click();await expect(page.getByText('Recipient checks passed',{exact:true})).toBeVisible();await send.click();
  await expect(page.getByRole('dialog')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(width===390?'rgb(255, 255, 255)':'rgb(29, 41, 57)');expect(sends).toBe(0);await expect(page.getByRole('button',{name:'Confirm and send 0.01 Test-Pi'})).toBeDisabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(sends).toBe(0);
  await send.click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm and send 0.01 Test-Pi'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByText('payment-123',{exact:true})).toBeVisible();await expect(page.getByText('1 / 5',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Alice/})).toBeDisabled();expect(sends).toBe(1);
  if(width===390){
   await page.evaluate(()=>window.scrollTo(0,0));
   const header=await page.locator('.admin-shell > .private-header').boundingBox(),title=await page.getByRole('heading',{name:'Testnet Payouts',exact:true}).boundingBox();
   expect(title!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
   const logo=await page.locator('.private-header .private-brand img').boundingBox();expect(logo!.y+logo!.height).toBeLessThanOrEqual(header!.y+header!.height);
  }
  await page.screenshot({path:test.info().outputPath('payouts-theme.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('input[type=password]')).toHaveCount(0);
 });
}
test('uncertain payment is never automatically resent',async({page})=>{
 let sends=0;
 await page.route('**/admin/testnet/a2u**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST'){sends++;await route.fulfill({status:409,json:{message:'Payout stopped; administrator reconciliation required.'}});return;}
  const data=path.endsWith('/dashboard')?{wallet:{address:sender,balance:5,spendable:4,ready:true,apiKeyAccepted:true,apiStatus:200,message:'Ready'},records:[],successfulUniqueWallets:0,walletLocked:sends>0,hasMore:false}:path.endsWith('/recipients')?{recipients:[{uid:'user',displayName:'Alice',username:'alice',walletAddress:address,canReceive:!sends}],hasMore:false}:{checksPassed:true,recipientWalletAddress:address,senderWalletAddress:sender};await route.fulfill({json:data});
 });
 await page.goto('/tests/payouts.html');await page.getByRole('button',{name:/Alice/}).click();await page.getByRole('button',{name:'Send 0.01 Test-Pi',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm and send 0.01 Test-Pi'}).click();await expect(page.getByRole('alert')).toContainText('Do not resend');await expect(page.getByRole('button',{name:'Send 0.01 Test-Pi',exact:true})).toBeDisabled();expect(sends).toBe(1);
});

test('canonical Hub session wins over stale profile token and failed search is not an empty result',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('smaj_pi_user',JSON.stringify({uid:'admin',role:'admin',accessToken:'stale-pi-token'}));
  localStorage.setItem('smaj_hub_session',JSON.stringify({uid:'admin',accessToken:'hub_access.canonical.fixture'}));
 });
 await page.route('**/admin/testnet/a2u**',async route=>{
  expect(route.request().headers().authorization).toBe('Bearer hub_access.canonical.fixture');
  if(new URL(route.request().url()).pathname.endsWith('/recipients')) await route.fulfill({status:403,json:{error:'forbidden'}});
  else await route.fulfill({json:{wallet:{address:sender,balance:5,spendable:4,ready:true,apiKeyAccepted:true,apiStatus:200,message:'Ready'},records:[],successfulUniqueWallets:0,walletLocked:false}});
 });
 await page.goto('/tests/payouts.html');await expect(page.getByRole('alert')).toContainText('not authorized');
 await expect(page.getByText(/No verified recipient matched/)).toHaveCount(0);
});
test('search sends @username and wallet values, and renders missing-consent diagnostics',async({page})=>{
 const searches:string[]=[];
 await page.route('**/admin/testnet/a2u**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/recipients')) {searches.push(url.searchParams.get('search')||'');await route.fulfill({json:{recipients:[],hasMore:false,diagnostics:{wallet_consent_required:1},message:'Approve wallet sharing during Pi login.'}});}
  else await route.fulfill({json:{wallet:{address:sender,balance:5,spendable:4,ready:true,apiKeyAccepted:true,apiStatus:200,message:'Ready'},records:[],successfulUniqueWallets:0,walletLocked:false}});
 });
 await page.goto('/tests/payouts.html');await expect(page.getByText(/Wallet sharing has not been approved/)).toBeVisible();
 await page.getByRole('textbox',{name:'Find a user'}).fill('@alice');await page.getByRole('button',{name:'Search',exact:true}).click();await expect.poll(()=>searches.includes('@alice')).toBe(true);
 await page.getByRole('textbox',{name:'Find a user'}).fill(address);await page.getByRole('button',{name:'Search',exact:true}).click();await expect.poll(()=>searches.includes(address)).toBe(true);
});
