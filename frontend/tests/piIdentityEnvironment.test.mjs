import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../src/lib/piSdk.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm'}).code;
const {resolvePiSandboxMode:mode}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('explicit Mainnet mode is not overridden by previous Sandbox referrer',()=>{
 assert.equal(mode('false','true','smajpihub.com','https://sandbox.minepi.com/'),false);
 assert.equal(mode(undefined,'false','smajpihub.com','https://sandbox.minepi.com/'),false);
});
test('Testnet and runtime overrides remain explicit and separate',()=>{
 assert.equal(mode('true','false','smajpihub.com',''),true);
 assert.equal(mode('$$SANDBOX_SDK$$','true','smajpihub.com',''),true);
 assert.equal(mode(false,'true','smajpihub.com',''),false);
});
test('unconfigured fallback matches exact Sandbox host, never a substring',()=>{
 assert.equal(mode(undefined,undefined,'sandbox.minepi.com',''),true);
 assert.equal(mode(undefined,undefined,'smajpihub.com','https://sandbox.minepi.com.evil.example'),false);
 assert.equal(mode(undefined,undefined,'smajpihub.com','https://example.com/?sandbox.minepi.com'),false);
 assert.equal(mode(undefined,undefined,'smajpihub.com',''),false);
});
