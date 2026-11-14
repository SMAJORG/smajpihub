import {test,expect} from '@playwright/test';
const original={uid:'canonical-testnet-uid',username:'pioneer',displayName:'Completed seller',role:'seller',roles:['seller'],country:'NG',verificationStatus:'approved',verificationLevel:'seller_verified',sellerActive:true,settings:{theme:'dark',language:'en',notifications:true}};
const session={accessToken:'hub_access.test-session',refreshToken:'hub_refresh_test-session',accessTokenExpiresAt:new Date(Date.now()+3600000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
async function setup(page:import('@playwright/test').Page,sandbox:boolean){
 await page.addInitScript(({user,session,sandbox})=>{
  localStorage.setItem('smaj_pi_user',JSON.stringify({...user,accessToken:session.accessToken}));localStorage.setItem('smaj_hub_session',JSON.stringify({...session,uid:user.uid}));
  window.__ENV={sandbox:String(sandbox)};
  window.Pi={init:()=>undefined,authenticate:async()=>({accessToken:'incoming-pi-test-token',user:{uid:'new-app-uid',username:'pioneer'}})} as unknown as NonNullable<Window['Pi']>;
 },{user:original,session,sandbox});
 await page.route(/\/user(?:[/?]|$)/,async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/user/signin')return route.fallback();
  await route.fulfill({json:path==='/user/refresh'?{user:original,session}:{user:original}});
 });
}
for(const sandbox of [true,false])test(`different ${sandbox?'Testnet':'Mainnet'} app identity cannot replace the original profile`,async({page})=>{
 await setup(page,sandbox);
 await page.route('**/user/signin',async route=>{const body=route.request().postDataJSON();expect(body.expectedAccountUid).toBeUndefined();expect(body.sandbox).toBe(sandbox);await route.fulfill({status:401,json:{error:'invalid_token',message:'Pi login failed. Please login again through Pi Browser.'}});});
 await page.goto('/tests/piAccounts.html');await expect(page.getByTestId('profile')).toContainText('Completed seller');await page.getByTestId('login').click();await expect(page.getByTestId('feedback')).toContainText('Pi login failed');await expect(page.getByTestId('profile')).toContainText(original.uid);await expect(page.getByTestId('profile')).toContainText('approved');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smaj_pi_user')||'{}').uid)).toBe(original.uid);
});
test('a backend outage cannot fabricate a new local buyer profile',async({page})=>{
 await setup(page,true);await page.route('**/user/signin',route=>route.abort('failed'));await page.goto('/tests/piAccounts.html');await expect(page.getByTestId('profile')).toContainText('Completed seller');await page.getByTestId('login').click();await expect(page.getByTestId('feedback')).toContainText('account server could not be reached');await expect(page.getByTestId('profile')).toContainText('seller');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smaj_pi_user')||'{}').uid)).toBe(original.uid);
});
test('confirmed server login returns the saved profile to the browser',async({page})=>{
 await setup(page,false);await page.route('**/user/signin',route=>route.fulfill({json:{user:original,session}}));await page.goto('/tests/piAccounts.html');await page.getByTestId('login').click();await expect(page.getByTestId('feedback')).toContainText('Signed in as pioneer');await expect(page.getByTestId('profile')).toContainText(original.uid);await expect(page.getByTestId('profile')).toContainText('Completed seller');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smaj_pi_user')||'{}').role)).toBe('seller');
});
