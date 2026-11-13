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
 const express=require('express'),{ObjectId}=require('mongodb');const {testnetA2UHandler,testnetA2UPreflightHandler,testnetDashboardHandler,testnetRecipientsHandler}=require('../build/handlers/testnetA2U');
 const {createHmac}=require('crypto'),env=require('../build/environments').default;
 const body=Buffer.from(JSON.stringify({uid:'buyer',deviceId:'a'.repeat(64),exp:Math.floor(Date.now()/1000)+120})).toString('base64url');
 const signed='hub_access.'+body+'.'+createHmac('sha256',env.session_secret).update('hub-access:'+body).digest('base64url');
 let role='admin';
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{userId:new ObjectId().toString()}};next();});
 app.locals.userCollection={findOne:async()=>({_id:new ObjectId(),uid:'buyer',role})};app.locals.deviceSessionCollection={findOne:async()=>({active:true})};
 app.post('/payout',testnetA2UHandler);app.get('/preflight',testnetA2UPreflightHandler);app.get('/dashboard',testnetDashboardHandler);app.get('/recipients',testnetRecipientsHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 try {
  for(const token of ['', 'invalid', 'hub_access.invalid.signature']) {
   const headers=token?{Authorization:'Bearer '+token}:{};
   assert.equal((await fetch(url+'/payout',{method:'POST',headers})).status,401);
   for(const path of ['/preflight','/dashboard','/recipients']) assert.equal((await fetch(url+path,{headers})).status,401);
  }
  role='buyer';assert.equal((await fetch(url+'/payout',{method:'POST',headers:{Authorization:'Bearer '+signed}})).status,403);for(const path of ['/dashboard','/recipients','/preflight']) assert.equal((await fetch(url+path,{headers:{Authorization:'Bearer '+signed}})).status,403);
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
test('same wallet cannot receive again through a different UID',async()=>{
 const db=new Store(),first=sdk();await sendTestnetPayout(db,'user','admin',first);
 const second=sdk();second.payment.user_uid='second-user';await assert.rejects(sendTestnetPayout(db,'second-user','admin',second));
 assert.deepEqual(second.calls,['create']);assert.equal(db.rows.get('recipient:second-user').status,'reconciliation_required');
});
test('dashboard reports verified unique-wallet progress and restricts payment fields',async()=>{
 const {testnetDashboard}=require('../build/services/testnetA2UDashboard');const old=process.env.PI_TESTNET_API_KEY;delete process.env.PI_TESTNET_API_KEY;let projection;
 const cursor={project(fields){projection=fields;return this;},sort(){return this;},skip(){return this;},limit(){return this;},toArray:async()=>[]};
 const collection={find:()=>cursor,countDocuments:async()=>0,findOne:async()=>null,distinct:async(field,filter)=>{assert.equal(field,'recipientWalletAddress');assert.equal(filter.status,'completed');assert.equal(filter['piStatus.transaction_verified'],true);assert.equal(filter['piStatus.developer_completed'],true);assert.equal(filter.network,'Pi Testnet');return ['wallet1','wallet2'];}};
 try{const result=await testnetDashboard({testnetA2UCollection:collection},1);assert.equal(result.successfulUniqueWallets,2);assert.equal(result.target,5);assert.equal(result.wallet.ready,false);assert(!('accessToken' in projection));assert(!('adminUid' in projection));assert.equal(projection.txid,1);}finally{if(old)process.env.PI_TESTNET_API_KEY=old;}
});
test('eligible list freshly verifies UID and wallet consent and never returns tokens',async()=>{
 const {testnetRecipients}=require('../build/services/testnetA2UDashboard');const axios=require('axios'),old=axios.get;
 const users=[{uid:'eligible',username:'alice',accessToken:'secret-alice'},{uid:'no-consent',username:'bob',accessToken:'secret-bob'},{uid:'paid',username:'carol',accessToken:'secret-carol'},{uid:'forged',username:'eve',accessToken:'secret-eve'}];
 const cursor={project(){return this;},sort(){return this;},skip(){return this;},limit(){return this;},toArray:async()=>users};
 const locals={userCollection:{find:()=>cursor},testnetA2UCollection:{findOne:async q=>q._id==='recipient:paid'?{status:'completed'}:null}};
 axios.get=async(_url,config)=>{const user=users.find(u=>config.headers.Authorization.endsWith(u.accessToken));return {data:{uid:user.uid==='forged'?'mismatch':user.uid,wallet_address:user.uid==='no-consent'?'':'G'+'A'.repeat(55)}};};
 try{const result=await testnetRecipients(locals,1,'');assert.deepEqual(result.recipients.map(r=>r.uid),['eligible','paid']);assert.equal(result.recipients[0].canReceive,true);assert.equal(result.recipients[1].canReceive,false);assert(!JSON.stringify(result).includes('secret-'));assert(!JSON.stringify(result).includes('accessToken'));}finally{axios.get=old;}
});
test('changed wallet after confirmation cannot be submitted',async()=>{
 const db=new Store(),pi=sdk();await assert.rejects(sendTestnetPayout(db,'user','admin',pi,{recipientWalletAddress:'G'+'B'.repeat(55)}));assert.deepEqual(pi.calls,['create']);
});
test('saved server-verified identity survives OAuth expiry, but spoofed or revoked consent does not',async()=>{
 const {reviewPiRecipient,verifiedPiIdentityFields}=require('../build/services/piRecipientIdentity');const axios=require('axios'),old=axios.get;
 const wallet='G'+'A'.repeat(55),saved={uid:'user',accessToken:'expired-test-token',...verifiedPiIdentityFields({uid:'user',wallet_address:wallet})};
 axios.get=async()=>{throw Object.assign(new Error('expired'),{isAxiosError:true,response:{status:401}});};
 try{assert.equal((await reviewPiRecipient(saved)).recipient.walletAddress,wallet);assert.equal((await reviewPiRecipient({uid:'user',accessToken:'expired-test-token',wallet_address:wallet})).reason,'pi_login_expired');
 axios.get=async()=>({data:{uid:'user'}});assert.equal((await reviewPiRecipient(saved)).reason,'wallet_consent_required');
 axios.get=async()=>{throw Object.assign(new Error('denied'),{isAxiosError:true,response:{status:403}});};assert.equal((await reviewPiRecipient(saved)).recipient,null);
 }finally{axios.get=old;}
});
test('Sandbox CORS allowance is scoped to Testnet/admin identity routes and requires configuration',()=>{
 const {allowsTestnetSandboxOrigin:allow}=require('../build/services/testnetCors');
 assert(allow('/admin/testnet/a2u/dashboard','https://sandbox.minepi.com',true));assert(allow('/user/signin','https://sandbox.minepi.com',true));
 assert(!allow('/user/profile','https://sandbox.minepi.com',true));assert(!allow('/payments/complete','https://sandbox.minepi.com',true));assert(!allow('/admin/orders','https://sandbox.minepi.com',true));assert(!allow('/admin/testnet/a2u','https://evil.example',true));assert(!allow('/admin/testnet/a2u','https://sandbox.minepi.com',false));
});
test('real HTTP login → admin Hub session → @username/UID/wallet search → readiness; no payment endpoints called',async()=>{
 const express=require('express'),session=require('express-session'),axios=require('axios'),{Keypair}=require('stellar-sdk');
 const env=require('../build/environments').default,{createMemoryCollections}=require('../build/services/memoryDatabase');
 const mountAdmin=require('../build/handlers/admin').default,{handleSignIn}=require('../build/handlers/users');
 const oldAdapter=axios.defaults.adapter,oldAdmins=env.admin_pi_usernames,oldKey=process.env.PI_TESTNET_API_KEY,oldSeed=process.env.PI_TESTNET_WALLET_SEED;
 const sender=Keypair.random(),recipient=Keypair.random().publicKey();let recipientStatus=200,externalPosts=0;
 process.env.PI_TESTNET_API_KEY='integration-app-key';process.env.PI_TESTNET_WALLET_SEED=sender.secret();env.admin_pi_usernames=['integration-admin'];
 axios.defaults.adapter=async config=>{
  if(String(config.method).toLowerCase()!=='get'){externalPosts++;throw new Error('Test forbids external mutations');}
  const path=String(config.url);
  let data;
  if(path.endsWith('/v2/me')){const admin=String(config.headers.Authorization).includes('admin-pi-token');if(!admin&&recipientStatus!==200)throw Object.assign(new Error('Pi identity unavailable'),{isAxiosError:true,response:{status:recipientStatus},config});data=admin?{uid:'admin-uid',username:'integration-admin',wallet_address:sender.publicKey()}:{uid:'alice-uid',username:'alice.name',wallet_address:recipient};}
  else if(path.endsWith('/incomplete_server_payments'))data={incomplete_server_payments:[]};
  else if(path.includes('/ledgers?'))data={_embedded:{records:[{base_reserve_in_stroops:4900000,base_fee_in_stroops:100000}]}};
  else if(path.includes('/accounts/'))data={balances:[{asset_type:'native',balance:'5'}],subentry_count:0};else throw new Error('Unexpected read');
  return {status:200,statusText:'OK',data,headers:{},config};
 };
 const tables=createMemoryCollections(),payouts=createMemoryCollections().userCollection;payouts.distinct=async()=>[];
 const app=express();app.use(express.json());app.use(session({secret:'integration-session-only',resave:false,saveUninitialized:true}));app.locals.userCollection=tables.userCollection;app.locals.deviceSessionCollection=tables.deviceSessionCollection;app.locals.testnetA2UCollection=payouts;
 app.post('/user/signin',handleSignIn);const router=express.Router();mountAdmin(router);app.use('/admin',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const login=async(uid,username,token)=>{const r=await fetch(base+'/user/signin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authResult:{accessToken:token,user:{uid,username,wallet_address:'client-spoofed-address'}}})});assert.equal(r.status,200);return r.json();};
  const admin=await login('admin-uid','integration-admin','admin-pi-token'),user=await login('alice-uid','alice.name','recipient-pi-token');
  assert.equal(admin.user.role,'admin');const stored=await tables.userCollection.findOne({uid:'alice-uid'});assert.equal(stored.piWalletAddress,recipient);assert.equal(stored.piVerifiedUid,'alice-uid');
  const headers={Authorization:'Bearer '+admin.session.accessToken};
  for(const search of ['@alice.name','alice-uid',recipient]){const r=await fetch(base+'/admin/testnet/a2u/recipients?search='+encodeURIComponent(search),{headers});assert.equal(r.status,200);const body=await r.json();assert.equal(body.recipients[0].uid,'alice-uid');assert(!JSON.stringify(body).includes('recipient-pi-token'));}
  const dashboard=await fetch(base+'/admin/testnet/a2u/dashboard',{headers});assert.equal(dashboard.status,200);const snapshot=await dashboard.json();assert.equal(snapshot.wallet.ready,true);assert.equal(snapshot.wallet.apiStatus,200);
  const preflight=await fetch(base+'/admin/testnet/a2u/preflight?uid=alice-uid',{headers});assert.equal(preflight.status,200);assert.equal((await preflight.json()).checksPassed,true);
  const denied=await fetch(base+'/admin/testnet/a2u/dashboard',{headers:{Authorization:'Bearer '+user.session.accessToken}});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'admin_required');
  recipientStatus=401;const expired=await fetch(base+'/admin/testnet/a2u/recipients?search=alice-uid',{headers});assert.equal((await expired.json()).recipients[0].uid,'alice-uid');
  recipientStatus=403;const revoked=await fetch(base+'/admin/testnet/a2u/recipients?search=alice-uid',{headers});const revokedBody=await revoked.json();assert.equal(revokedBody.recipients.length,0);assert.equal(revokedBody.diagnostics.pi_permission_denied,1);assert.equal((await tables.userCollection.findOne({uid:'alice-uid'})).piWalletVerifiedAt,null);
  assert.equal(externalPosts,0);
 }finally{
  await new Promise(r=>server.close(r));axios.defaults.adapter=oldAdapter;env.admin_pi_usernames=oldAdmins;
  for(const [name,value]of[['PI_TESTNET_API_KEY',oldKey],['PI_TESTNET_WALLET_SEED',oldSeed]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});

test('Sandbox identity cannot exchange cookie-only sessions for credentials',async()=>{
 const {guardTestnetSandboxIdentity:guard}=require('../build/services/testnetCors');const old=process.env.PI_TESTNET_API_KEY;process.env.PI_TESTNET_API_KEY='test-only';
 try{for(const path of ['/user','/user/refresh','/user/signout']){let status=0,passed=false;const req={path,method:path==='/user'?'GET':'POST',get:name=>name==='origin'?'https://sandbox.minepi.com':undefined,session:{user:{role:'admin'}}};const res={status(code){status=code;return this;},json(){}};await guard(req,res,()=>{passed=true;});assert.equal(status,401);assert.equal(passed,false);}}finally{if(old===undefined)delete process.env.PI_TESTNET_API_KEY;else process.env.PI_TESTNET_API_KEY=old;}
});
