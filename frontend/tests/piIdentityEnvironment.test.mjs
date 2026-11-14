import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../src/lib/piSdk.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm',define:{'import.meta.env.VITE_SANDBOX_SDK':'globalThis.__testPiBuild'}}).code;
const {isPiSandboxMode}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function mode(runtime,build,hostname,referrer){globalThis.window={__ENV:{sandbox:runtime},location:{hostname}};globalThis.document={referrer};globalThis.__testPiBuild=build;return isPiSandboxMode();}
test('original runtime and build mode selection is restored',()=>{
 assert.equal(mode('true','false','smajpihub.com',''),true);
 assert.equal(mode('false','true','smajpihub.com',''),false);
 assert.equal(mode('$$SANDBOX_SDK$$','true','smajpihub.com',''),true);
});
test('original Sandbox host and preview behavior is restored',()=>{
 assert.equal(mode('false','false','sandbox.minepi.com',''),true);
 assert.equal(mode('false','false','smajpihub.com','https://sandbox.minepi.com/'),true);
 assert.equal(mode(undefined,'false','smajpihub.com',''),false);
});
