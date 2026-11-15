const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryCollection}=require('../build/services/memoryDatabase');
const {auditPiAccounts}=require('../build/scripts/auditPiAccounts');

function fixture(){
 const collections=new Map();
 const db={databaseName:'test',collection:name=>{if(!collections.has(name))collections.set(name,new MemoryCollection());return collections.get(name);}};
 return db;
}
test('original UID audit includes incoming verified bindings and excludes pending or fabricated recovery records',async()=>{
 const db=fixture();const {insertedId}=await db.collection('users').insertOne({uid:'original',username:'saved',role:'seller',accessToken:'never-export',piWalletAddress:'never-export'});
 await db.collection('pi_account_identity_links').insertMany([
  {_id:'mainnet',canonicalUid:'original',canonicalUserId:String(insertedId),status:'verified',proofMethod:'hub_session_pi_me',verifiedAt:new Date(),challengeId:'never-export'},
  {_id:'pending',canonicalUid:'original',canonicalUserId:String(insertedId),status:'approved'},
  {_id:'forged',canonicalUid:'original',canonicalUserId:'wrong-account',status:'verified',proofMethod:'dual_pi_me',verifiedAt:new Date()},
 ]);
 const report=await auditPiAccounts(db,['original']);
 assert.equal(report.recordedVerifiedBindings,1);assert.equal(report.approvedIdentityBindings[0]._id,'mainnet');assert.equal(report.unverifiedBindingRecords.length,2);
 assert.equal(JSON.stringify(report).includes('never-export'),false);
});
test('all-account audit gives exact totals and distinguishes active original-session evidence from expired or revoked records',async()=>{
 const db=fixture();await db.collection('users').insertMany([{uid:'original',username:'saved'},{uid:'other',username:'other'}]);
 await db.collection('device_sessions').insertMany([
  {userId:'original',active:true,revokedAt:null,expiresAt:new Date(Date.now()+60000),refreshTokenHash:'never-export'},
  {userId:'original',active:true,revokedAt:null,expiresAt:new Date(0)},
  {userId:'original',active:true,revokedAt:new Date(),expiresAt:new Date(Date.now()+60000)},
 ]);
 const report=await auditPiAccounts(db,[],undefined,true);
 assert.equal(report.totalUsers,2);assert.equal(report.auditedAccounts,2);assert.equal(report.recordedVerifiedBindings,0);
 assert.equal(report.accounts.find(x=>x.canonicalUid==='original').referenceCounts.deviceSessions,3);
 assert.equal(report.accounts.find(x=>x.canonicalUid==='original').referenceCounts.activeDeviceSessions,1);
 assert.equal(JSON.stringify(report).includes('never-export'),false);
});
