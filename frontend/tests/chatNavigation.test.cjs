const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToString}=require('react-dom/server');
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
function compile(path,modules,extra={}) {
 const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>modules[name],localStorage,document:{body:{}},navigator:{onLine:true},Date,Map,Set,URLSearchParams,AbortController,console,...extra});return exports;
}
const cache=compile('frontend/src/lib/chatCache.ts',{});
const viewport=compile('frontend/src/hooks/useChatViewport.ts',{react:React,'../lib/chatCache':cache});
const history=compile('frontend/src/lib/chatHistory.ts',{});
function render(query,uid='alice') {
 let requests=0;
 const modules={'../../hooks/useChatViewport':viewport,react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-dom':{createPortal:children=>children},'react-router-dom':{useSearchParams:()=>[new URLSearchParams(query),()=>{}],Link:({children,...props})=>React.createElement('a',props,children)},axios:{isAxiosError:()=>false},'../../contexts/AuthContext':{useAuthContext:()=>({user:{uid}})},'../../lib/chatCache':cache,'../../lib/axiosClient':{axiosClient:{get:()=>{requests++;return new Promise(()=>{});}}}};
 const empty=()=>null;
 const page=compile('frontend/src/pages/private/MessagesPage.tsx',new Proxy(modules,{get:(items,key)=>key in items?items[key]:{default:empty}}));
 const html=renderToString(React.createElement(page.default));return{html,requests};
}
test.beforeEach(()=>storage.clear());
test('new profile chat renders recipient and composer without conversation creation or network',()=>{const result=render('recipient=bob&name=Bob');assert.match(result.html,/Bob/);assert.match(result.html,/Message.../);assert.doesNotMatch(result.html,/chat-message-skeleton/);assert.equal(result.requests,0);});
test('existing recipient chat renders cached history immediately even with an unresolved network',()=>{cache.writeChatCache('alice','inbox',[{_id:'existing',buyerId:'alice',sellerId:'bob',participantId:'bob',participantName:'Bob',updatedAt:'',productId:'',productTitle:''}]);cache.writeChatCache('alice','existing',[{_id:'message1',conversationId:'existing',senderId:'bob',message:'Saved history appears instantly',createdAt:new Date().toISOString()}]);const result=render('recipient=bob&name=Bob');assert.match(result.html,/Saved history appears instantly/);assert.equal(result.requests,0);});
test('refresh restores the saved conversation profile and history',()=>{cache.writeChatCache('alice','conversation:thread',{_id:'thread',buyerId:'alice',sellerId:'bob',participantName:'Bob',updatedAt:'',productId:'',productTitle:''});cache.writeChatCache('alice','thread',[{_id:'m',conversationId:'thread',senderId:'bob',message:'Restored on refresh',createdAt:new Date().toISOString()}]);assert.match(render('conversation=thread').html,/Restored on refresh/);});
test('switching accounts cannot display another accounts history or queued sends',()=>{cache.writeChatCache('alice','thread',[{_id:'secret',message:'Alice private message'}]);cache.writeChatCache('alice','outbox',[{id:'private-send'}]);assert.deepEqual(cache.readChatCache('bob','outbox',[]),[]);const result=render('conversation=thread','bob');assert.doesNotMatch(result.html,/Alice private message/);});
test('optimistic acknowledgement reconciles by client identifier, including retries',()=>{const pending={_id:'local',clientMessageId:'send-1234',senderId:'alice',conversationId:'draft:bob',message:'Hello',createdAt:'2026-10-16T00:00:00Z',deliveryState:'pending'};const received={...pending,_id:'server',conversationId:'actual',deliveryState:undefined};const once=cache.mergeChatMessages([pending],[received]);const twice=cache.mergeChatMessages(once,[received]);assert.equal(twice.length,1);assert.equal(twice[0]._id,'server');assert.equal(twice[0].deliveryState,undefined);});
test('offline queue and optimistic history survive a page reload within the same account',()=>{cache.writeChatCache('alice','outbox',[{id:'send-1234',chatId:'thread',payload:{message:'Offline draft'}}]);cache.writeChatCache('alice','thread',[{_id:'local',message:'Offline draft',deliveryState:'pending'}]);assert.equal(cache.readChatCache('alice','outbox',[])[0].payload.message,'Offline draft');assert.equal(cache.readChatCache('alice','thread',[])[0].deliveryState,'pending');});
test('normal profile links omit product context; product enquiries explicitly include it',()=>{assert.equal(new URLSearchParams(cache.chatLink({uid:'bob',displayName:'Bob'}).split('?')[1]).has('product'),false);assert.equal(new URLSearchParams(cache.chatLink({uid:'bob'},{_id:'product',title:'Item'}).split('?')[1]).get('product'),'product');});

test('reconnect fills a history gap spanning multiple pages without dropping cached messages',async()=>{const pages={recent:{messages:[{_id:'08'},{_id:'09'}],nextCursor:'08'},'08':{messages:[{_id:'06'},{_id:'07'}],nextCursor:'06'},'06':{messages:[{_id:'04'},{_id:'05'}],nextCursor:'04'}};const fetched=[];const result=await history.fetchChatHistory(async before=>{fetched.push(before);return structuredClone(pages[before||'recent']);},'05',()=>true);assert.equal(result.messages.length,6);assert.deepEqual(fetched,[undefined,'08','06']);});
test('a slow response is discarded after switching chats or accounts',async()=>{let resolve;let current=true;const task=history.fetchChatHistory(()=>new Promise(done=>{resolve=done;}),undefined,()=>current);current=false;resolve({messages:[{_id:'private'}]});assert.equal(await task,null);});
test('new history loads only a single bounded page without a cache',async()=>{let requests=0;await history.fetchChatHistory(async()=>{requests++;return{messages:[{_id:'50'}],nextCursor:'50'};},undefined,()=>true);assert.equal(requests,1);});

test('recipient resolution reads saved history before creating a memory entry',()=>{cache.writeChatCache('alice','resolved',[{_id:'saved',conversationId:'resolved',senderId:'bob',message:'Do not erase me',createdAt:'2026-10-16T00:00:00Z'}]);const memory=new Map();const saved=cache.savedChatHistory('alice','resolved',memory);assert.equal(saved[0].message,'Do not erase me');assert.equal(memory.get('resolved')[0]._id,'saved');assert.equal(cache.savedChatHistory('bob','resolved',new Map()),null);});
const warmup=compile('frontend/src/lib/chatWarmup.ts',{});
test('inbox history warms with at most two concurrent requests, skipping saved chats',async()=>{const memory=new Map([['saved',[]]]);let running=0,max=0;const fetched=[];await warmup.warmChatHistory(['one','two','three','saved','one','draft:bob'],{read:id=>memory.get(id),fetch:async id=>{running++;max=Math.max(max,running);fetched.push(id);await new Promise(resolve=>setTimeout(resolve,5));running--;return[{_id:id}];},save:(id,items)=>memory.set(id,items),current:()=>true});assert.equal(max,2);assert.equal(fetched.length,3);assert.equal(memory.get('three')[0]._id,'three');});
test('late previews never overwrite active chat sends or a switched account',async()=>{const memory=new Map();let current=true;await warmup.warmChatHistory(['active','old-account'],{read:id=>memory.get(id),fetch:async id=>{if(id==='active')memory.set(id,[{_id:'optimistic'}]);else current=false;return[{_id:'stale'}];},save:(id,items)=>memory.set(id,items),current:()=>current});assert.equal(memory.get('active')[0]._id,'optimistic');assert.equal(memory.has('old-account'),false);});

test('visible-row warmup prioritizes tapped chats beyond row twenty and cancels obsolete jobs',async()=>{const waiting=new Map(),signals=new Map(),seen=[],saved=new Map();const queue=warmup.createChatWarmup({read:id=>saved.get(id),fetch:(id,signal)=>{seen.push(id);signals.set(id,signal);return new Promise(resolve=>waiting.set(id,resolve));},save:(id,items)=>saved.set(id,items),current:()=>true});queue.enqueue(Array.from({length:25},(_,i)=>String(i+1)));assert.deepEqual(seen,['1','2']);queue.enqueue(['25'],true);waiting.get('1')([{_id:'one'}]);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,['1','2','25']);queue.dispose();assert.ok(signals.get('2').aborted);assert.ok(signals.get('25').aborted);waiting.get('25')([{_id:'late'}]);await new Promise(resolve=>setImmediate(resolve));assert.equal(saved.has('25'),false);});

test('viewport restoration keeps a message anchored when earlier content changes height',()=>{
 const viewport=compile('frontend/src/hooks/useChatViewport.ts',{react:React,'../lib/chatCache':cache},{getComputedStyle:()=>({getPropertyValue:()=> '76'})});
 const node={parentElement:{},scrollHeight:3000,clientHeight:600,scrollTop:500,getBoundingClientRect:()=>({top:0})};
 let contentTop=600;
 const message={dataset:{messageId:'anchor'},getBoundingClientRect:()=>({top:contentTop-node.scrollTop,bottom:contentTop-node.scrollTop+100})};
 node.querySelectorAll=()=>[message];
 const saved=viewport.captureChatPosition(node);
 assert.equal(saved.atBottom,false);assert.equal(saved.messageId,'anchor');
 contentTop+=250;viewport.applyChatPosition(node,saved);assert.equal(node.scrollTop,750);
 viewport.applyChatPosition(node,{atBottom:true,offset:0,scrollTop:0});assert.equal(node.scrollTop,3000);
});
