import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../src/lib/capacitorPiAuth.ts',import.meta.url),'utf8').replace(/^import .* from "@capacitor\/[^"\n]+";\r?\n/gm,'const {App,AppLauncher,Capacitor,Preferences}=globalThis.__nativeFixture;\n');
// Remove repeated mock declarations introduced by replacing individual imports.
const cleaned=source.replace(/const \{App,AppLauncher,Capacitor,Preferences\}=globalThis\.__nativeFixture;\n/g,'');
let listener,launched,state;
globalThis.window={setTimeout,clearTimeout};
globalThis.__nativeFixture={App:{addListener:async(_,fn)=>{listener=fn;return{remove:async()=>{}};}},AppLauncher:{canOpenUrl:async()=>({value:true}),openUrl:async({url})=>{launched=url;return{completed:true};}},Capacitor:{isNativePlatform:()=>true},Preferences:{set:async({value})=>{state=value;},get:async()=>({value:state}),remove:async()=>{state=null;}}};
const compiled=transformSync('const {App,AppLauncher,Capacitor,Preferences}=globalThis.__nativeFixture;\n'+cleaned,{loader:'ts',format:'esm'}).code;
const {authenticateWithCapacitorPi}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('Android opens Mainnet bridge and accepts only the exact callback with the saved random state',async()=>{
 const oldFetch=globalThis.fetch;let fetched=0;globalThis.fetch=async()=>{fetched++;return{ok:true,json:async()=>({uid:'mainnet',username:'pioneer'})};};
 try{
  const pending=authenticateWithCapacitorPi();await new Promise(r=>setTimeout(r,20));
  assert.equal(new URL(launched).searchParams.get('sandbox'),'0');assert.match(state,/^[a-f0-9]{64}$/);
  listener({url:`smajpihub://oauth/pi-evil#access_token=proof&state=${state}`});await new Promise(r=>setTimeout(r,10));assert.equal(fetched,0);
  listener({url:`smajpihub://oauth/pi#access_token=proof&state=${state}`});assert.equal((await pending).user.uid,'mainnet');assert.equal(fetched,1);assert.equal(state,null);
  const invalid=authenticateWithCapacitorPi();await new Promise(r=>setTimeout(r,20));listener({url:'smajpihub://oauth/pi#access_token=proof&state=wrong'});await assert.rejects(invalid,/state validation failed/);assert.equal(fetched,1);
 }finally{globalThis.fetch=oldFetch;}
});
