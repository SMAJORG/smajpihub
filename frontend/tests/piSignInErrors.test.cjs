const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const compiled=transformSync(readFileSync(require.resolve('../src/lib/piSignInErrors.ts'),'utf8'),{loader:'ts',format:'cjs'}).code;
const loaded={exports:{}};vm.runInNewContext(compiled,{module:loaded,exports:loaded.exports,require});
const {piSignInErrorMessage:message,PiSignInResponseError}=loaded.exports;
test('backend failures retain their real cause and request reference',()=>{
 const result=message({isAxiosError:true,response:{status:503,data:{message:'The account server could not save your login session.',requestId:'11111111-2222-3333-4444-555555555555'}}});
 assert(result.includes('could not save your login session'));assert(result.includes('11111111-2222-3333-4444-555555555555'));assert(!result.includes('Browser'));
});
test('identity conflict is not rewritten into an expired token or browser failure',()=>{
 const supplied='Pi authentication succeeded, but the account server could not match this identity.';
 assert.equal(message({isAxiosError:true,response:{status:409,data:{message:supplied}}}),supplied);
});
test('network, server and malformed success responses are distinguished',()=>{
 assert(message({isAxiosError:true}).includes('account server could not be reached'));
 assert(message({isAxiosError:true,response:{status:500,data:{}}}).includes('account server is temporarily'));
 assert.equal(message(new PiSignInResponseError('The account server did not return a confirmed account.')),'The account server did not return a confirmed account.');
});
