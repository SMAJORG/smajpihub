const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const { ObjectId } = require('../node_modules/mongodb');
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
  const modules={'mongodb':{ObjectId},'../services/auth':{resolveCurrentUser:async req=>locals.userCollection.findOne({uid:req.uid})},'../services/notifications':{createNotification:async()=>{}},'../services/userPresence':{readUserPresence:()=>({online:false})},crypto:require('node:crypto')};
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('backend/src/handlers/messages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>modules[name],Date,Set,Map,console,setTimeout});
  const router={use:fn=>middleware.push(fn)};
  for(const method of ['get','post','patch','delete']) router[method]=(paths,fn)=>{for(const path of [].concat(paths))routes[method+path]=fn;};
  exports.default(router);
  const call=async(method,path,{uid='alice',params={},body={},query={},owner}={})=>{
    let status=200,result,ended=false;
    const req={uid,params,body,query,app:{locals},get:()=>owner};
    const res={setHeader(){},on(){},status(value){status=value;return this;},json(value){result=value;ended=true;return this;}};
    for(const fn of middleware){await fn(req,res,()=>{});if(ended)return{status,body:result};}
    await routes[method+path](req,res);return {status,body:result};
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
