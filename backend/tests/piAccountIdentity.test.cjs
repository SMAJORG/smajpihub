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
 assert.equal(result.status,409);assert.equal(result.body.error,'signin_account_identity_conflict');assert.equal(result.body.stage,'account_lookup');assert(result.body.requestId);assert(!result.body.message.includes('Browser'));assert.deepEqual(await users.find({}).toArray(),before);
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

test('only the Pi token identity authorizes login, not stale SDK UID, username or roles',()=>fixture(async({users,login})=>{
 await users.insertOne(original());const result=await login({authResult:{accessToken:'fresh-incoming-token',user:{uid:'client-forgery',username:'outdated-name',roles:['admin']}}});
 assert.equal(result.status,200);assert.equal(result.body.user.uid,'original-testnet-uid');assert.equal(result.body.user.role,'seller');assert.equal((await users.find({}).toArray()).length,1);
}));
test('token-only sign-in and returning identity without a new username use the saved account',()=>fixture(async({users,login,setVerified})=>{
 await users.insertOne(original());setVerified({uid:'original-testnet-uid'});const result=await login({authResult:{accessToken:'verified-token'}});
 assert.equal(result.status,200);assert.equal(result.body.user.username,'pioneer');assert.equal(result.body.user.uid,'original-testnet-uid');
}));
test('Pi upstream outage, timeout, configuration and invalid-token failures remain distinct',()=>fixture(async({users,login})=>{
 await users.insertOne(original());const adapter=axios.defaults.adapter;
 try {for(const [upstream,code,status,error]of[[500,undefined,503,'pi_verification_unavailable'],[404,undefined,503,'pi_api_configuration_error'],[429,undefined,503,'pi_verification_rate_limited'],[401,undefined,401,'pi_token_rejected'],[403,undefined,403,'pi_permissions_denied'],[undefined,'ECONNABORTED',504,'pi_verification_timeout']]){
  axios.defaults.adapter=async()=>{throw Object.assign(new Error('must-not-leak-secret'),{response:upstream?{status:upstream}:undefined,code});};
  const result=await login();assert.equal(result.status,status);assert.equal(result.body.error,error);assert.equal(result.body.stage,'pi_verification');assert(result.body.requestId);assert(!JSON.stringify(result.body).includes('must-not-leak-secret'));assert(!result.body.message.includes('Browser'));assert.equal((await users.find({}).toArray()).length,1);
 }}finally{axios.defaults.adapter=adapter;}
}));
test('identity API roots with optional /v2 never build duplicate version paths',()=>{
 const {userPlatformAPIBase}=require('../build/services/platformAPIClient');
 for(const root of ['https://api.minepi.com','https://api.minepi.com/','https://api.minepi.com/v2','https://api.minepi.com/v2/'])assert.equal(axios.getUri({baseURL:userPlatformAPIBase(root),url:'/v2/me'}),'https://api.minepi.com/v2/me');
});
test('database and session failures identify the backend stage without blaming Pi Browser',()=>fixture(async({users,login,tables})=>{
 await users.insertOne(original());const find=users.findOne;
 users.findOne=async()=>{throw new Error('mongo-secret');};let result=await login();assert.equal(result.status,503);assert.equal(result.body.error,'signin_storage_unavailable');assert.equal(result.body.stage,'account_lookup');
 users.findOne=find;tables.deviceSessionCollection.updateOne=async()=>{throw new Error('session-secret');};result=await login();assert.equal(result.status,503);assert.equal(result.body.error,'signin_session_unavailable');assert(!JSON.stringify(result.body).includes('session-secret'));
}));
