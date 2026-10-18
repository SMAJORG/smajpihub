const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const { ObjectId } = require('../node_modules/mongodb');
const presence = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('backend/src/services/userPresence.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:presence,Date});
const equal = (a,b) => String(a) === String(b);
function matches(doc, query) {
  return Object.entries(query).every(([key,value]) => {
    if (key === '$or') return value.some(item => matches(doc,item));
    const actual=doc[key];
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op,target]) => op === '$ne' ? !(Array.isArray(actual) ? actual.some(item=>equal(item,target)) : equal(actual,target)) : op === '$exists' ? (actual !== undefined) === target : op === '$lt' ? String(actual)<String(target) : op === '$in' ? target.some(item=>equal(actual,item)) : false);
    }
    return Array.isArray(actual) ? actual.some(item=>equal(item,value)) : equal(actual,value);
  });
}
class Collection {
  constructor(items=[], unique) { this.items=items; this.unique=unique; }
  find(query) {
    let items=this.items.filter(item=>matches(item,query));
    return { sort(order) { const [key,direction]=Object.entries(order)[0];items.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*direction);return this; },limit(n){items=items.slice(0,n);return this;},toArray:async()=>items.map(item=>({...item})) };
  }
  async findOne(query) { return this.items.find(item=>matches(item,query)) || null; }
  async insertOne(doc) {
    if (this.unique && this.items.some(item=>this.unique(item,doc))) throw Object.assign(new Error('duplicate'),{code:11000});
    const stored={...doc,_id:doc._id || new ObjectId()};this.items.push(stored);return {insertedId:stored._id};
  }
  async updateOne(query, update, options={}) {
    let item=this.items.find(item=>matches(item,query));
    if (!item && options.upsert) { const result=await this.insertOne(update.$setOnInsert);item=this.items.find(item=>equal(item._id,result.insertedId)); }
    if (!item) return {matchedCount:0};
    Object.assign(item,update.$set || {});
    for (const [key,value] of Object.entries(update.$pull || {})) item[key]=(item[key] || []).filter(entry=>value && value.$in ? !value.$in.some(target=>equal(entry,target)) : !equal(entry,value));
    for (const [key,value] of Object.entries(update.$addToSet || {})) item[key]=[...new Set([...(item[key]||[]),value])];
    return {matchedCount:1};
  }
  async updateMany(query,update) { for(const item of this.items.filter(item=>matches(item,query))) await this.updateOne({_id:item._id},update); }
  async deleteOne(query) { this.items=this.items.filter(item=>!matches(item,query)); }
}
function harness() {
  const routes={},middleware=[];
  const locals={
    conversationCollection:new Collection([], (a,b)=>a.pairKey===b.pairKey),
    messageCollection:new Collection([], (a,b)=>Boolean(b.clientMessageId && a.clientMessageId===b.clientMessageId && a.conversationId===b.conversationId && a.senderId===b.senderId)),
    userCollection:new Collection([{uid:'alice',displayName:'Alice'},{uid:'bob',displayName:'Bob'},{uid:'mallory',displayName:'Mallory'}]),
    productCollection:new Collection(),
  };
  const modules={'mongodb':{ObjectId},'../services/auth':{resolveCurrentUser:async req=>locals.userCollection.findOne({uid:req.uid})},'../services/notifications':{createNotification:async()=>{}},'../services/userPresence':presence,crypto:require('node:crypto')};
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('backend/src/handlers/messages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>modules[name],Date,Set,Map,console,setTimeout,Buffer});
  const router={use:fn=>middleware.push(fn)};
  for(const method of ['get','post','patch','delete']) router[method]=(paths,fn)=>{for(const path of [].concat(paths))routes[method+path]=fn;};
  exports.default(router);
  const call=async(method,path,{uid='alice',params={},body={},query={},owner}={})=>{
    let status=200,result,ended=false;const headers={};
    const req={uid,params,body,query,app:{locals},get:()=>owner};
    const res={setHeader(key,value){headers[key]=value;},send(value){result=value;ended=true;return this;},on(){},status(value){status=value;return this;},json(value){result=value;ended=true;return this;}};
    for(const fn of middleware){await fn(req,res,()=>{});if(ended)return{status,body:result};}
    await routes[method+path](req,res);return {status,body:result,headers};
  };
  const send=(id='message_0001',extra={})=>call('post','/direct/:recipientId',{params:{recipientId:'bob'},body:{message:'Hello',clientMessageId:id},...extra});
  return{call,send,locals};
}
test('opening a new recipient returns profile and creates no conversation',async()=>{const h=harness();const result=await h.call('get','/direct/:recipientId',{params:{recipientId:'bob'}});assert.equal(result.body.conversation.participantName,'Bob');assert.equal(result.body.conversation._id,'draft:bob');assert.equal(h.locals.conversationCollection.items.length,0);});
test('first message persists a conversation; refresh resolves the same chat',async()=>{const h=harness();const sent=await h.send();assert.equal(sent.status,201);const resolved=await h.call('get','/direct/:recipientId',{params:{recipientId:'bob'}});assert.equal(resolved.body.conversation._id,sent.body.message.conversationId);assert.equal(h.locals.messageCollection.items.length,1);});
test('invalid first message does not persist a conversation',async()=>{const h=harness();const result=await h.send('message_0001',{body:{message:''}});assert.equal(result.status,400);assert.equal(h.locals.conversationCollection.items.length,0);});
test('concurrent first sends and opposite direction reuse one unique direct chat',async()=>{const h=harness();const results=await Promise.all([h.send('message_0001'),h.send('message_0002'),h.send('message_0003',{uid:'bob',params:{recipientId:'alice'}})]);assert.ok(results.every(item=>item.status===201));assert.equal(h.locals.conversationCollection.items.length,1);assert.equal(new Set(h.locals.messageCollection.items.map(item=>item.conversationId)).size,1);});
test('retry after lost acknowledgement and concurrent duplicate sends create one message',async()=>{const h=harness();const results=await Promise.all([h.send(),h.send()]);const retry=await h.send();assert.equal(h.locals.messageCollection.items.length,1);assert.equal(retry.body.message._id,results[0].body.message._id);});
test('participant-only history and send access; owner header rejects account switching',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;assert.equal((await h.call('get','/:id',{uid:'mallory',params:{id}})).status,404);assert.equal((await h.call('post','/:id',{uid:'mallory',params:{id},body:{message:'attack'}})).status,404);assert.equal((await h.send('message_0002',{uid:'mallory',owner:'alice'})).status,401);assert.equal((await h.call('get','/:id',{uid:'missing',params:{id}})).status,401);});
test('history is paginated without overlap and excludes hidden messages before limiting',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;for(let i=0;i<8;i++)await h.locals.messageCollection.insertOne({conversationId:id,senderId:'bob',message:String(i),createdAt:new Date(),...(i===7?{hiddenFor:['alice']}: {})});const first=await h.call('get','/:id',{params:{id},query:{limit:3}});assert.equal(first.body.messages.length,3);assert.equal(first.body.hasMore,true);assert.ok(!first.body.messages.some(item=>item.message==='7'));const second=await h.call('get','/:id',{params:{id},query:{limit:3,before:first.body.nextCursor}});const ids=first.body.messages.concat(second.body.messages).map(item=>item._id);assert.equal(new Set(ids).size,6);});
test('sync is authenticated and returns only the signed-in users conversations',async()=>{const h=harness();await h.send();const result=await h.call('get','/sync',{uid:'mallory'});assert.equal(result.body.conversations.length,0);assert.ok(result.body.cursor);assert.equal((await h.call('get','/sync',{uid:'missing'})).status,401);});

test('long polling observes a message written after reconnect using the database signature',async()=>{const h=harness();await h.send();const initial=await h.call('get','/sync');const waiting=h.call('get','/sync',{query:{cursor:initial.body.cursor}});await new Promise(resolve=>setTimeout(resolve,20));await h.send('message_0002',{body:{message:'Arrived while connected',clientMessageId:'message_0002'}});const next=await waiting;assert.notEqual(next.body.cursor,initial.body.cursor);assert.equal(next.body.conversations[0].lastMessage,'Arrived while connected');});
test('reading another participants messages changes the sync signature and exposes read receipts',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;const before=await h.call('get','/sync');await h.call('get','/:id',{uid:'bob',params:{id}});const after=await h.call('get','/sync');assert.notEqual(after.body.cursor,before.body.cursor);const history=await h.call('get','/:id',{params:{id}});assert.ok(history.body.messages[0].readAt);});

test('sending again restores a conversation previously deleted from either inbox',async()=>{const h=harness();const first=await h.send();const conversation=h.locals.conversationCollection.items[0];conversation.deletedBy=['alice','bob'];await h.send('message_0002');assert.deepEqual(conversation.deletedBy,[]);assert.equal((await h.call('get','/:id',{params:{id:first.body.message.conversationId}})).status,200);});
test('Jobs first-message restrictions remain enforced',async()=>{const h=harness();const id=new ObjectId();await h.locals.conversationCollection.insertOne({_id:id,pairKey:'jobs:isolated',buyerId:'alice',sellerId:'bob',participants:['alice','bob'],contextType:'jobs',applicationId:'application',jobId:'job',lastMessage:''});assert.equal((await h.call('post','/:id',{params:{id:String(id)},body:{message:'Cannot initiate'}})).status,403);});

test('warming history does not mark messages read or clear inbox unread state',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;const preview=await h.call('get','/:id',{uid:'bob',params:{id},query:{preview:'true'}});assert.equal(preview.status,200);assert.equal(preview.body.messages.length,1);assert.equal(h.locals.messageCollection.items[0].readAt,undefined);assert.ok(h.locals.conversationCollection.items[0].unreadBy.includes('bob'));await h.call('get','/:id',{uid:'bob',params:{id}});assert.ok(h.locals.messageCollection.items[0].readAt);});

test('lightweight history strips base64 media but preserves duration and legacy responses',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;await h.locals.messageCollection.insertOne({conversationId:id,senderId:'bob',messageType:'voice',message:'Voice message',audioDataUrl:'data:audio/webm;base64,AQID',audioDurationSeconds:22,createdAt:new Date()});const light=await h.call('get','/:id',{params:{id},query:{light:'1',preview:'true'}});const item=light.body.messages.find(item=>item.messageType==='voice');assert.equal(item.audioDataUrl,undefined);assert.equal(item.mediaAvailable,true);assert.equal(item.audioDurationSeconds,22);const legacy=await h.call('get','/:id',{params:{id},query:{preview:'true'}});assert.equal(legacy.body.messages.find(item=>item.messageType==='voice').audioDataUrl,'data:audio/webm;base64,AQID');});
test('inbox previews cover twenty conversations without marking any read',async()=>{const h=harness();for(let i=0;i<24;i++){const id=new ObjectId();await h.locals.conversationCollection.insertOne({_id:id,pairKey:'alice:user'+i,buyerId:'alice',sellerId:'user'+i,participants:['alice','user'+i],updatedAt:new Date(),unreadBy:['alice']});await h.locals.messageCollection.insertOne({conversationId:String(id),senderId:'user'+i,messageType:'voice',message:'Voice',audioDataUrl:'data:audio/webm;base64,AQID',audioDurationSeconds:5,createdAt:new Date()});}const result=await h.call('get','/',{query:{includePreviews:'1'}});assert.equal(Object.keys(result.body.previews).length,20);for(const page of Object.values(result.body.previews)){assert.equal(page.messages[0].audioDataUrl,undefined);assert.equal(page.messages[0].audioDurationSeconds,5);}assert.ok(h.locals.messageCollection.items.every(item=>!item.readAt));assert.ok(h.locals.conversationCollection.items.every(item=>item.unreadBy.includes('alice')));assert.equal((await h.call('get','/')).body.previews,undefined);});
test('media endpoint checks participants, owner, message scope, hidden and deleted state',async()=>{const h=harness();const sent=await h.send();const id=sent.body.message.conversationId;const mediaId=new ObjectId();await h.locals.messageCollection.insertOne({_id:mediaId,conversationId:id,senderId:'bob',messageType:'voice',audioDataUrl:'data:audio/webm;base64,AQID'});const params={id,messageId:String(mediaId)};const own=await h.call('get','/:id/messages/:messageId/media',{params});assert.equal(own.status,200);assert.ok(Buffer.isBuffer(own.body));assert.equal(own.body.length,3);assert.equal(own.headers['Content-Type'],'audio/webm');assert.equal(own.headers['Cache-Control'],'no-store');assert.equal((await h.call('get','/:id/messages/:messageId/media',{uid:'mallory',params})).status,404);assert.equal((await h.call('get','/:id/messages/:messageId/media',{uid:'missing',params})).status,401);assert.equal((await h.call('get','/:id/messages/:messageId/media',{params,owner:'bob'})).status,401);const media=h.locals.messageCollection.items.find(item=>String(item._id)===String(mediaId));media.hiddenFor=['alice'];assert.equal((await h.call('get','/:id/messages/:messageId/media',{params})).status,404);delete media.hiddenFor;media.deletedForEveryone=true;assert.equal((await h.call('get','/:id/messages/:messageId/media',{params})).status,404);media.deletedForEveryone=false;media.conversationId=String(new ObjectId());assert.equal((await h.call('get','/:id/messages/:messageId/media',{params})).status,404);});

test('presence refresh includes draft recipients and connected peers, without leaking private profiles', async () => {
  const h = harness(); await h.send();
  const bob = h.locals.userCollection.items.find(row => row.uid === 'bob');
  bob.lastSeenAt = new Date(); bob.accessToken = 'private-token'; bob.presenceSessions = { session: { expiresAt: new Date(Date.now() + 45000) } };
  const first = await h.call('get', '/presence', {query:{recipient:'mallory'}});
  assert.equal(first.status, 200); assert.equal(first.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Array.from(first.body.peers, row => row.uid).sort(), ['bob','mallory']);
  assert.equal(first.body.peers.find(row => row.uid === 'bob').online, true);
  assert.ok(!JSON.stringify(first.body).includes('private-token')); assert.ok(!JSON.stringify(first.body).includes('presenceSessions'));
  bob.presenceSessions = {};
  const second = await h.call('get', '/presence');
  assert.equal(second.body.peers[0].online, false); assert.ok(second.body.peers[0].lastSeenAt);
  assert.equal((await h.call('get','/presence',{uid:'unknown'})).status,401);
  assert.equal((await h.call('get','/presence',{query:{recipient:['bob']}})).status,400);
});
test('presence for an unsent profile chat needs no conversation or message writes', async () => {
  const h = harness(); const result = await h.call('get','/presence',{query:{recipient:'bob'}});
  assert.equal(result.body.peers[0].uid,'bob'); assert.equal(h.locals.conversationCollection.items.length,0); assert.equal(h.locals.messageCollection.items.length,0);
  h.locals.userCollection.find = () => { throw Error('database unavailable'); };
  assert.equal((await h.call('get','/presence',{query:{recipient:'bob'}})).status,503);
});
