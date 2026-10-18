const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync('frontend/src/pages/private/MessagesPage.tsx', 'utf8');
const output = code => ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const helpers = {};
vm.runInNewContext(output(source.slice(source.indexOf('const isPresenceOnline'), source.indexOf('const blobToDataUrl')) + '\nexports.online=isPresenceOnline; exports.label=formatPresenceLastSeen;'), {exports:helpers,Date});
function fixture(get) {
  const events = {}, intervals = [], clocks = [], snapshots = [], requests = [];
  let cleanup, hidden = false;
  const begin = source.indexOf('  useEffect(() => {', source.indexOf('const presenceRecipient'));
  const end = source.indexOf('  const withPresence', begin);
  const context = {
    user:{uid:'alice'},presenceRecipient:'bob',presenceOffset:{current:0},Date,AbortController,Object,
    navigator:{onLine:true},document:{get hidden(){return hidden;},addEventListener:(key,fn)=>events[key]=fn,removeEventListener:key=>delete events[key]},
    window:{setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},addEventListener:(key,fn)=>events[key]=fn,removeEventListener:key=>delete events[key]},
    setPresenceNow:value=>clocks.push(value),setLivePresence:value=>snapshots.push(value),useEffect:fn=>cleanup=fn(),
    axiosClient:{get:async(url,config)=>{requests.push({url,config});return get(config);}},
  };
  vm.runInNewContext(output(source.slice(begin,end)),context);
  return {events,intervals,clocks,snapshots,requests,hide:value=>hidden=value,cleanup:()=>cleanup(),context};
}
const flush = async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const response = ()=>({data:{serverTime:Date.now()+3600000,peers:[{uid:'bob',online:true,presenceExpiresAt:new Date(Date.now()+3645000).toISOString()}]}});
test('draft profile presence refreshes every five seconds and clock expires cached leases without message events',async()=>{
  const app=fixture(async()=>response());await flush();
  assert.equal(app.requests[0].url,'/messages/presence');assert.equal(app.requests[0].config.params.recipient,'bob');
  assert.equal(app.requests[0].config.headers['X-SMAJ-Chat-Owner'],'alice');assert.equal(app.snapshots[0].bob.online,true);
  assert.ok(app.context.presenceOffset.current>3590000);
  assert.ok(app.intervals.some(timer=>timer.ms===5000));assert.ok(app.intervals.some(timer=>timer.ms===1000));
  app.intervals.find(timer=>timer.ms===1000).fn();assert.ok(app.clocks.at(-1)>Date.now()+3590000);
  const cached={online:true,presenceExpiresAt:new Date(45000).toISOString(),lastSeenAt:new Date(1000).toISOString()};
  assert.equal(helpers.online(cached,44000),true);assert.equal(helpers.online(cached,46000),false);
  assert.equal(helpers.label(cached,121000),'Last seen 2m ago');assert.equal(helpers.online({online:true},1000),false);
  app.cleanup();
});
test('hidden chats pause requests and focus or reconnect immediately refreshes presence',async()=>{
  const app=fixture(async()=>response());await flush();app.hide(true);const count=app.requests.length;
  app.intervals.find(timer=>timer.ms===5000).fn();await flush();assert.equal(app.requests.length,count);
  app.hide(false);app.events.visibilitychange();await flush();assert.equal(app.requests.length,count+1);
  app.events.focus();await flush();app.events.online();await flush();assert.equal(app.requests.length,count+3);app.cleanup();
});
test('overlapping refreshes coalesce and a switched chat discards delayed responses',async()=>{
  let release;const app=fixture(()=>new Promise(resolve=>release=resolve));await flush();
  app.events.focus();app.events.online();await flush();assert.equal(app.requests.length,1);
  app.cleanup();assert.equal(app.requests[0].config.signal.aborted,true);release(response());await flush();assert.equal(app.snapshots.length,0);
});
