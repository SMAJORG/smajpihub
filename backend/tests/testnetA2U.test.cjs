const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendTestnetPayout, makeTestnetSdk } = require('../build/services/testnetA2U');
class Store {
  rows = new Map();
  async findOne(q) { return this.rows.get(q._id) || null; }
  async insertOne(d) { if (this.rows.has(d._id)) throw Object.assign(new Error(), { code: 11000 }); this.rows.set(d._id, {...d}); }
  async updateOne(q,u) { const d=this.rows.get(q._id); if (!d) return {matchedCount:0}; Object.assign(d,u.$set); return {matchedCount:1}; }
  async deleteOne(q) { this.rows.delete(q._id); }
}
function sdk(overrides={}) {
  const calls=[];
  const payment={identifier:'p1',network:'Pi Testnet',direction:'app_to_user',user_uid:'user',amount:0.01,to_address:'G'+'A'.repeat(55),status:{},transaction:null};
  return {calls,payment, createPayment:async args=>{calls.push('create');assert.equal(args.amount,0.01);return 'p1';},getPayment:async()=>payment,
    submitPayment:async()=>{calls.push('submit');return 'tx1';},completePayment:async()=>{calls.push('complete');return {...payment,status:{transaction_verified:true,developer_completed:true},transaction:{txid:'tx1',verified:true}};},...overrides};
}
test('persists IDs, wallet and completion; repeat does not send again',async()=>{
 const db=new Store(), pi=sdk(); const row=await sendTestnetPayout(db,'user','admin',pi);
 assert.equal(row.txid,'tx1');assert.equal(row.paymentId,'p1');assert.equal(row.recipientWalletAddress,pi.payment.to_address);assert.equal(row.status,'completed');
 await sendTestnetPayout(db,'user','admin',pi);assert.deepEqual(pi.calls,['create','submit','complete']);
});
test('rejects Mainnet before blockchain submission',async()=>{
 const db=new Store(),pi=sdk();pi.payment.network='Pi Network';
 await assert.rejects(sendTestnetPayout(db,'user','admin',pi));assert.deepEqual(pi.calls,['create']);assert.equal(db.rows.get('recipient:user').status,'reconciliation_required');
});
test('ambiguous submission is never retried and blocks wallet',async()=>{
 const db=new Store(),pi=sdk({submitPayment:async()=>{throw new Error('timeout with secret');}});
 await assert.rejects(sendTestnetPayout(db,'user','admin',pi),e=>!e.message.includes('secret'));
 await assert.rejects(sendTestnetPayout(db,'user','admin',pi));await assert.rejects(sendTestnetPayout(db,'other','admin',pi));assert.deepEqual(pi.calls,['create']);
});
test('concurrent requests cannot double pay',async()=>{
 const db=new Store(),pi=sdk();const results=await Promise.allSettled([sendTestnetPayout(db,'user','admin',pi),sendTestnetPayout(db,'user','admin',pi)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(pi.calls.filter(x=>x==='submit').length,1);
});
test('DB failure before submit prevents transfer',async()=>{
 const db=new Store(),pi=sdk();db.updateOne=async()=>{throw new Error('DB unavailable');};await assert.rejects(sendTestnetPayout(db,'user','admin',pi));assert.deepEqual(pi.calls,['create']);
});
test('unverified completion preserves txid and requires reconciliation',async()=>{
 const db=new Store(),pi=sdk({completePayment:async()=>{throw new Error('timeout');}});await assert.rejects(sendTestnetPayout(db,'user','admin',pi));assert.equal(db.rows.get('recipient:user').txid,'tx1');assert.equal(db.rows.get('recipient:user').status,'reconciliation_required');
});
test('credentials missing fails closed',()=>{
 const old=process.env.PI_TESTNET_API_KEY;delete process.env.PI_TESTNET_API_KEY;
 try {assert.throws(makeTestnetSdk,/not configured/);}finally{if(old)process.env.PI_TESTNET_API_KEY=old;}
});
test('endpoint validates bearer independently of admin cookies and rejects non-admin Hub tokens',async()=>{
 const express=require('express'),{ObjectId}=require('mongodb');const {testnetA2UHandler,testnetA2UPreflightHandler}=require('../build/handlers/testnetA2U');
 const {createHmac}=require('crypto'),env=require('../build/environments').default;
 const body=Buffer.from(JSON.stringify({uid:'buyer',deviceId:'a'.repeat(64),exp:Math.floor(Date.now()/1000)+120})).toString('base64url');
 const signed='hub_access.'+body+'.'+createHmac('sha256',env.session_secret).update('hub-access:'+body).digest('base64url');
 let role='admin';
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{userId:new ObjectId().toString()}};next();});
 app.locals.userCollection={findOne:async()=>({_id:new ObjectId(),uid:'buyer',role})};app.locals.deviceSessionCollection={findOne:async()=>({active:true})};
 app.post('/payout',testnetA2UHandler);app.get('/preflight',testnetA2UPreflightHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 try {
  for(const token of ['', 'invalid', 'hub_access.invalid.signature']) {
   const headers=token?{Authorization:'Bearer '+token}:{};
   assert.equal((await fetch(url+'/payout',{method:'POST',headers})).status,401);
   assert.equal((await fetch(url+'/preflight',{headers})).status,401);
  }
  role='buyer';assert.equal((await fetch(url+'/payout',{method:'POST',headers:{Authorization:'Bearer '+signed}})).status,403);
  role='admin';assert.equal((await fetch(url+'/payout',{method:'POST',headers:{Authorization:'Bearer '+signed}})).status,400);
  app.locals.deviceSessionCollection.findOne=async()=>null;
  assert.equal((await fetch(url+'/preflight',{headers:{Authorization:'Bearer '+signed}})).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
test('rejects mismatched recipient, amount, direction and cancellation before submit',async()=>{
 for (const change of [{user_uid:'other'},{amount:1},{direction:'user_to_app'},{to_address:'invalid'},{status:{cancelled:true}}]) {
  const db=new Store(),pi=sdk();Object.assign(pi.payment,change);await assert.rejects(sendTestnetPayout(db,'user','admin',pi));assert.deepEqual(pi.calls,['create']);
 }
});
test('completion flags alone cannot substitute for the submitted transaction',async()=>{
 const db=new Store(),pi=sdk();pi.completePayment=async()=>({...pi.payment,status:{transaction_verified:true,developer_completed:true},transaction:{txid:'different',verified:true}});
 await assert.rejects(sendTestnetPayout(db,'user','admin',pi));assert.equal(db.rows.get('recipient:user').status,'reconciliation_required');
});
test('read-only preflight verifies credentials, funding, consent and UID without a payment',async()=>{
 const axios=require('axios'),{Keypair}=require('stellar-sdk');
 const {testnetA2UPreflight}=require('../build/services/testnetA2UPreflight');
 const oldGet=axios.get,oldKey=process.env.PI_TESTNET_API_KEY,oldSeed=process.env.PI_TESTNET_WALLET_SEED;
 const sender=Keypair.random(),recipient=Keypair.random().publicKey();
 process.env.PI_TESTNET_API_KEY='test-only-key';process.env.PI_TESTNET_WALLET_SEED=sender.secret();
 let wallet=recipient,uid='recipient',balance='5',pending=[],calls=[];
 const locals={userCollection:{findOne:async()=>({uid:'recipient',accessToken:'test-only-token'})},testnetA2UCollection:{findOne:async()=>null}};
 axios.get=async(url,config)=>{
  calls.push(url);
  if(url.endsWith('/v2/me')) return {data:{uid,wallet_address:wallet}};
  if(url.endsWith('/incomplete_server_payments')) return {data:{incomplete_server_payments:pending}};
  if(url.includes('/ledgers?')) return {data:{_embedded:{records:[{base_reserve_in_stroops:5000000,base_fee_in_stroops:100000}]}}};
  return {data:{balances:[{asset_type:'native',balance}],subentry_count:0}};
 };
 try {
  const result=await testnetA2UPreflight(locals,'recipient');assert.equal(result.checksPassed,true);assert.equal(result.paymentSent,false);assert.equal(result.senderWalletAddress,sender.publicKey());
  assert(!JSON.stringify(result).includes(sender.secret()));assert(!JSON.stringify(result).includes('test-only-key'));
  wallet='';await assert.rejects(testnetA2UPreflight(locals,'recipient'),/wallet_address/);
  wallet=recipient;uid='forged';await assert.rejects(testnetA2UPreflight(locals,'recipient'),/fresh verified/);
  uid='recipient';balance='1';await assert.rejects(testnetA2UPreflight(locals,'recipient'),/spendable/);
  balance='5';pending=[{}];await assert.rejects(testnetA2UPreflight(locals,'recipient'),/incomplete/);
  pending=[];locals.testnetA2UCollection.findOne=async()=>({status:'reconciliation_required'});await assert.rejects(testnetA2UPreflight(locals,'recipient'),/locked/);
  assert(calls.every(url=>!url.endsWith('/v2/payments')));
 } finally {
  axios.get=oldGet;for(const [name,value] of [['PI_TESTNET_API_KEY',oldKey],['PI_TESTNET_WALLET_SEED',oldSeed]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});
