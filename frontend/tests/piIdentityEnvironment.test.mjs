import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../src/lib/piSdk.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm',define:{'import.meta.env.VITE_SANDBOX_SDK':'globalThis.__testPiBuild','import.meta.env.MODE':'globalThis.__testPiMode'}}).code;
const {isPiSandboxMode}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function mode(runtime,build,hostname,referrer,embedded=false){globalThis.window={__ENV:{sandbox:runtime},location:{hostname}};window.self=window;window.top=embedded?{}:window;globalThis.document={referrer};globalThis.__testPiBuild=build;return isPiSandboxMode();}

test('production web and Android builds never enable Sandbox',()=>{
 for(const buildMode of ['public','capacitor']){globalThis.__testPiMode=buildMode;assert.equal(mode('true','true','localhost','https://sandbox.minepi.com/',true),false);}
 globalThis.__testPiMode=undefined;
});
test('Mainnet host ignores stale Sandbox runtime and build flags',()=>{
 assert.equal(mode('true','false','smajpihub.com',''),false);
 assert.equal(mode('false','true','smajpihub.com',''),false);
 assert.equal(mode('$$SANDBOX_SDK$$','true','smajpihub.com',''),false);
 assert.equal(mode('true','true','www.smajpihub.com',''),false);
 assert.equal(mode('false','false','smajpihub.com','https://sandbox.minepi.com.evil.example/'),false);
});
test('Testnet and local development keep their existing mode selection',()=>{
 assert.equal(mode('true','false','testnet.smajpihub.com',''),true);
 assert.equal(mode('false','true','testnet.smajpihub.com',''),false);
 assert.equal(mode(undefined,'true','localhost',''),true);
});
test('original Sandbox host and preview behavior is restored',()=>{
 assert.equal(mode('false','false','sandbox.minepi.com',''),true);
 assert.equal(mode('false','false','smajpihub.com','https://sandbox.minepi.com/',true),true);
 assert.equal(mode(undefined,'false','smajpihub.com',''),false);
});

test('returning to Mainnet from a Sandbox link does not initialize production login in Sandbox mode',()=>{
 assert.equal(mode('true','true','smajpihub.com','https://sandbox.minepi.com/'),false);
 assert.equal(mode('true','true','www.smajpihub.com','https://sandbox.minepi.com/'),false);
});

test('direct Pi Browser Testnet login ignores stale Sandbox settings and referrers',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Mozilla/5.0 PiBrowser'}});
 try {
  assert.equal(mode('true','true','testnet.smajpihub.com',''),false);
  assert.equal(mode('true','true','127.0.0.1',''),false);
  assert.equal(mode('true','true','testnet.smajpihub.com','https://sandbox.minepi.com/'),false);
  assert.equal(mode('true','true','testnet.smajpihub.com','https://sandbox.minepi.com/',true),true);
 } finally {
  if(previous) Object.defineProperty(globalThis,'navigator',previous);
  else delete globalThis.navigator;
 }
});
