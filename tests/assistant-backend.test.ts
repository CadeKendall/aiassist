import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { CodexClient } from '../electron/assistant-backend';
import type { AppEvent, Scene } from '../shared/types';

const blank:Scene={version:1,title:'Blank',description:'',kind:'3d',parts:[],notes:[]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(delayTurn=false){
 const child=new EventEmitter() as ChildProcessWithoutNullStreams;
 const received:any[]=[];
 const stdout=new PassThrough();const stderr=new PassThrough();
 const send=(message:unknown)=>stdout.write(JSON.stringify(message)+'\n');
 const reply=(m:any,result:unknown)=>send({id:m.id,result});
 let turnCount=0;
 const stdin=new Writable({write(chunk,_encoding,callback){const m=JSON.parse(String(chunk));received.push(m);queueMicrotask(()=>{
  if(m.method==='initialize')reply(m,{});
  if(m.method==='account/read')reply(m,{account:{type:'chatgpt'}});
  if(m.method==='model/list')reply(m,{data:[{model:'test-model',isDefault:true}]});
  if(m.method==='thread/start'||m.method==='thread/resume')reply(m,{thread:{id:m.params.threadId??'thread-1'}});
  if(m.method==='turn/start'){turnCount++;if(!delayTurn){send({method:'turn/started',params:{threadId:'thread-1',turn:{id:`turn-${turnCount}`}}});reply(m,{turn:{id:`turn-${turnCount}`}});}}
  if(m.method==='turn/interrupt'){reply(m,{});send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:m.params.turnId,status:'interrupted'}}});}
 });callback();}});
 Object.assign(child,{stdout,stderr,stdin,kill:()=>{queueMicrotask(()=>child.emit('exit',0));return true;}});
 const events:AppEvent[]=[];const client=new CodexClient('.',e=>events.push(e),()=>child);
 return {client,events,received,send,reply,child};
}

test('valid drawing calls render; invalid/stale calls fail without replacing the scene',async()=>{
 const h=harness();try{
  await h.client.ask({text:'Draw',scene:blank});
  h.send({id:'tool-1',method:'item/tool/call',params:{threadId:'thread-1',turnId:'turn-1',tool:'replace_scene',arguments:{scene:{...blank,title:'Good'}}}});await tick();
  assert.equal(h.events.filter(e=>e.type==='scene').length,1);assert.equal(h.received.find(m=>m.id==='tool-1').result.success,true);
  h.send({id:'tool-2',method:'item/tool/call',params:{threadId:'thread-1',turnId:'turn-1',tool:'replace_scene',arguments:{scene:{...blank,kind:'chart'}}}});await tick();
  assert.equal(h.events.filter(e=>e.type==='scene').length,1);assert.equal(h.received.find(m=>m.id==='tool-2').result.success,false);
  h.send({id:'tool-3',method:'item/tool/call',params:{threadId:'thread-1',turnId:'old-turn',tool:'replace_scene',arguments:{scene:blank}}});await tick();
  assert.equal(h.received.find(m=>m.id==='tool-3').result.success,false);
 }finally{h.client.stop();}
});

test('a second request is rejected until cancellation completes',async()=>{
 const h=harness();try{await h.client.ask({text:'Draw',scene:blank});await assert.rejects(h.client.ask({text:'Again',scene:blank}),/already running/);await h.client.cancel();await tick();assert.ok(h.events.some(e=>e.type==='done'&&e.status==='interrupted'));await h.client.ask({text:'New request',scene:blank,threadId:'thread-1'});assert.equal(h.received.filter(m=>m.method==='turn/start').length,2);}finally{h.client.stop();}
});

test('cancel during turn startup interrupts the returned turn instead of leaving it running',async()=>{
 const h=harness(true);try{const ask=h.client.ask({text:'Draw',scene:blank});for(let i=0;i<10&&!h.received.some(m=>m.method==='turn/start');i++)await tick();const start=h.received.find(m=>m.method==='turn/start');assert.ok(start);await h.client.cancel();h.reply(start,{turn:{id:'turn-1'}});await ask;await tick();assert.ok(h.received.some(m=>m.method==='turn/interrupt'&&m.params.turnId==='turn-1'));assert.ok(h.events.some(e=>e.type==='done'&&e.status==='interrupted'));}finally{h.client.stop();}
});

test('late completed-turn output cannot change a subsequent request',async()=>{
 const h=harness();try{await h.client.ask({text:'First',scene:blank});h.send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}}});await tick();await h.client.ask({text:'Second',scene:blank,threadId:'thread-1'});h.send({method:'item/agentMessage/delta',params:{threadId:'thread-1',turnId:'turn-1',delta:'stale'}});h.send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}}});await tick();assert.equal(h.events.filter(e=>e.type==='done').length,1);assert.ok(!h.events.some(e=>e.type==='delta'&&e.text==='stale'));await assert.rejects(h.client.ask({text:'Third',scene:blank}),/already running/);}finally{h.client.stop();}
});

test('system actions are declined, and process failure terminates an active turn',async()=>{
 const h=harness();try{await h.client.ask({text:'Draw',scene:blank});h.send({id:99,method:'item/commandExecution/requestApproval',params:{}});await tick();assert.equal(h.received.find(m=>m.id===99).result.decision,'decline');h.child.emit('exit',1);await tick();assert.ok(h.events.some(e=>e.type==='connection'&&e.connection.state==='error'));assert.ok(h.events.some(e=>e.type==='done'&&e.status==='failed'));}finally{h.client.stop();}
});
