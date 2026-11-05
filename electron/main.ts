import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { mkdir, cp, access } from 'node:fs/promises';
import { CodexClient } from './assistant-backend';
import { LessonStore } from './storage';
import * as platform from './platform';
import { validateLesson } from '../shared/scene';
let win:BrowserWindow|undefined;
let codex:CodexClient|undefined;
let unregister:undefined|(()=>void);
const legacyData=path.join(app.getPath('appData'),'codex-visual-studio');
if(process.env.STUDIO_USER_DATA) app.setPath('userData',process.env.STUDIO_USER_DATA);
else app.setPath('userData',path.join(app.getPath('appData'),'aiassist'));
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
else {
 app.on('second-instance',()=>{win?.show();win?.focus();});
 app.whenReady().then(async()=>{
  const data=app.getPath('userData');if(!process.env.STUDIO_USER_DATA){const dest=path.join(data,'lessons');try{await access(dest);}catch{try{await cp(path.join(legacyData,'lessons'),dest,{recursive:true,errorOnExist:true,force:false});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}}const workspace=path.join(data,'workspace');await mkdir(workspace,{recursive:true});
  const lessons=new LessonStore(path.join(data,'lessons'));
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  win=new BrowserWindow({width:1440,height:940,minWidth:760,minHeight:620,title:'AI Assist',backgroundColor:'#f7f5ef',autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  codex=new CodexClient(workspace,event=>{if(win&&!win.isDestroyed())win.webContents.send('studio:event',event);});
  const handle=(channel:string,fn:(...args:any[])=>unknown)=>ipcMain.handle(channel,(event,...args)=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted IPC sender.');return fn(...args);});
  handle('studio:connect',()=>codex!.connect());handle('studio:ask',r=>codex!.ask(r));handle('studio:cancel',()=>codex!.cancel());
  handle('studio:list',()=>lessons.list());handle('studio:save',l=>lessons.save(validateLesson(l)));handle('studio:load',id=>lessons.load(id));handle('studio:delete',id=>lessons.delete(id));
  handle('studio:export',l=>platform.exportLesson(win!,validateLesson(l)));handle('studio:import',()=>platform.importLesson(win!));
  handle('studio:pin',v=>{if(typeof v!=='boolean')throw new Error('Invalid window setting.');win!.setAlwaysOnTop(v);});
  handle('studio:screens',()=>platform.listScreens());handle('studio:capture',id=>{if(typeof id!=='string'||id.length>200)throw new Error('Invalid screen.');return platform.captureScreen(id);});
  unregister=platform.registerFocusHotkey(win);
  win.once('ready-to-show',()=>win?.show());
  await win.loadFile(path.join(__dirname,'../dist/index.html'));
 }).catch(error=>{console.error('Application startup failed:',error);app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{unregister?.();codex?.stop();});
}
