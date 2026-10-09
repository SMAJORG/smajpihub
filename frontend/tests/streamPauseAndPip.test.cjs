const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {test} = require('node:test'); const ts = require('typescript'); const path = require('node:path');
const workspace = fs.readFileSync(path.join(__dirname,'../src/pages/stream/StreamWorkspacePage.tsx'),'utf8');
const player = fs.readFileSync(path.join(__dirname,'../src/pages/stream/StreamVideoPlayer.tsx'),'utf8');
function load(source, globals, expression) { const context={...globals}; vm.runInNewContext(ts.transpileModule(source+'\nglobalThis.actual='+expression+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context); return context.actual; }
function harness(status, previous='downloading', canPause=true) {
 const calls=[]; let record={downloadId:42,status:previous,canPause,progress:35}; let titles=[{id:'7',mediaType:'movie',downloadStatus:previous}]; let busy=new Set();
 const source=workspace.slice(workspace.indexOf('  const toggleDownloadPause = async'),workspace.indexOf('  const [remoteTitles'));
 const action=load(source,{downloadControlsBusy:new Set(),readNativeDownload:()=>record,setDownloadControlsBusy:fn=>{busy=fn(busy)},SmajMedia:{pauseDownload:async()=>calls.push('pause'),resumeDownload:async()=>calls.push('resume'),getDownloadStatus:async()=>({status})},writeNativeDownload:(_,__,data)=>{record=data},setRemoteTitles:fn=>{titles=fn(titles)},window:{alert:message=>calls.push(message)}},'toggleDownloadPause');
 return {action,calls,result:()=>({record,titles,busy})};
}
test('Pause preserves bytes and shows paused state',async()=>{const h=harness('paused');await h.action({id:'7',mediaType:'movie'});assert.deepEqual(h.calls,['pause']);assert.equal(h.result().record.status,'paused');assert.equal(h.result().record.progress,35);assert.equal(h.result().titles[0].downloadStatus,'paused');assert.equal(h.result().busy.size,0)});
test('Continue resumes the same download',async()=>{const h=harness('pending','paused');await h.action({id:'7',mediaType:'movie'});assert.deepEqual(h.calls,['resume']);assert.equal(h.result().record.downloadId,42);assert.equal(h.result().record.status,'downloading')});
test('A download finishing during Pause stays completed',async()=>{const h=harness('complete');await h.action({id:'7',mediaType:'movie'});assert.equal(h.result().record.status,'complete');assert.equal(h.result().titles[0].downloadStatus,'ready')});
test('Legacy downloads do not receive unsupported pause commands',async()=>{const h=harness('running','downloading',false);await h.action({id:'7',mediaType:'movie'});assert.equal(h.calls.length,0)});
function pip(video){const start=player.indexOf('    const action = (event: Event)');return load(player.slice(start,player.indexOf('    window.addEventListener("smaj:pip-action"',start)),{videoRef:{current:video}},'action')}
test('PiP actions play and pause the actual video',()=>{let plays=0,pauses=0;const v={paused:true,play:async()=>{plays++},pause:()=>{pauses++}};const action=pip(v);action({detail:'toggle'});v.paused=false;action({detail:'toggle'});assert.equal(plays,1);assert.equal(pauses,1)});
test('PiP ten-second seeking respects video bounds',()=>{const v={currentTime:4,duration:12};const action=pip(v);action({detail:'back'});assert.equal(v.currentTime,0);action({detail:'forward'});assert.equal(v.currentTime,10);action({detail:'forward'});assert.equal(v.currentTime,12)});
test('PiP ignores unmounted videos and unknown actions',()=>{pip(null)({detail:'toggle'});const v={currentTime:5,duration:12};pip(v)({detail:'unknown'});assert.equal(v.currentTime,5)});
