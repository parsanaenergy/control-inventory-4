import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../lib/store.mjs';
import {today,persianDateOf} from '../public/model.mjs';
// This checks application events and rendered markup with a minimal DOM adapter.
// It is not a visual browser test and does not emulate browser layout.
test('UI request, unavailable answer, complete zero response, review and history use real store',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-ui-')),s=openStore(path.join(dir,'stock.sqlite')),elements=new Map(),handlers=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},scrollIntoView(){},querySelectorAll(){return[];}});return elements.get(id);};
 const root=element('rn-material-demo');root.querySelectorAll=()=>[];root.addEventListener=(type,fn)=>handlers.set(type,fn);
 const old={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch,setInterval:globalThis.setInterval,FormData:globalThis.FormData};
 globalThis.document={getElementById:element,querySelector:()=>null};globalThis.window={addEventListener(){}};
 const cache=new Map();globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};globalThis.setInterval=()=>0;globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.records);}*[Symbol.iterator](){yield*this.entries;}};
 globalThis.fetch=async(url,options={})=>{
   try{const u=new URL(url,'http://local.test');let data;
     if(u.pathname==='/api/session')data={username:'test-admin',displayName:'کاربر آزمایش',role:'admin',roleTitle:'مدیر',individualAccounts:true};
     else if(u.pathname==='/api/state')data=s.state();
     else if(u.pathname==='/api/data-requests')data=s.assurance.query(u.searchParams.get('page')||1);
     else if(u.pathname==='/api/data-request')data=s.assurance.detail(u.searchParams.get('id'));
     else if(u.pathname==='/api/history')data=s.history();
     else if(u.pathname==='/api/commands')data=s.command(JSON.parse(options.body),'test-admin','admin');
     else throw new Error('Unexpected UI endpoint '+url);
     return {ok:true,status:200,json:async()=>data};
   }catch(e){return {ok:false,status:e.status??500,json:async()=>({error:e.message})};}
 };
 const click=action=>handlers.get('click')({target:{closest:()=>({dataset:{action},disabled:false})}});
 const submit=(kind,records)=>handlers.get('submit')({preventDefault(){},target:{id:'tracking-form',dataset:{kind},records}});
 try{
  await import('../public/app.mjs');await new Promise(resolve=>setImmediate(resolve));assert.ok(element('rn-stats').innerHTML.includes('نامشخص'));assert.ok(element('rn-session').textContent.includes('کاربر آزمایش'));
  await click('tracking');await click('trackingNew');assert.ok(element('rn-editor').innerHTML.includes('name="supplier"'));assert.ok(element('rn-editor').innerHTML.includes('name="dueTime"'));
  const date=today(),common={date,operator:'آزمایش',document:'TEST-01',note:''};
  await submit('data_request',{...common,scopeType:'tube',scopeLocation:'',requester:'کنترل پروژه',supplier:'<انبار>',project:'JOB',requiredDate:date,requiredTime:'00:00',dueDate:persianDateOf(Date.now()+86400000),dueTime:'23:59',freshnessHours:'24'});
  const id=s.assurance.query().requests[0].id;assert.ok(element('rn-tracking').innerHTML.includes('&lt;انبار&gt;'));assert.ok(element('rn-detail').innerHTML.includes('ابلاغ ثبت'));
  await click('trackingResponse');assert.ok(element('rn-editor').innerHTML.includes('value="unavailable"'));
  await submit('data_response',{...common,dataRequestId:id,responseStatus:'unavailable',respondent:'انبار',evidenceRef:'NOTE-1',note:'آمار آماده نیست'});assert.equal(s.state().dataQuality.tube.status,'unavailable');assert.ok(element('rn-stats').innerHTML.includes('نامشخص'));assert.equal(s.allPieces().length,0);
  await submit('data_response',{...common,dataRequestId:id,responseStatus:'received',respondent:'انبار',evidenceRef:'COUNT-1',asOfDate:date,asOfTime:'00:00',completeConfirmed:'yes',zeroConfirmed:'yes'});assert.equal(s.assurance.detail(id).status,'received');
  await click('trackingVerify');assert.ok(element('rn-editor').innerHTML.includes('name="reviewConfirmed"'));
  await submit('data_verify',{...common,dataRequestId:id,reviewConfirmed:'yes'});assert.equal(s.state().dataQuality.tube.zeroConfirmed,true);assert.ok(element('rn-stats').innerHTML.includes('تأییدشده'));assert.equal(cache.has('rn-visual-inventory-pending-v1'),false);
  await click('history');assert.ok(element('rn-history').innerHTML.includes('درخواست آمار'));assert.ok(element('rn-history').innerHTML.includes('D-000001'));assert.ok(!element('rn-message').textContent.includes('undefined'));
 }finally{Object.assign(globalThis,old);s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
