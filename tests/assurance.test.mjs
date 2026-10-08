import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../lib/store.mjs';
import {today,jalaliTimestamp,persianDateOf} from '../public/model.mjs';
import {qualityBadge,qualityBanner} from '../public/tracking.mjs';
const date=today();
const fields={date,operator:'کنترل پروژه',document:'REQ-01',order:'',note:''};
const base={scopeType:'tube',scopeLocation:'',project:'پروژه A',requester:'کنترل پروژه',supplier:'مسئول انبار',requiredDate:date,requiredTime:'00:00',dueDate:persianDateOf(Date.now()+86400000),dueTime:'23:59',freshnessHours:24};
const response={responseStatus:'received',respondent:'مسئول انبار',evidenceRef:'صورت‌شمارش ۱',asOfDate:date,asOfTime:'00:00',completeConfirmed:true,zeroConfirmed:true};
const tube={type:'tube',material:'ST37',location:'A',diameter:60.3,thickness:2,length:6,count:1,remnant:false};
const run=(s,kind,p,req=randomUUID())=>s.command({requestId:req,revision:s.revision(),kind,payload:{...fields,...p}},'shared-account');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-quality-')),file=path.join(dir,'inventory.sqlite'),s=openStore(file);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});return {s,dir,file};}
const request=(s,p={})=>run(s,'data_request',{...base,...p}).dataRequestId;
const answer=(s,id,p={})=>run(s,'data_response',{...response,dataRequestId:id,...p});
const verify=(s,id)=>run(s,'data_verify',{dataRequestId:id,reviewConfirmed:true});
const notify=(s,id,p={})=>run(s,'data_followup',{dataRequestId:id,followupType:'notify',contact:s.assurance.detail(id).supplier,channel:'نامه',reference:'LETTER-01',note:'درخواست به مخاطب تحویل شد',...p});
test('no records means unknown; explicit zero needs complete warehouse response and review',t=>{
 const {s}=setup(t);assert.equal(s.state().dataQuality.tube.status,'unknown');assert.equal(s.state().dataQuality.tube.zeroConfirmed,false);
 const id=request(s);assert.equal(s.assurance.detail(id).notificationPending,true);assert.equal(s.assurance.detail(id).nextOwner,'کنترل پروژه');
 assert.throws(()=>answer(s,id,{zeroConfirmed:false}));assert.equal(s.assurance.detail(id).status,'waiting');
 answer(s,id);assert.equal(s.state().dataQuality.tube.status,'received');assert.equal(s.state().dataQuality.tube.zeroConfirmed,false);assert.equal(s.assurance.detail(id).nextOwner,'کنترل پروژه');
 verify(s,id);assert.equal(s.state().dataQuality.tube.status,'verified');assert.equal(s.state().dataQuality.tube.zeroConfirmed,true);assert.equal(s.state().dataQuality.sheet.status,'unknown');
 const detail=s.assurance.detail(id);assert.equal(detail.events.length,3);assert.equal(detail.respondent,'مسئول انبار');assert.equal(detail.verifier,'کنترل پروژه');assert.equal(detail.events[0].actor,'shared-account');assert.equal(detail.snapshot.summary.tube.count,0);
});
test('notification, overdue supply and pending recipient review are separate',t=>{
 const {s}=setup(t);run(s,'receipt',tube);const id=request(s);const at=Date.parse(s.assurance.detail(id).dueAt)+1;
 let q=s.assurance.query(1,at).requests[0];assert.equal(q.overdue,true);assert.equal(q.notificationPending,true);assert.equal(q.nextOwner,'کنترل پروژه');
 notify(s,id);q=s.assurance.query(1,at).requests[0];assert.equal(q.notificationPending,false);assert.equal(q.nextOwner,'مسئول انبار');
 answer(s,id);q=s.assurance.query(1,Date.now()).requests[0];assert.equal(q.status,'received');assert.equal(q.overdue,false);assert.equal(q.deliveryLate,false);assert.equal(q.nextOwner,'کنترل پروژه');assert.equal(s.assurance.assess({...q,dueAt:new Date(Date.parse(q.receivedAt)-1).toISOString()}).deliveryLate,true);assert.equal(s.state().tracking.awaitingReview,1);
 assert.equal(s.state().summary.tube.total,6);
});
test('unavailable and partial answers cannot certify stock or manufacture zero',t=>{
 const {s}=setup(t);run(s,'receipt',tube);const id=request(s);notify(s,id);
 assert.throws(()=>answer(s,id,{responseStatus:'unavailable',note:''}));
 answer(s,id,{responseStatus:'unavailable',note:'آمار فعلی تهیه نشده است'});assert.equal(s.state().summary.tube.total,6);assert.equal(s.state().dataQuality.tube.status,'unavailable');assert.equal(s.assurance.detail(id).asOf,null);assert.equal(s.assurance.detail(id).snapshot,null);assert.throws(()=>verify(s,id));
 answer(s,id,{responseStatus:'partial',note:'ردیف B شمارش نشده است'});assert.equal(s.state().dataQuality.tube.status,'partial');assert.throws(()=>verify(s,id));
 answer(s,id);verify(s,id);assert.equal(s.state().dataQuality.tube.usable,true);assert.equal(s.assurance.detail(id).events.length,6);
});
test('location coverage stays local; later ledger changes require fresh response',t=>{
 const {s}=setup(t);const a=run(s,'receipt',tube).pieceIds[0],id=request(s,{scopeLocation:'A'});answer(s,id);
 run(s,'receipt',{...tube,location:'B'});verify(s,id);let state=s.state();assert.equal(state.dataQuality.tube.status,'unknown');assert.equal(state.racks.find(r=>r.location==='A').quality.status,'verified');assert.equal(state.racks.find(r=>r.location==='B').quality.status,'unknown');
 run(s,'correct',{pieceId:a,length:5.8,remnant:false,note:'اصلاح اندازه'});assert.equal(s.state().racks.find(r=>r.location==='A').quality.status,'changed');assert.equal(s.assurance.detail(id).snapshot.summary.tube.total,6);
 answer(s,id);run(s,'reserve',{pieceId:a,order:'JOB'});assert.throws(()=>verify(s,id),e=>e.status===409);assert.equal(s.assurance.detail(id).status,'received');answer(s,id);verify(s,id);assert.equal(s.assurance.detail(id).snapshot.summary.tube.reserved,1);
});
test('freshness expires based on observation time, independently of refresh or review time',t=>{
 const {s}=setup(t),id=request(s);answer(s,id);verify(s,id);const expiry=Date.parse(s.assurance.detail(id).asOf)+24*3600000+1;
 const q=s.assurance.query(1,expiry).requests[0];assert.equal(q.quality,'stale');assert.equal(q.usable,false);assert.equal(q.nextOwner,'مسئول انبار');assert.equal(s.assurance.quality('tube','',expiry).zeroConfirmed,false);
});
test('all-material confirmation must explicitly acknowledge missing-category zeros',t=>{
 const {s}=setup(t);run(s,'receipt',tube);const id=request(s,{scopeType:'all'});assert.throws(()=>answer(s,id,{zeroConfirmed:false}));answer(s,id);verify(s,id);const state=s.state();assert.equal(state.dataQuality.tube.zeroConfirmed,false);assert.equal(state.dataQuality.sheet.zeroConfirmed,true);assert.equal(state.dataQuality.profile.status,'verified');
 const narrow=request(s,{scopeLocation:'B'});assert.equal(s.state().dataQuality.tube.usable,false);run(s,'data_cancel',{dataRequestId:narrow,note:'درخواست تکراری، پیگیری با درخواست جامع'});assert.equal(s.state().dataQuality.tube.usable,true);assert.equal(s.assurance.detail(narrow).status,'cancelled');assert.throws(()=>answer(s,narrow));
});
test('tracking commands are idempotent, transactional and require evidence',t=>{
 const {s}=setup(t),id=randomUUID(),command={requestId:id,revision:0,kind:'data_request',payload:{...fields,...base}};
 const first=s.command(command,'account'),retry=s.command(command,'account');assert.equal(first.dataRequestId,retry.dataRequestId);assert.equal(retry.duplicate,true);assert.equal(s.assurance.query().total,1);
 assert.throws(()=>notify(s,first.dataRequestId,{reference:''}));assert.throws(()=>notify(s,first.dataRequestId,{contact:'مخاطب دیگر'}));assert.equal(s.assurance.detail(first.dataRequestId).notifiedAt,null);assert.equal(s.history().total,1);
 assert.throws(()=>run(s,'data_verify',{dataRequestId:first.dataRequestId,reviewConfirmed:true}));assert.throws(()=>request(s,{freshnessHours:0}));assert.throws(()=>request(s,{requiredTime:'25:00'}));assert.throws(()=>request(s,{scopeType:'other'}));assert.throws(()=>request(s,{dueDate:date,dueTime:'00:00'}));assert.equal(s.assurance.query().total,1);
 const stored=JSON.stringify(s.assurance.detail(first.dataRequestId));// Persistent reopen and backup are exercised by the migration test below.
 assert.ok(stored.includes('D-000001'));
});
test('schema v1 migrates atomically, keeps old pieces and adds persistent request history',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-migrate-')),file=path.join(dir,'old.sqlite');const old=new DatabaseSync(file);old.exec(fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 old.exec("INSERT INTO events(id,kind,document,operation_date,operator,payload,actor,recorded_at) VALUES('e','receipt','OPEN','1405/07/16','warehouse','{}','old','2026-10-08T00:00:00Z'); INSERT INTO material_groups(id,group_key,type,material,diameter_um,thickness_um,created_at) VALUES('g','g','tube','ST37',60300,2000,'2026-10-08T00:00:00Z'); INSERT INTO locations(id,name_key,name) VALUES('l','a','A'); INSERT INTO pieces(id,group_id,location_id,length_um,status,receipt_event_id,created_at,updated_at,last_event_id) VALUES('p','g','l',6000000,'available','e','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z','e'); UPDATE meta SET revision=7;");old.close();
 let s=openStore(file);try{assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(s.revision(),7);assert.equal(s.piece('p').length,6);const id=request(s);notify(s,id);answer(s,id);verify(s,id);const backup=path.join(dir,'backup.sqlite');s.backup(backup);s.close();s=openStore(backup);assert.equal(s.piece('p').length,6);assert.equal(s.assurance.detail(id).status,'verified');assert.equal(s.assurance.detail(id).events.length,4);assert.equal(s.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(s.db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('report preserves declared identities, notification reference and server timestamps',t=>{
 const {s}=setup(t),id=request(s,{supplier:'=UNSAFE()'});notify(s,id);answer(s,id);verify(s,id);const rows=s.assurance.report();assert.equal(rows.length,8);assert.ok(rows.every(r=>r.length===rows[0].length));assert.ok(rows.flat().includes('LETTER-01'));assert.ok(rows.flat().includes('shared-account'));assert.ok(rows.flat().includes('صورت‌شمارش ۱'));
});
test('Tehran date/time conversion and user-facing labels are escaped',()=>{
 assert.equal(jalaliTimestamp('1405/07/16','08:00'),'2026-10-08T04:30:00.000Z');assert.equal(jalaliTimestamp('1405/13/01','08:00'),null);
 const html=qualityBadge({usable:false,label:'<script>alert(1)</script>'});assert.ok(!html.includes('<script>'));assert.ok(qualityBanner({tracking:{open:1,overdue:1,notificationPending:0,awaitingReview:0}}).includes('گذشته از مهلت'));
});
