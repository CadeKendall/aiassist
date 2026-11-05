import { contextBridge, ipcRenderer } from 'electron';
import type { StudioBridge, AppEvent } from '../shared/types';
const bridge:StudioBridge={
 connect:()=>ipcRenderer.invoke('studio:connect'),ask:r=>ipcRenderer.invoke('studio:ask',r),cancel:()=>ipcRenderer.invoke('studio:cancel'),
 onEvent:listener=>{const handle=(_:Electron.IpcRendererEvent,event:AppEvent)=>listener(event);ipcRenderer.on('studio:event',handle);return()=>ipcRenderer.removeListener('studio:event',handle);},
 listLessons:()=>ipcRenderer.invoke('studio:list'),saveLesson:l=>ipcRenderer.invoke('studio:save',l),loadLesson:id=>ipcRenderer.invoke('studio:load',id),deleteLesson:id=>ipcRenderer.invoke('studio:delete',id),
 exportLesson:l=>ipcRenderer.invoke('studio:export',l),importLesson:()=>ipcRenderer.invoke('studio:import'),setAlwaysOnTop:v=>ipcRenderer.invoke('studio:pin',v),listScreens:()=>ipcRenderer.invoke('studio:screens'),captureScreen:id=>ipcRenderer.invoke('studio:capture',id)
};
contextBridge.exposeInMainWorld('studio',bridge);
