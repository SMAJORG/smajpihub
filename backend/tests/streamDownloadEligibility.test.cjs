const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function setup({ plan = 'plus', status = 'active', expiresAt, source = 'cloudflare_stream', allowed = false, published = true } = {}) {
  const routes = new Map(), updates = [], calls = [];
  const video = { cloudflareUid: 'video-id', title: 'Movie', contentSource: source, downloadAllowed: allowed, visibility: published ? 'public' : 'private', moderationStatus: 'approved', playbackAllowed: true, processingStatus: 'ready', catalogAttachment: {tmdbId: 123, mediaType:'movie'} };
  const user = {_id:'viewer', streamSubscription:{plan,status,expiresAt}};
  const matches = query => Object.entries(query).every(([key,value]) => key === '$or' ? value.some(matches) : key.startsWith('catalogAttachment.') ? video.catalogAttachment[key.split('.')[1]] === value : video[key] === value);
  const locals = { userCollection: {findOne:async()=>user, updateOne:async(...args)=>updates.push(args)}, streamContentCollection: { findOne:async query=>matches(query)?video:null, updateOne:async()=>{} } };
  const axios = { get: async()=>{ calls.push('export');return {data:{result:{default:{status:'ready',url:'https://customer.cloudflarestream.com/video/downloads/default.mp4'}}}};}, isAxiosError:()=>false };
  const env={cloudflare_stream_account_id:'account', cloudflare_stream_api_token:'token', youtube_api_key:'',youtube_live_channel_ids:[]};
  const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/handlers/stream.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('require','exports','setInterval','console',code)(name=>name==='axios'?axios:name==='../environments'?env:name==='../services/auth'?{resolveCurrentUser:async()=>user}:{},exports,()=>({unref(){}}),{...console,warn(){}});
  exports.default(new Proxy({}, {get:(_,method)=>(path,handler)=>routes.set(method+' '+path,handler)}));
  return {updates,calls,async request(method,path,body={}){let code=200,payload;const res={status(value){code=value;return this},json(value){payload=value;return this}};await routes.get(method+' '+path)({params:{uid:'video-id',id:'123',type:'movie'},body,app:{locals}},res);return{code,payload}}};
}
test('paid Cloudflare titles without a pre-generated download flag pass availability, recording and export',async()=>{for(const plan of ['plus','family']){const app=setup({plan});assert.equal((await app.request('get','/availability/:type(movie|tv)/:id')).payload.downloadAllowed,true);assert.equal((await app.request('post','/downloads',{tmdbId:123,mediaType:'movie',title:'Movie',downloadStatus:'downloading'})).code,201);const result=await app.request('post','/download/:uid');assert.equal(result.code,200);assert.equal(result.payload.status,'ready');assert.equal(app.calls.length,1)}});
test('free, inactive and expired subscriptions cannot record or export downloads',async()=>{for(const options of [{plan:'free'},{status:'cancelled'},{expiresAt:'2020-01-01'}]){const app=setup(options);for(const [path,body] of [['/downloads',{tmdbId:123,mediaType:'movie',title:'Movie'}],['/download/:uid',{}]])assert.equal((await app.request('post',path,body)).code,403);assert.equal(app.updates.length,0);assert.equal(app.calls.length,0)}});
test('unpublished Cloudflare videos and external sources without download rights are blocked',async()=>{for(const options of [{published:false},{source:'youtube'},{source:'internet_archive'}]){const app=setup(options);assert.notEqual((await app.request('post','/download/:uid')).code,200);assert.notEqual((await app.request('post','/downloads',{tmdbId:123,mediaType:'movie',title:'Movie'})).code,201);assert.equal(app.calls.length,0)}});
