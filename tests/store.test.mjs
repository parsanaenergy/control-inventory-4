import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../lib/store.mjs';
import {jalaliDay} from '../public/model.mjs';
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-store-')),file=path.join(dir,'stock.sqlite'),store=openStore(file);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,file,store};}
const fields={operator:'انباردار',document:'INV-001',date:'1405/07/16',order:'',note:''};
const tube={...fields,type:'tube',material:'ST37',location:'A',diameter:60.3,thickness:2,length:6,count:1,remnant:false};
const run=(s,kind,payload,revision=s.revision(),requestId=randomUUID())=>s.command({requestId,revision,kind,payload:{...fields,...payload}},'test-owner');
test('dimensions, grouping, true totals and pagination',t=>{
 const {store:s}=setup(t);assert.equal(s.state().racks.length,0);
 run(s,'receipt',{...tube,count:25});run(s,'receipt',{...tube,length:1.25,remnant:true});run(s,'receipt',{...tube,thickness:3});
 run(s,'receipt',{...tube,type:'sheet',thickness:4,length:2000,sheetWidth:1000,count:2});
 run(s,'receipt',{...tube,type:'profile',width:40,height:60,length:3,count:2});run(s,'receipt',{...tube,type:'profile',width:60,height:40,length:2});
 const state=s.state();assert.deepEqual(state.summary.tube,{count:27,total:157.25,freeAmount:157.25,reserved:0});assert.equal(state.summary.sheet.total,4);assert.equal(state.summary.profile.total,8);
 assert.equal(state.racks.length,4);const rack=state.racks.find(r=>r.type==='tube'&&r.thickness===2);
 assert.equal(s.rackPieces(rack.rackId).pieces.length,24);const second=s.rackPieces(rack.rackId,2);assert.equal(second.pieces.length,2);assert.equal(second.pieces.at(-1).length,1.25);assert.equal(second.pieces.at(-1).remnant,true);
 const profile=state.racks.find(r=>r.type==='profile');assert.equal(profile.width,60);assert.equal(profile.height,40);assert.equal(profile.count,3);
 const sheet=s.allPieces().find(p=>p.group.type==='sheet');assert.equal(sheet.width,1000);assert.equal(sheet.length,2000);assert.equal(sheet.group.width,null);
});
test('reserve, release, issue, return, transfer and audited correction',t=>{
 const {store:s}=setup(t);const p=run(s,'receipt',tube).pieceIds[0];
 run(s,'reserve',{pieceId:p,order:'JOB-1'});assert.equal(s.state().summary.tube.freeAmount,0);assert.equal(s.state().summary.tube.reserved,1);
 assert.throws(()=>run(s,'reserve',{pieceId:p,order:'JOB-1'}));assert.throws(()=>run(s,'issue',{pieceId:p,order:'JOB-2'}));assert.throws(()=>run(s,'release',{pieceId:p,order:'JOB-2'}));
 run(s,'transfer',{pieceId:p,location:'B'});assert.equal(s.piece(p).order,'JOB-1');assert.equal(s.state().summary.tube.total,6);
 run(s,'correct',{pieceId:p,length:5.9,remnant:true,note:'اصلاح اندازه‌گیری'});assert.equal(s.piece(p).length,5.9);assert.equal(s.piece(p).order,'JOB-1');
 const correction=s.history(1,p).events.find(e=>e.kind==='correct');assert.equal(correction.payload.before.length,6);assert.equal(correction.payload.after.length,5.9);
 run(s,'release',{pieceId:p,order:'JOB-1'});assert.equal(s.piece(p).status,'available');run(s,'reserve',{pieceId:p,order:'JOB-1'});
 run(s,'issue',{pieceId:p,order:'JOB-1'});assert.equal(s.state().summary.tube.count,0);assert.equal(s.allPieces().length,1);assert.equal(s.piece(p).status,'issued');assert.throws(()=>run(s,'issue',{pieceId:p,note:'مصرف'}));
 run(s,'return',{pieceId:p});assert.equal(s.state().summary.tube.total,5.9);assert.equal(s.piece(p).order,'');assert.equal(s.history(1,p).total,8);
});
test('retry is exactly once, stale writers conflict, invalid receipt rolls back',t=>{
 const {store:s}=setup(t);const id=randomUUID(),command={requestId:id,revision:0,kind:'receipt',payload:tube};
 const first=s.command(command,'owner');run(s,'receipt',{...tube,length:2});const retry=s.command(command,'owner');assert.equal(retry.duplicate,true);assert.equal(retry.eventId,first.eventId);assert.equal(s.allPieces().length,2);assert.equal(retry.revision,2);
 assert.throws(()=>s.command({...command,payload:{...tube,count:2}},'owner'),e=>e.status===409);assert.throws(()=>run(s,'receipt',tube,0),e=>e.status===409);
 const before=s.state();assert.throws(()=>run(s,'receipt',{...tube,material:'new',location:'new',count:0}));assert.deepEqual(s.state(),before);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM material_groups').get().n,1);assert.equal(s.history().total,2);
 assert.throws(()=>run(s,'receipt',{...tube,thickness:35}));assert.throws(()=>run(s,'receipt',{...tube,length:0}));assert.throws(()=>run(s,'receipt',{...tube,date:'1405/13/01'}));
});
test('reopen and consistent backup preserve stock, request history and database integrity',t=>{
 const {store:s,file,dir}=setup(t);const result=run(s,'receipt',{...tube,count:3});run(s,'reserve',{pieceId:result.pieceIds[0],order:'ORDER'});
 const second=openStore(file);assert.deepEqual(second.state(),s.state());second.close();
 const backup=path.join(dir,'backup.sqlite');s.backup(backup);assert.throws(()=>s.backup(backup));const restored=openStore(backup);
 try{assert.deepEqual(restored.state(),s.state());assert.equal(restored.history().total,2);assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM requests').get().n,2);}finally{restored.close();}
});
test('Persian dates reject invalid month ends and handle leap years',()=>{
 assert.notEqual(jalaliDay('۱۳۹۹/۱۲/۳۰'),null);assert.equal(jalaliDay('1400/12/30'),null);assert.equal(jalaliDay('1405/07/31'),null);assert.equal(jalaliDay('1405/01/00'),null);assert.equal(jalaliDay('2026/10/08'),null);assert.equal(jalaliDay('1405/01/02')-jalaliDay('1405/01/01'),1);
});
