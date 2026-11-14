const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),session=require('express-session'),axios=require('axios');
const {ObjectId}=require('mongodb');
const {createMemoryCollections}=require('../build/services/memoryDatabase');
const {handleSignIn}=require('../build/handlers/users');
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

test('unknown UID cannot create a duplicate or select an account by username',()=>fixture(async({users,login,setVerified})=>{
 await users.insertOne(original());setVerified({uid:'other-app-uid',username:'pioneer'});
 const before=await users.find({}).toArray(),result=await login();
 assert.equal(result.status,401);assert.equal(result.body.message,'Pi login failed. Please login again through Pi Browser.');assert.deepEqual(await users.find({}).toArray(),before);
}));
for(const role of ['buyer','admin'])test(`original exact-UID login works for incomplete ${role} despite stale hints or recovery records`,()=>fixture(async({users,links,login})=>{
 await users.insertOne({uid:'original-testnet-uid',username:'pioneer',displayName:'Existing profile',role,roles:[role,'moderator'],settings:{theme:'dark'}});
 await users.insertOne({uid:'other-uid',username:'pioneer',country:'NG'});
 await links.insertOne({_id:'original-testnet-uid',status:'pending'});
 const result=await login({expectedAccountUid:'stale-uid',loginContext:{clientId:'ignored'}});
 assert.equal(result.status,200);assert.equal(result.body.user.uid,'original-testnet-uid');assert.equal(result.body.user.role,role);assert.deepEqual(result.body.user.roles,[role,'moderator']);assert.equal((await users.find({}).toArray()).length,2);
}));
test('normal new-user login remains available without continuity requirements',()=>fixture(async({users,login,setVerified})=>{
 setVerified({uid:'genuine-new-user',username:'new-pioneer'});const result=await login({expectedAccountUid:'stale-browser-value'});
 assert.equal(result.status,200);assert.equal(result.body.user.uid,'genuine-new-user');assert.equal((await users.find({}).toArray()).length,1);
}));
test('approved recovery metadata does not alter the restored direct-UID login',()=>fixture(async({users,links,login})=>{
 await users.insertOne(original());await users.insertOne({uid:'other-uid',username:'other-user',role:'buyer'});
 await links.insertOne({_id:'original-testnet-uid',status:'approved',canonicalUid:'other-uid'});
 assert.equal((await login()).body.user.uid,'original-testnet-uid');
 await users.updateOne({uid:'original-testnet-uid'},{$set:{blocked:true}});assert.equal((await login()).status,403);
}));
