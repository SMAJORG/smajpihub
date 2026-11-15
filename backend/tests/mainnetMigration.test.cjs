const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { commerceMode, commerceCollectionName, commerceDatabase } = require('../build/services/commerceEnvironment');
const { paymentOwnedBy } = require('../build/services/paymentIdentity');
const { createMemoryCollections } = require('../build/services/memoryDatabase');
const { completeStorePayment } = require('../build/services/storePayments');
const { platformAPIKeyClient } = require('../build/services/platformAPIClient');
const { buildWalletActivity } = require('../build/services/walletActivity');
const env = require('../build/environments').default;
const express = require('express');
const mountHistory = require('../build/handlers/testnetHistory').default;
const { buildAdminAnalytics } = require('../build/services/adminAnalytics');

const ready = () => ({ PI_COMMERCE_MODE: 'mainnet', PI_NETWORK: 'Pi Network', MAINNET_BACKUP_SHA256: 'a'.repeat(64), MAINNET_BACKUP_RESTORE_VERIFIED: 'true', PI_MAINNET_APP_ID: 'mainnet-app', PI_MAINNET_API_KEY: 'mainnet-secret-fixture', PI_API_KEY: 'old-testnet-fixture', PI_MAINNET_INCOMING_WALLET_APPROVED: 'true' });
test('cutover fails closed without backup, restore evidence, distinct credentials, correct network and wallet approval', () => {
  assert.equal(commerceMode(ready()), 'mainnet');
  for (const key of ['MAINNET_BACKUP_SHA256','MAINNET_BACKUP_RESTORE_VERIFIED','PI_MAINNET_APP_ID','PI_MAINNET_API_KEY','PI_MAINNET_INCOMING_WALLET_APPROVED']) {
    const settings=ready(); delete settings[key]; assert.throws(() => commerceMode(settings), key);
  }
  assert.throws(() => commerceMode({...ready(), PI_MAINNET_API_KEY:'old-testnet-fixture'}));
  assert.throws(() => commerceMode({...ready(), PI_NETWORK:'Pi Testnet'}));
  assert.throws(() => commerceMode({PI_NETWORK:'Pi Network'}));
  assert.throws(() => commerceMode({...ready(), PLATFORM_API_URL:'https://untrusted.invalid'}));
  assert.equal(commerceMode({...ready(), PI_PAYMENTS_ENABLED:'false', PI_MAINNET_INCOMING_WALLET_APPROVED:undefined}), 'mainnet');
});
test('same database shares original identity records while commerce and sessions have isolated namespaces', () => {
  const calls=[];
  const db={marker:7, collection(name,options){calls.push(name); return {name,options};}, admin(){return this.marker;}};
  for(const mode of ['mainnet','testnet-development']) {
    const scoped=commerceDatabase(db,mode);
    assert.equal(scoped.collection('users').name,'users');
    assert.equal(scoped.collection('pi_account_identity_links').name,'pi_account_identity_links');
    for(const collection of ['products','orders','pi_payments','job_billing','course_payments','university_payments','device_sessions','user_sessions']) assert.notEqual(scoped.collection(collection).name, collection);
    assert.equal(scoped.admin(),7);
  }
  assert.equal(commerceCollectionName('orders','mainnet'),'mainnet_orders');
  assert.equal(commerceCollectionName('orders','testnet-development'),'testnet_dev_orders');
  assert.equal(commerceCollectionName('orders','legacy'),'orders');
});
test('new Mainnet listings and orders never read or overwrite original Testnet records',async()=>{
  const tables=new Map();
  const db={collection(name){if(!tables.has(name)) tables.set(name,createMemoryCollections().userCollection);return tables.get(name);}};
  await db.collection('products').insertOne({title:'Original Testnet product',pricePi:20});
  await db.collection('orders').insertOne({status:'paid',pricePi:20});
  const mainnet=commerceDatabase(db,'mainnet'),development=commerceDatabase(db,'testnet-development');
  assert.equal(await mainnet.collection('products').countDocuments({}),0);
  assert.equal(await mainnet.collection('orders').countDocuments({}),0);
  await mainnet.collection('products').insertOne({title:'Fresh Mainnet product',pricePi:1});
  await development.collection('orders').insertOne({status:'pending'});
  assert.equal((await db.collection('products').findOne({})).pricePi,20);
  assert.equal((await db.collection('orders').findOne({})).status,'paid');
  assert.equal(await mainnet.collection('orders').countDocuments({}),0);
});
async function fixture(run) {
  const locals = createMemoryCollections();
  const user={_id:new ObjectId(),uid:'original-testnet',username:'shared-name',role:'seller',sellerActive:true,createdAt:new Date('2025-01-01')};
  await locals.userCollection.insertOne(user);
  locals.piIdentityLinkCollection=createMemoryCollections().userCollection;
  await locals.piIdentityLinkCollection.insertOne({_id:'verified-mainnet',canonicalUid:user.uid,canonicalUserId:String(user._id),status:'verified',proofMethod:'dual_pi_me',verifiedAt:new Date()});
  locals.piNetwork='Pi Network';locals.memoryDatabase=true;
  await run(locals,user);
}
test('payment ownership accepts dual-proven identities and rejects same-name strangers and unverified bindings',()=>fixture(async(locals,user)=>{
  assert.equal(await paymentOwnedBy(locals,'verified-mainnet',user.uid),true);
  await locals.userCollection.insertOne({uid:'stranger',username:'shared-name'});
  assert.equal(await paymentOwnedBy(locals,'stranger',user.uid),false);
  await locals.piIdentityLinkCollection.insertOne({_id:'pending',canonicalUid:user.uid,canonicalUserId:String(user._id),status:'approved',proofMethod:'username'});
  assert.equal(await paymentOwnedBy(locals,'pending',user.uid),false);
  await locals.userCollection.updateOne({uid:user.uid},{$set:{blocked:true}});
  assert.equal(await paymentOwnedBy(locals,'verified-mainnet',user.uid),false);
}));
test('Mainnet payment credits original order and preserves actual Pi payer UID in the ledger; cross-network payment is rejected',()=>fixture(async(locals,user)=>{
  const previousNetwork=env.pi_network;env.pi_network='Pi Network';
  const previousAdapter=platformAPIKeyClient.defaults.adapter;
  const order={_id:new ObjectId(),buyerId:user.uid,sellerId:'seller',pricePi:1,status:'pending',paymentStatus:'pending'};
  await locals.marketplaceOrderCollection.insertOne(order);
  let payment={identifier:'payment-mainnet',network:'Pi Network',user_uid:'verified-mainnet',direction:'user_to_app',amount:1,metadata:{orderId:String(order._id)},status:{developer_completed:true,transaction_verified:true},transaction:{verified:true,txid:'a'.repeat(64)}};
  platformAPIKeyClient.defaults.adapter=async config=>({config,status:200,statusText:'OK',headers:{},data:payment});
  try {
    const input={orderId:String(order._id),paymentId:payment.identifier,txid:payment.transaction.txid};
    payment.network='Pi Testnet';assert.equal((await completeStorePayment({locals},user.uid,input)).status,400);
    payment.network='Pi Network';payment.user_uid='stranger';assert.equal((await completeStorePayment({locals},user.uid,input)).status,400);
    payment.user_uid='verified-mainnet';assert.equal((await completeStorePayment({locals},user.uid,input)).status,200);
    assert.equal((await locals.marketplaceOrderCollection.findOne({_id:order._id})).buyerId,user.uid);
    const receipt=await locals.paymentCollection.findOne({_id:'payment:Pi Network:payment-mainnet'});
    assert.equal(receipt.payerUid,'verified-mainnet');assert.equal(receipt.accountUid,user.uid);
    const activity=await buildWalletActivity(locals,user,{network:'mainnet'});
    assert.ok(activity.items.some(item=>item.verified && item.paymentId==='payment-mainnet'));
    locals.commerceMode='mainnet';
    const now=Date.now(), range={from:now-3600000,to:now+1000,previousFrom:now-7200000,timezone:'UTC',live:false,step:60000};
    const analytics=await buildAdminAnalytics(locals,range,now);
    assert.equal(analytics.kpis.piVolume,1);assert.equal(analytics.kpis.successfulPayments,1);
    assert.match(analytics.definitions.financial,/Mainnet only/);
    assert.equal((await locals.userCollection.find({}).toArray()).length,1);
  } finally { env.pi_network=previousNetwork;platformAPIKeyClient.defaults.adapter=previousAdapter; }
}));
test('Testnet history is authenticated, scoped, redacted and read-only even with forged account or collection parameters',()=>fixture(async(locals,user)=>{
  const history=createMemoryCollections().marketplaceOrderCollection;
  await history.insertOne({buyerId:user.uid,productTitle:'Original order',status:'paid',privateAddress:'Never expose'});
  await history.insertOne({buyerId:'other-user',productTitle:'Other order'});
  locals.testnetHistoryDb={collection(name){assert.equal(name,'orders');return{find(query,options){const cursor=history.find(query).project(options.projection);cursor.maxTimeMS=()=>cursor;return cursor;}};}};
  const app=express();Object.assign(app.locals,locals);
  app.use((req,res,next)=>{req.session={cookie:{},user:req.get('x-fixture-user')==='owner'?{userId:String(user._id)}:undefined};next();});
  const router=express.Router();mountHistory(router);app.use('/history/testnet',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/history/testnet`;
  try{
    assert.equal((await fetch(base+'/orders')).status,401);
    const response=await fetch(base+'/orders?uid=other-user',{headers:{'x-fixture-user':'owner'}});
    assert.match(response.headers.get('cache-control'),/no-store/);
    const body=await response.json();assert.equal(body.readOnly,true);assert.equal(body.network,'Pi Testnet');assert.equal(body.records.length,1);assert.equal(body.records[0].productTitle,'Original order');assert.equal(body.records[0].privateAddress,undefined);
    assert.equal((await fetch(base+'/orders',{method:'DELETE',headers:{'x-fixture-user':'owner'}})).status,405);
    assert.equal((await fetch(base+'/users',{headers:{'x-fixture-user':'owner'}})).status,404);
    assert.equal((await fetch(base+'/orders?offset=-1',{headers:{'x-fixture-user':'owner'}})).status,400);
    assert.equal(await history.countDocuments({}),2);
  }finally{await new Promise(resolve=>server.close(resolve));}
}));
test('Mainnet Stream checkout preserves Testnet subscription history and cannot reuse an old checkout receipt',()=>fixture(async(locals,user)=>{
  const settings=ready(),saved=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
  Object.assign(process.env,settings);
  const previousNetwork=env.pi_network;env.pi_network='Pi Network';
  const previousAdapter=platformAPIKeyClient.defaults.adapter;
  const historical={plan:'family',status:'active',paymentStatus:'paid',paymentId:'testnet-old-receipt',pricePi:7};
  await locals.userCollection.updateOne({_id:user._id},{$set:{streamSubscription:historical}});
  let payment;
  platformAPIKeyClient.defaults.adapter=async config=>{
    if(config.method==='post' && config.url.endsWith('/complete')) payment.status={developer_completed:true,transaction_verified:true};
    return {config,status:200,statusText:'OK',headers:{},data:payment};
  };
  const app=express();Object.assign(app.locals,locals);app.use(express.json());
  app.use((req,res,next)=>{req.session={cookie:{},user:{userId:String(user._id)}};next();});
  const router=express.Router();require('../build/handlers/stream').default(router);app.use('/stream',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const post=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/stream${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
  try{
    const created=await post('/subscription/checkout',{plan:'plus'});assert.equal(created.status,201);
    const checkout=created.body.checkout;assert.ok(checkout.id);
    payment={identifier:'stream-mainnet',network:'Pi Network',direction:'user_to_app',user_uid:'verified-mainnet',amount:checkout.amountPi,metadata:{service:'stream',plan:'plus',checkoutId:checkout.id},status:{},transaction:{verified:true,txid:'b'.repeat(64)}};
    assert.equal((await post('/subscription/payment/approve',{plan:'plus',paymentId:payment.identifier})).status,200);
    assert.equal((await post('/subscription/payment/complete',{plan:'plus',paymentId:payment.identifier,txid:payment.transaction.txid})).status,200);
    const stored=await locals.userCollection.findOne({_id:user._id});assert.deepEqual(stored.streamSubscription,historical);assert.equal(stored.mainnetStreamSubscription.paymentStatus,'paid');
    await post('/subscription/checkout',{plan:'plus'});
    assert.equal((await post('/subscription/payment/approve',{plan:'plus',paymentId:payment.identifier})).status,409);
  } finally {
    await new Promise(resolve=>server.close(resolve));env.pi_network=previousNetwork;platformAPIKeyClient.defaults.adapter=previousAdapter;
    for(const [key,value] of Object.entries(saved)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}));
