const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),session=require('express-session'),axios=require('axios');
const {ObjectId}=require('mongodb');
const {createMemoryCollections}=require('../build/services/memoryDatabase');
const {handleSignIn}=require('../build/handlers/users');
const {resolvePiAccount}=require('../build/services/piAccountIdentity');
const {auditPiAccounts}=require('../build/scripts/auditPiAccounts');
const original=()=>({uid:'original-testnet-uid',username:'pioneer',piUsername:'pioneer',displayName:'Completed seller',country:'NG',contactPhone:'saved-phone',bio:'saved biography',avatar:'saved-image',role:'seller',roles:['seller','moderator'],sellerActive:true,verificationStatus:'approved',verificationLevel:'seller_verified',verificationRequested:true,settings:{theme:'dark',language:'fr',notifications:false},language:'fr',createdAt:new Date('2025-01-01'),accessToken:'original-testnet-token',piVerifiedUid:'original-testnet-uid',piWalletAddress:'G'+'A'.repeat(55),piWalletVerifiedAt:new Date('2025-01-01')});
async function fixture(run){
 const tables=createMemoryCollections(),users=tables.userCollection,links=createMemoryCollections().userCollection;
 const oldAdapter=axios.defaults.adapter;let verified={uid:'original-testnet-uid',username:'pioneer',credentials:{scopes:['username']}};
 axios.defaults.adapter=async config=>({config,status:200,statusText:'OK',headers:{},data:verified});
 const app=express();app.use(express.json());app.use(session({secret:'identity-regression-only',resave:false,saveUninitialized:true}));app.locals.userCollection=users;app.locals.deviceSessionCollection=tables.deviceSessionCollection;app.locals.piIdentityLinkCollection=links;app.post('/user/signin',handleSignIn);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const login=async(fields={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/user/signin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authResult:{accessToken:'fresh-incoming-token',user:{uid:verified.uid,username:verified.username}},...fields})});return{status:response.status,body:await response.json()};};
 try{await run({tables,users,links,login,setVerified:value=>{verified=value;}});}finally{axios.defaults.adapter=oldAdapter;await new Promise(r=>server.close(r));}
}
test('returning verified UID preserves original profile, roles, seller tools, settings, verification and order ownership',()=>fixture(async({users,tables,login})=>{
 const profile=original();await users.insertOne(profile);await tables.marketplaceOrderCollection.insertOne({buyerId:profile.uid,sellerId:profile.uid,status:'paid'});
 const before=await users.findOne({uid:profile.uid}),result=await login({sandbox:true});assert.equal(result.status,200);assert.equal(result.body.user.uid,profile.uid);assert.equal(result.body.user.sellerActive,true);assert.equal(result.body.user.verificationStatus,'approved');
 const after=await users.findOne({uid:profile.uid});for(const key of ['_id','uid','displayName','country','contactPhone','bio','avatar','role','roles','sellerActive','verificationStatus','verificationLevel','verificationRequested','settings','language','createdAt'])assert.deepEqual(after[key],before[key],key);
 assert.equal((await users.find({}).toArray()).length,1);assert.equal((await tables.marketplaceOrderCollection.find({buyerId:result.body.user.uid}).toArray()).length,1);
}));
test('changed app UID + same verified username stops rather than creating or merging an account',()=>fixture(async({users,login,setVerified})=>{
 await users.insertOne(original());setVerified({uid:'paired-mainnet-uid',username:'pioneer'});const before=await users.find({}).toArray();const result=await login({sandbox:false});assert.equal(result.status,409);assert.equal(result.body.error,'pi_account_recovery_required');assert.deepEqual(await users.find({}).toArray(),before);
}));
test('client continuity hint stops an unfamiliar UID even when the username changed; hint cannot grant access',()=>fixture(async({users,login,setVerified})=>{
 await users.insertOne(original());setVerified({uid:'new-app-uid',username:'different-name'});const result=await login({expectedAccountUid:'original-testnet-uid',sandbox:false});assert.equal(result.status,409);assert.equal((await users.find({}).toArray()).length,1);
}));
for(const [sandbox,uid,name] of [[true,'genuine-testnet-new','new-test-user'],[false,'genuine-mainnet-new','new-main-user']]){
 test(`genuinely new ${sandbox?'Testnet':'Mainnet'} identity creates only its own profile and records diagnostic context`,()=>fixture(async({users,login,setVerified})=>{
  setVerified({uid,username:name,credentials:{scopes:['username']}});const result=await login({sandbox,loginContext:{clientId:'public-client-context'}});assert.equal(result.status,200);assert.equal(result.body.user.uid,uid);const saved=await users.findOne({uid});assert.equal(saved.role,'buyer');assert.equal(saved.lastPiLogin.verifiedUid,uid);assert.equal(saved.lastPiLogin.clientSandboxHint,sandbox);assert.equal((await users.find({}).toArray()).length,1);
 }));
}
function approval(account,overrides={}){return{_id:'paired-mainnet-uid',status:'approved',canonicalUserId:String(account._id),canonicalUid:account.uid,originalAppId:'reviewed-testnet-app',incomingAppId:'reviewed-mainnet-app',approvedBy:'reviewed-operator',approvedAt:new Date(),proofReference:'dual-identity-proof-record',...overrides};}
test('explicitly approved identity binding reconnects original account without replacing its UID or Testnet credentials',()=>fixture(async({users,links,login,setVerified})=>{
 await users.insertOne(original());const before=await users.findOne({uid:'original-testnet-uid'});await links.insertOne(approval(before));setVerified({uid:'paired-mainnet-uid',username:'pioneer-new-name',wallet_address:'G'+'B'.repeat(55)});
 const result=await login({sandbox:false,expectedAccountUid:before.uid});assert.equal(result.status,200);assert.equal(result.body.user.uid,before.uid);const after=await users.findOne({_id:before._id});
 for(const key of ['uid','username','piUsername','accessToken','piVerifiedUid','piWalletAddress','piWalletVerifiedAt','role','roles','settings','verificationStatus','sellerActive'])assert.deepEqual(after[key],before[key],key);assert.equal(after.lastPiLogin.verifiedUid,'paired-mainnet-uid');assert.equal((await users.find({}).toArray()).length,1);
}));
test('existing duplicate must be explicitly reviewed; approved reconnection preserves both records and their data',()=>fixture(async({users,links,login,setVerified})=>{
 await users.insertOne(original());await users.insertOne({uid:'paired-mainnet-uid',username:'pioneer',displayName:'Duplicate with its own data',role:'buyer'});const target=await users.findOne({uid:'original-testnet-uid'}),duplicate=await users.findOne({uid:'paired-mainnet-uid'});await links.insertOne(approval(target));setVerified({uid:'paired-mainnet-uid',username:'pioneer'});
 let result=await login();assert.equal(result.status,409);assert.equal(result.body.error,'pi_duplicate_account_review_required');assert.equal((await users.find({}).toArray()).length,2);
 await links.updateOne({_id:'paired-mainnet-uid'},{$set:{duplicatesReviewed:true,reviewedDuplicateAccountIds:[String(duplicate._id)]}});result=await login();assert.equal(result.status,200);assert.equal(result.body.user.uid,target.uid);assert.deepEqual(await users.findOne({_id:duplicate._id}),duplicate);assert.equal((await users.find({}).toArray()).length,2);
}));
test('missing proof, blocked originals, duplicate UID records and username-only claims never select another account',()=>fixture(async({users,links,login,setVerified})=>{
 await users.insertOne(original());const target=await users.findOne({uid:'original-testnet-uid'});await links.insertOne(approval(target,{proofReference:''}));setVerified({uid:'paired-mainnet-uid',username:'pioneer'});assert.equal((await login()).status,409);
 await links.updateOne({_id:'paired-mainnet-uid'},{$set:{proofReference:'reviewed-proof'}});await users.updateOne({_id:target._id},{$set:{blocked:true}});assert.equal((await login()).status,403);
 const isolated=createMemoryCollections().userCollection;await isolated.insertOne({uid:'duplicated',username:'one'});await isolated.insertOne({uid:'duplicated',username:'two'});await assert.rejects(resolvePiAccount(isolated,null,{uid:'duplicated',username:'one'}),error=>error.code==='pi_duplicate_uid');
}));
test('read-only audit reports ownership reference counts and profile presence without credentials or profile contents',async()=>{
 const tables=createMemoryCollections();await tables.userCollection.insertOne(original());await tables.marketplaceOrderCollection.insertOne({buyerId:'original-testnet-uid'});
 const lookup={users:tables.userCollection,orders:tables.marketplaceOrderCollection,products:tables.productCollection,messages:tables.messageCollection,device_sessions:tables.deviceSessionCollection,pi_account_identity_links:createMemoryCollections().userCollection};
 const report=await auditPiAccounts({databaseName:'regression',collection:name=>lookup[name]},['original-testnet-uid'],'pioneer');assert.equal(report.readOnly,true);assert.equal(report.accounts[0].referenceCounts.buyerOrders,1);const encoded=JSON.stringify(report);for(const secret of ['original-testnet-token','saved-phone','saved biography','saved-image'])assert(!encoded.includes(secret));assert.equal((await tables.userCollection.find({}).toArray()).length,1);
});

test('a known returning UID missing from the configured database cannot be provisioned as a replacement profile',()=>fixture(async({users,login})=>{
 const result=await login({expectedAccountUid:'original-testnet-uid'});assert.equal(result.status,409);assert.equal(result.body.error,'pi_account_record_missing');assert.equal((await users.find({}).toArray()).length,0);
}));

test('an approved link cannot issue an ambiguous UID-based session for duplicate canonical records',()=>fixture(async({users,links,login,setVerified})=>{
 await users.insertOne(original());const target=await users.findOne({uid:'original-testnet-uid'});await users.insertOne({...original(),displayName:'Second historical record'});await links.insertOne(approval(target));setVerified({uid:'paired-mainnet-uid',username:'pioneer'});const result=await login();assert.equal(result.status,409);assert.equal(result.body.error,'pi_duplicate_uid');assert.equal((await users.find({}).toArray()).length,2);
}));
