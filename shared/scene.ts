import { z } from 'zod';
import type { Lesson, Scene, ScenePatch } from './types';

const text = (max = 200) => z.string().max(max);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const number = z.number().finite().min(-1000000).max(1000000);
const vec3 = z.tuple([number, number, number]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const animation = z.object({ type:z.enum(['spin','oscillate']), axis:z.enum(['x','y','z']), speed:z.number().finite().min(-20).max(20), amplitude:z.number().finite().min(0).max(100).optional(), phase:number.optional() }).strict();
export const partSchema = z.object({id,label:text(),description:text(4000).optional(),shape:z.enum(['box','sphere','cylinder','cone','torus','arrow']),position:vec3,rotation:vec3.optional(),scale:z.tuple([z.number().positive().max(1000),z.number().positive().max(1000),z.number().positive().max(1000)]).optional(),color,opacity:z.number().min(0).max(1).optional(),dimensions:z.tuple([z.number().positive().max(1000),z.number().positive().max(1000),z.number().positive().max(1000)]).optional(),animation:animation.optional()}).strict();
export const chartSchema = z.object({type:z.enum(['line','bar','scatter']),xLabel:text(),yLabel:text(),source:text(2000).min(1),series:z.array(z.object({id,label:text(),color,points:z.array(z.object({x:number,y:number,label:text().optional()}).strict()).min(1).max(2000)}).strict()).min(1).max(12)}).strict();
export const diagramSchema = z.object({nodes:z.array(z.object({id,label:text(),x:number,y:number,description:text(4000).optional(),color}).strict()).min(1).max(100),edges:z.array(z.object({from:id,to:id,label:text().optional()}).strict()).max(300)}).strict();
export const sceneSchema = z.object({version:z.literal(1),title:text().min(1),description:text(6000),kind:z.enum(['3d','chart','diagram']),parts:z.array(partSchema).max(200),chart:chartSchema.optional(),diagram:diagramSchema.optional(),notes:z.array(text(2000)).max(30)}).strict();
export const patchSchema = z.object({title:text().min(1).optional(),description:text(6000).optional(),upsertParts:z.array(partSchema).max(200).optional(),removePartIds:z.array(id).max(200).optional(),chart:chartSchema.optional(),diagram:diagramSchema.optional(),notes:z.array(text(2000)).max(30).optional()}).strict();
const lessonSchema = z.object({id,title:text().min(1),updatedAt:z.string().datetime(),threadId:id.optional(),scene:sceneSchema,messages:z.array(z.object({id,role:z.enum(['user','assistant']),text:text(50000)}).strict()).max(500)}).strict();
function unique(ids:string[]) { if(new Set(ids).size !== ids.length) throw new Error('Each visual element needs a unique ID.'); }
export function validateScene(value:unknown):Scene {
 const scene=sceneSchema.parse(value) as Scene;
 unique(scene.parts.map(p=>p.id));
 if(scene.kind==='chart' && !scene.chart) throw new Error('A chart scene needs chart data.');
 if(scene.kind==='diagram' && !scene.diagram) throw new Error('A diagram scene needs nodes and edges.');
 if(scene.chart) { unique(scene.chart.series.map(s=>s.id)); if(scene.chart.series.reduce((n,s)=>n+s.points.length,0)>5000) throw new Error('Chart exceeds 5,000 data points.'); }
 if(scene.diagram) { unique(scene.diagram.nodes.map(n=>n.id)); const ids=new Set(scene.diagram.nodes.map(n=>n.id)); if(scene.diagram.edges.some(e=>!ids.has(e.from)||!ids.has(e.to))) throw new Error('Diagram edges must reference existing nodes.'); }
 return scene;
}
export function validateLesson(value:unknown):Lesson { const lesson=lessonSchema.parse(value) as Lesson; lesson.scene=validateScene(lesson.scene); return lesson; }
export function applyScenePatch(current:Scene,value:unknown):Scene {
 const patch=patchSchema.parse(value) as ScenePatch;
 unique((patch.upsertParts??[]).map(p=>p.id));
 const ids=new Set(current.parts.map(p=>p.id));
 if(patch.removePartIds?.some(i=>!ids.has(i))) throw new Error('Cannot remove a missing part.');
 const parts=new Map(current.parts.filter(p=>!patch.removePartIds?.includes(p.id)).map(p=>[p.id,p]));
 for(const p of patch.upsertParts??[]) parts.set(p.id,p);
 const {upsertParts:_,removePartIds:__,...rest}=patch;
 return validateScene({...current,...rest,parts:[...parts.values()]});
}
export const drawingTools = [
 { name:'replace_scene',description:'Create a visual explanation. Replaces the whole scene. Use 3d parts, exact chart point data with source, or diagram nodes and edges. IDs must remain stable on follow-ups. Color is #RRGGBB. Use update_scene for targeted edits.',inputSchema:z.toJSONSchema(z.object({scene:sceneSchema}).strict()) },
 { name:'update_scene',description:'Update the current scene without losing unchanged parts. upsertParts contains complete replacement or new parts by stable ID. Positions are absolute. Use removePartIds to remove. Chart/diagram data supplied here replace that whole subsection.',inputSchema:z.toJSONSchema(z.object({patch:patchSchema}).strict()) }
];
