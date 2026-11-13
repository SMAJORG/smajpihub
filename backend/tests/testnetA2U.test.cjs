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
test('endpoint rejects missing auth and non-admin sessions',async()=>{
 const express=require('express'),{ObjectId}=require('mongodb');const {testnetA2UHandler}=require('../build/handlers/testnetA2U');
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{userId:new ObjectId().toString()}};next();});app.locals.userCollection={findOne:async()=>({uid:'buyer',role:'buyer'})};app.post('/payout',testnetA2UHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/payout`;
 try {assert.equal((await fetch(url,{method:'POST'})).status,401);assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer test'}})).status,403);}finally{await new Promise(r=>server.close(r));}
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
