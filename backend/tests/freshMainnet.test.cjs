process.env.PI_MAINNET_ACCOUNT_MODE='fresh';
process.env.PI_COMMERCE_MODE='mainnet';
process.env.PI_NETWORK='Pi Network';
process.env.PI_PAYMENTS_ENABLED='false';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),session=require('express-session'),axios=require('axios');
const {MemoryCollection}=require('../build/services/memoryDatabase');
const {commerceMode,commerceDatabase}=require('../build/services/commerceEnvironment');
const {handleSignIn}=require('../build/handlers/users');
const mountLinks=require('../build/handlers/piIdentityLinks').default;
const mountHistory=require('../build/handlers/testnetHistory').default;
const {resolveHubAccessUser,refreshPersistentSession}=require('../build/services/persistentSessions');
const {platformAPIKeyClient}=require('../build/services/platformAPIClient');
const mountCareRoute=require('../build/handlers/careroute').default;

test('fresh Mainnet login needs no legacy identity, payment key or wallet, but enabling money remains guarded',()=>{
 assert.equal(commerceMode(),'mainnet');
 assert.throws(()=>commerceMode({...process.env,PI_PAYMENTS_ENABLED:'true',PI_MAINNET_API_KEY:undefined}));
 assert.throws(()=>commerceMode({...process.env,PI_NETWORK:'Pi Testnet'}));
});
test('all services, users and sessions are isolated; fresh registration and return login preserve Testnet records and reject old credentials',async()=>{
 const tables=new Map();const db={collection:name=>{if(!tables.has(name))tables.set(name,new MemoryCollection());return tables.get(name);}};
 const originalUsers=db.collection('users');
 for(let n=0;n<24;n++)await originalUsers.insertOne({uid:'testnet-'+n,username:n===0?'pioneer':'original-'+n,role:'seller',bio:'Historical profile'});
 await db.collection('orders').insertOne({buyerId:'testnet-0',status:'paid'});
 const before=JSON.stringify(await originalUsers.find({}).toArray());
 const scoped=commerceDatabase(db,'mainnet');
 for(const name of ['users','orders','products','messages','job_profiles','institutions','courses','careroute_profiles','user_sessions','device_sessions','pi_account_identity_links'])assert.equal(await scoped.collection(name).countDocuments({}),0,name);
 const app=express();app.use(express.json());app.use(session({secret:'fresh-regression',resave:false,saveUninitialized:true}));
 Object.assign(app.locals,{userCollection:scoped.collection('users'),deviceSessionCollection:scoped.collection('device_sessions'),piIdentityLinkCollection:scoped.collection('pi_account_identity_links')});
 app.post('/user/signin',handleSignIn);const links=express.Router();mountLinks(links);app.use('/user',links);const history=express.Router();mountHistory(history);app.use('/history',history);const care=express.Router();mountCareRoute(care);app.use(care);
 const adapter=axios.defaults.adapter;axios.defaults.adapter=async config=>{
  if(config.headers.Authorization!=='Bearer fresh-mainnet-proof')throw Object.assign(Error('invalid'),{response:{status:401}});
  return{config,status:200,statusText:'OK',headers:{},data:{uid:'mainnet-uid',username:'pioneer'}};
 };
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};};
 try{
  assert.equal((await request('/user/signin',{authResult:{accessToken:'forged',user:{uid:'testnet-0'}}})).status,401);
  const first=await request('/user/signin',{authResult:{accessToken:'fresh-mainnet-proof',user:{uid:'testnet-0',role:'seller'}}});
  assert.equal(first.status,200);assert.equal(first.data.user.uid,'mainnet-uid');assert.equal(first.data.user.role,'buyer');assert.equal(first.data.user.accountEnvironment,'mainnet');
  assert.equal(first.data.user.smajVerification.verified,false);assert.equal(first.data.user.verificationStatus,'none');
  const saved=await app.locals.userCollection.findOne({uid:'mainnet-uid'});
  await app.locals.userCollection.updateOne({_id:saved._id},{$set:{bio:'New Mainnet profile'}});
  const returning=await request('/user/signin',{authResult:{accessToken:'fresh-mainnet-proof'}});assert.equal(returning.status,200);assert.equal(returning.data.user.bio,'New Mainnet profile');
  assert.equal(String((await app.locals.userCollection.findOne({uid:'mainnet-uid'}))._id),String(saved._id));assert.equal(await app.locals.userCollection.countDocuments({}),1);
  const req={app,session:{cookie:{}},get:()=>undefined,cookies:{}};
  assert.equal((await resolveHubAccessUser(req,returning.data.session.accessToken)).uid,'mainnet-uid');
  assert.equal((await refreshPersistentSession(req,returning.data.session.refreshToken)).user.uid,'mainnet-uid');
  assert.equal(await refreshPersistentSession(req,'hub_refresh_'+'a'.repeat(64)+'.'+'b'.repeat(64)),null);
  assert.equal((await request('/user/pi-identities/session-start',{accessToken:'fresh-mainnet-proof'})).status,404);
  assert.equal((await request('/history/orders')).status,404);
  assert.deepEqual((await request('/careroute/hospitals')).data,{hospitals:[],total:0,live:false});
  assert.equal((await request('/careroute/requests',{patientName:'No fabricated dispatch'})).status,503);
  assert.equal((await request('/careroute/hospital/other/requests')).status,503);
  await assert.rejects(platformAPIKeyClient.post('/v2/payments/payment/approve'),/payments are disabled/);
  assert.equal(JSON.stringify(await originalUsers.find({}).toArray()),before);assert.equal(await db.collection('orders').countDocuments({}),1);
 }finally{axios.defaults.adapter=adapter;await new Promise(r=>server.close(r));}
});
