const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),session=require('express-session'),axios=require('axios');
const {createMemoryCollections}=require('../build/services/memoryDatabase');
const mountLinks=require('../build/handlers/piIdentityLinks').default;
const {handleSignIn}=require('../build/handlers/users');
const {resolveLinkedPiAccount}=require('../build/services/piIdentityLinks');
const {resolveHubAccessUser,refreshPersistentSession}=require('../build/services/persistentSessions');
async function fixture(run,role='seller'){
 const tables=createMemoryCollections(),users=tables.userCollection,links=createMemoryCollections().userCollection,challenges=createMemoryCollections().userCollection;
 const primary={uid:'testnet-original',username:'old-name',piUsername:'old-name',role,roles:[role,'moderator'],sellerActive:true,displayName:'Original profile',country:'NG',bio:'Saved bio',settings:{theme:'dark'},createdAt:new Date('2025-01-01'),accessToken:'original-payment-token',piVerifiedUid:'testnet-original'};
 const secondary={uid:'mainnet-second',username:'new-name',piUsername:'new-name',role:'buyer',roles:['buyer'],createdAt:new Date('2026-01-01')};
 await users.insertOne(primary);await users.insertOne(secondary);
 await tables.productCollection.insertOne({sellerId:primary.uid,title:'Existing product'});await tables.marketplaceOrderCollection.insertOne({buyerId:primary.uid,sellerId:primary.uid,status:'paid'});
 const oldAdapter=axios.defaults.adapter;
 axios.defaults.adapter=async config=>{const token=config.headers.Authorization?.replace('Bearer ','');const uid={original:'testnet-original',incoming:'mainnet-second',new:'brand-new'}[token];if(!uid)throw Object.assign(new Error('do-not-leak-token'),{response:{status:401}});return{config,status:200,statusText:'OK',headers:{},data:{uid,username:uid==='testnet-original'?'old-name':uid==='mainnet-second'?'new-name':'new-user'}};};
 const app=express();app.use(express.json());app.use(session({secret:'link-tests-only',resave:false,saveUninitialized:true}));
 Object.assign(app.locals,tables,{piIdentityLinkCollection:links,piIdentityChallengeCollection:challenges,mongoClient:{startSession:()=>({withTransaction:async(fn,options)=>{assert.equal(options.writeConcern.w,'majority');return fn();},endSession:async()=>{}})}});
 const router=express.Router();mountLinks(router);app.use('/user',router);app.post('/user/signin',handleSignIn);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/user/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 const start=()=>post('pi-identities/start',{accessToken:'original'});
 const complete=code=>post('pi-identities/complete',{accessToken:'incoming',code,confirmedOriginalUid:primary.uid});
 try{await run({users,links,challenges,tables,post,start,complete,primary,secondary,locals:app.locals});}finally{axios.defaults.adapter=oldAdapter;await new Promise(r=>server.close(r));}
}
for(const role of ['seller','admin'])test(`dual Pi verification restores original ${role}, credentials and ownership without merging`,()=>fixture(async({users,links,challenges,tables,post,start,complete,primary,secondary,locals})=>{
 const before=await users.findOne({uid:primary.uid}),secondaryBefore=await users.findOne({uid:secondary.uid});
 const challenge=await start();assert.equal(challenge.status,200);assert.equal(challenge.body.code.length,43);
 assert(!JSON.stringify(await challenges.find({}).toArray()).includes(challenge.body.code));
 const preview=await post('pi-identities/preview',{accessToken:'incoming',code:challenge.body.code});assert.equal(preview.status,200);assert.equal(preview.body.original.uid,primary.uid);assert.equal(preview.body.existingSecondaryAccount,true);
 assert.equal((await links.find({}).toArray()).length,0);assert.equal((await complete(challenge.body.code)).status,200);
 assert.equal((await resolveLinkedPiAccount(locals,secondary.uid)).uid,primary.uid);
 const signed=await post('signin',{authResult:{accessToken:'incoming',user:{uid:'forged',roles:['admin']}}});assert.equal(signed.status,200);assert.equal(signed.body.user.uid,primary.uid);assert.equal(signed.body.user.role,role);assert.deepEqual(signed.body.user.roles,[role,'moderator']);
 const req={app:{locals},session:{cookie:{}},get:name=>name==='x-smaj-refresh-token'?signed.body.session.refreshToken:undefined,cookies:{}};
 assert.equal((await resolveHubAccessUser(req,signed.body.session.accessToken)).uid,primary.uid);
 assert.equal((await refreshPersistentSession(req)).user.uid,primary.uid);
 const after=await users.findOne({uid:primary.uid});for(const key of ['uid','displayName','settings','bio','country','role','roles','createdAt','accessToken','piVerifiedUid'])assert.deepEqual(after[key],before[key],key);
 const secondaryAfter=await users.findOne({uid:secondary.uid});delete secondaryAfter.piIdentityLinkVersion;assert.deepEqual(secondaryAfter,secondaryBefore);
 assert.equal((await users.find({}).toArray()).length,2);assert.equal((await tables.productCollection.find({sellerId:primary.uid}).toArray()).length,1);assert.equal((await tables.marketplaceOrderCollection.find({buyerId:primary.uid}).toArray()).length,1);
 assert.equal((await complete(challenge.body.code)).status,409);assert.equal((await post('signin',{authResult:{accessToken:'original'}})).body.user.uid,primary.uid);
},role));
test('invalid Pi proof, same identity, wrong confirmation and expired codes cannot bind',()=>fixture(async({post,start,complete,challenges,links})=>{
 assert.equal((await post('pi-identities/start',{accessToken:'forged',uid:'testnet-original'})).status,401);
 const {body}=await start();assert.equal((await post('pi-identities/preview',{accessToken:'original',code:body.code})).status,409);
 assert.equal((await post('pi-identities/complete',{accessToken:'incoming',code:body.code,confirmedOriginalUid:'wrong'})).status,409);
 assert.equal((await links.find({}).toArray()).length,0);const record=(await challenges.find({}).toArray())[0];await challenges.updateOne({_id:record._id},{$set:{expiresAt:new Date(0)}});assert.equal((await complete(body.code)).status,409);
}));
test('original account must be older and unblocked; no cookie or username bypass',()=>fixture(async({post,users,primary})=>{
 const reverse=await post('pi-identities/start',{accessToken:'incoming'});assert.equal(reverse.status,200);
 assert.equal((await post('pi-identities/preview',{accessToken:'original',code:reverse.body.code})).status,409);
 await users.updateOne({uid:primary.uid},{$set:{blocked:true}});assert.equal((await post('pi-identities/start',{accessToken:'original'})).status,409);
}));
test('genuine registrations remain available and linking can accept an identity with no duplicate record',()=>fixture(async({post,start,users,primary})=>{
 const code=(await start()).body.code;
 assert.equal((await post('pi-identities/complete',{accessToken:'new',code,confirmedOriginalUid:primary.uid})).status,200);
 assert.equal((await post('signin',{authResult:{accessToken:'new'}})).body.user.uid,primary.uid);
 assert.equal((await users.find({uid:'brand-new'}).toArray()).length,0);
}));
test('already linked identities cannot be rebound and unavailable transactions fail closed',()=>fixture(async({start,complete,post,locals,links})=>{
 const code=(await start()).body.code;const client=locals.mongoClient;locals.mongoClient=null;
 assert.equal((await complete(code)).status,503);assert.equal((await links.find({}).toArray()).length,0);locals.mongoClient=client;
 assert.equal((await complete(code)).status,200);assert.equal((await post('pi-identities/start',{accessToken:'incoming'})).status,409);
}));
test('linking revokes secondary sessions while original sessions stay valid',()=>fixture(async({post,start,complete,locals})=>{
 const primary=(await post('signin',{authResult:{accessToken:'original'}})).body.session;
 const secondary=(await post('signin',{authResult:{accessToken:'incoming'}})).body.session;
 assert.equal((await complete((await start()).body.code)).status,200);
 const request=()=>({app:{locals},session:{}});
 assert.equal(await resolveHubAccessUser(request(),secondary.accessToken),null);
 assert.equal((await resolveHubAccessUser(request(),primary.accessToken)).uid,'testnet-original');
}));
