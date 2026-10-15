const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsFixture={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/lib/voiceRecordingClock.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsFixture});
const {VoiceRecordingClock}=exportsFixture;
test('paused preview time stays fixed and resume appends active duration',()=>{let now=0;const clock=new VoiceRecordingClock(()=>now);now=6000;clock.pause();assert.equal(clock.seconds(),6);now=30000;assert.equal(clock.seconds(),6);clock.resume();now=35000;assert.equal(clock.seconds(),11);});
test('multiple pauses never count idle time or reset recorded audio duration',()=>{let now=0;const clock=new VoiceRecordingClock(()=>now);now=2000;clock.pause();clock.pause();now=5000;clock.resume();clock.resume();now=8000;clock.pause();now=20000;assert.equal(clock.seconds(),5);clock.resume();now=23000;assert.equal(clock.seconds(),8);});
test('zero-length recording remains zero until audio is captured',()=>{const clock=new VoiceRecordingClock(()=>1000);assert.equal(clock.seconds(),0);});

function recorderFixture() {
 let now=0,stops=0,flushes=0,sends=0,deleted=0,tracksStopped=0;
 const recorder={state:'recording',pause(){this.state='paused'},resume(){this.state='recording'},requestData(){flushes++},stop(){stops++;this.state='inactive'}};
 const sendAfterStopRef={current:false},clock=new VoiceRecordingClock(()=>now);
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/pages/private/MessagesPage.tsx'),'utf8');
 const begin=source.indexOf('  const pauseVoiceRecording ='),end=source.indexOf('  const sendVoiceNote =',begin);
 const context={recorderRef:{current:recorder},recordingClockRef:{current:clock},sendAfterStopRef,keepRecordingRef:{current:true},sendingVoice:false,setRecordingPaused:()=>{},clearVoicePreview:()=>deleted++,sendVoiceNote:()=>sends++,stopRecordingTimer:()=>{},stopRecordingTracks:()=>tracksStopped++,setRecording:()=>{},setRecordingSeconds:()=>{},setVoiceError:()=>{}};
 vm.createContext(context);vm.runInContext(source.slice(begin,end)+';globalThis.handlers={pauseVoiceRecording,resumeVoiceRecording,finishAndSendVoice,cancelVoiceRecording};',context);
 return{...context.handlers,recorder,clock,advance:ms=>now+=ms,stats:()=>({stops,flushes,sends,deleted,tracksStopped,sendRequested:sendAfterStopRef.current})};
}
test('pause flushes preview data and resume continues the same MediaRecorder',()=>{const f=recorderFixture();f.advance(6000);f.pauseVoiceRecording();assert.equal(f.recorder.state,'paused');assert.equal(f.stats().flushes,1);f.advance(5000);f.resumeVoiceRecording();assert.equal(f.recorder.state,'recording');f.advance(5000);assert.equal(f.clock.seconds(),11);});
test('send while paused stops once and defers sending until the final data arrives',()=>{const f=recorderFixture();f.pauseVoiceRecording();f.finishAndSendVoice();f.finishAndSendVoice();assert.equal(f.stats().stops,1);assert.equal(f.stats().sendRequested,true);assert.equal(f.stats().sends,0);});
test('deleting a paused note stops recording and microphone tracks without sending',()=>{const f=recorderFixture();f.pauseVoiceRecording();f.cancelVoiceRecording();assert.equal(f.stats().stops,1);assert.equal(f.stats().tracksStopped,1);assert.equal(f.stats().deleted,1);assert.equal(f.stats().sendRequested,false);assert.equal(f.stats().sends,0);});
