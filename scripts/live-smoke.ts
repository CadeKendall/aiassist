import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodexClient } from '../electron/assistant-backend';
import type { AppEvent,Scene } from '../shared/types';
const cwd=path.resolve('.smoke-data/workspace');await mkdir(cwd,{recursive:true});
const events:{type:string;detail?:string}[]=[];
let scene:Scene={version:1,title:'Empty workspace',description:'',kind:'3d',parts:[],notes:[]};
let threadId:string|undefined;
let resolveDone:((status:string)=>void)|undefined;
const client=new CodexClient(cwd,(event:AppEvent)=>{events.push({type:event.type,detail:event.type==='error'?event.message:event.type==='connection'?event.connection.message:event.type==='done'?event.status:undefined});if(event.type==='scene')scene=event.scene;if(event.type==='thread')threadId=event.threadId;if(event.type==='done')resolveDone?.(event.status);if(event.type==='connection'||event.type==='error'||event.type==='scene'||event.type==='done')console.log(JSON.stringify(event.type==='scene'?{type:'scene',title:event.scene.title,kind:event.scene.kind}:event));});
async function turn(text:string){let timer:ReturnType<typeof setTimeout>;const done=new Promise<string>((resolve,reject)=>{resolveDone=resolve;timer=setTimeout(()=>reject(new Error('Live turn timed out after 180 seconds')),180000);});try{await client.ask({text,scene,threadId});const status=await done;if(status!=='completed')throw new Error(`Turn ended ${status}`);}finally{clearTimeout(timer!);resolveDone=undefined;}}
try {
 const connection=await client.connect();if(connection.state!=='ready')throw new Error(connection.message);
 await turn('Create a line chart from exactly these user-provided measurements: x=0 y=2, x=1 y=4, x=2 y=3. X is time in seconds, Y is position in meters. One series with id measured. Label the source as user-provided data. Use the drawing tool.');
 if(scene.kind!=='chart'||JSON.stringify(scene.chart?.series[0].points.map(p=>[p.x,p.y]))!==JSON.stringify([[0,2],[1,4],[2,3]]))throw new Error('Live chart did not preserve exact supplied data.');
 await turn('Keep every data point unchanged. Change only the measured series color to #be4b32 and title to Measured motion.');
 if(scene.title!=='Measured motion'||scene.chart?.series[0].color!=='#be4b32'||JSON.stringify(scene.chart?.series[0].points.map(p=>[p.x,p.y]))!==JSON.stringify([[0,2],[1,4],[2,3]]))throw new Error('Live follow-up did not preserve data and apply edit.');
 client.stop();
 const reconnect=await client.connect();if(reconnect.state!=='ready')throw new Error(reconnect.message);
 await turn('Continue this saved lesson. Change only the title to Resumed motion. Preserve all data and the series color.');
 if(scene.title as string!=='Resumed motion')throw new Error('Resume failed.');
 await writeFile('.smoke-data/live-result.json',JSON.stringify({verifiedAt:new Date().toISOString(),model:connection.model,threadId,scene,events},null,2));
 console.log('PASS: real Codex drawing, exact data, targeted follow-up and persisted thread resume.');
}finally{client.stop();}
