const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {ObjectId} = require('../../backend/node_modules/mongodb');
const code = ts.transpileModule(fs.readFileSync('backend/src/handlers/messages.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function send({context=false, owner='seller', messageType='text'}={}) {
 const conversationId = new ObjectId(), productId = new ObjectId(); let stored, response;
 const conversation = {_id:conversationId,buyerId:'buyer',sellerId:'seller',participants:['buyer','seller'],productId:String(productId),productTitle:'Old product',productImage:'old.jpg'};
 const modules = {mongodb:{ObjectId},'../services/auth':{resolveCurrentUser:async()=>({uid:'buyer',displayName:'Buyer'})},'../services/notifications':{createNotification:async()=>{}}};
 const exports={};vm.runInNewContext(code,{exports,require:name=>modules[name],Date,Set});
 const routes={}; const router={get:()=>{},post:(path,handler)=>routes[path]=handler,patch:()=>{},delete:()=>{}}; exports.default(router);
 const body={message:'Hello',messageType,...(context?{productId:String(productId)}:{}),...(messageType==='voice'?{audioDataUrl:'data:audio/webm;base64,AAAA',audioDurationSeconds:2}:{})};
 await routes['/:id']({params:{id:String(conversationId)},body,app:{locals:{conversationCollection:{findOne:async()=>conversation,updateOne:async()=>({matchedCount:1})},productCollection:{findOne:async()=>({_id:productId,sellerId:owner,title:'Requested product',image:'product.jpg'})},messageCollection:{insertOne:async doc=>{stored=doc;return{insertedId:new ObjectId()}}}}}}, {status:status=>({json:body=>{response={status,body}}})});
 return{stored,response};
}
test('normal messages omit product context even in a product conversation',async()=>{const r=await send();assert.equal(r.response.status,201);assert.equal(r.stored.productId,undefined)});
test('explicit product enquiry uses authoritative product details',async()=>{const r=await send({context:true});assert.equal(r.response.status,201);assert.equal(r.stored.productContextExplicit,true);assert.equal(r.stored.productTitle,'Requested product');assert.equal(r.stored.productImage,'product.jpg')});
test('unrelated sellers product cannot be attached to an enquiry',async()=>{const r=await send({context:true,owner:'other'});assert.equal(r.response.status,400);assert.equal(r.stored,undefined)});
test('ordinary voice replies do not inherit product context',async()=>{const r=await send({messageType:'voice'});assert.equal(r.response.status,201);assert.equal(r.stored.productId,undefined)});
