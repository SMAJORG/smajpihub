const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const vm=require('node:vm');
const code=transformSync(readFileSync(require.resolve('../src/lib/soloHostPiAuth.ts'),'utf8'),{loader:'ts',format:'cjs',define:{'import.meta.env.VITE_PI_OAUTH_CLIENT_ID':'""','import.meta.env.VITE_PI_OAUTH_REDIRECT_URI':'""'}}).code;
function setup(){
 const storage=new Map(),listeners={},popup={closed:false,close(){this.closed=true;}};let opened,signInOptions;
 const window={__ENV:{piOAuthClientId:'original-public-client',piOAuthRedirectUri:'https://smajpihub.com/signin/callback'},location:{origin:'https://smajpihub.com'},Pi:{signIn(options){signInOptions=options;return Promise.resolve();}},open(url){opened=new URL(url);return popup;},addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];},setTimeout,clearTimeout,setInterval,clearInterval};
 const loaded={exports:{}};vm.runInNewContext(code,{module:loaded,exports:loaded.exports,URL,URLSearchParams,crypto:require('node:crypto').webcrypto,window,sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},fetch:async()=>({ok:true,json:async()=>({uid:'verified-original-uid',username:'pioneer'})})});
 return {auth:loaded.exports.authenticateWithSoloHostPi,startSignIn:loaded.exports.startSoloHostPiSignIn,window,popup,listeners,get opened(){return opened;},get signInOptions(){return signInOptions;}};
}
test('external OAuth opens the SDK start route, validates callback and returns identity for existing backend signin',async()=>{
 const f=setup(),pending=f.auth();assert.equal(f.opened.origin,'https://smajpihub.com');assert.equal(f.opened.pathname,'/signin/start');
 const state=f.opened.searchParams.get('state');assert.match(state,/^[a-f\d]{64}$/i);
 await f.listeners.message({origin:'https://evil.example',source:f.popup,data:{source:'smaj-solohost-pi-oauth',accessToken:'ignored',state}});
 await f.listeners.message({origin:f.window.location.origin,source:f.popup,data:{source:'smaj-solohost-pi-oauth',accessToken:'test-token',state}});
 assert.equal((await pending).user.uid,'verified-original-uid');assert(f.popup.closed);
});
test('external OAuth uses Pi.signIn with the configured client, exact callback, supported scopes and state',async()=>{
 const f=setup(),state='a'.repeat(64);await f.startSignIn(state);
 assert.equal(f.signInOptions.clientId,'original-public-client');
 assert.equal(f.signInOptions.redirectUri,'https://smajpihub.com/signin/callback');
 assert.deepEqual(Array.from(f.signInOptions.scopes),['username','wallet_address']);
 assert.equal(f.signInOptions.state,state);
});
test('external OAuth rejects a forged state',async()=>{
 const f=setup(),pending=f.auth();const rejected=assert.rejects(pending,/state validation/);
 await f.listeners.message({origin:f.window.location.origin,source:f.popup,data:{source:'smaj-solohost-pi-oauth',accessToken:'forged',state:'wrong'}});await rejected;
});
