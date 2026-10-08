import {createAssurance} from './assurance.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {norm,digits,jalaliDay,types} from '../public/model.mjs';
export class InventoryError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const ensure=(ok,message,status=400)=>{if(!ok)throw new InventoryError(message,status);};
const text=(v,name,max=200,required=true)=>{ensure(typeof v==='string',name+' معتبر نیست.');const t=v.trim();ensure((!required||t)&&t.length<=max,name+' را درست وارد کنید.');return t;};
const unit=(v,factor,max,name)=>{ensure(typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max,name+' باید عدد مثبت باشد.');const n=v*factor;ensure(Math.abs(n-Math.round(n))<0.00001,'دقت '+name+' بیشتر از حد مجاز است.');return Math.round(n);};
const id=()=>randomUUID();
export function openStore(filename){
  fs.mkdirSync(path.dirname(filename),{recursive:true});const db=new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const version=db.prepare('PRAGMA user_version').get().user_version;ensure(version<=2,'نسخه پایگاه داده جدیدتر از این برنامه است.',500);
  try{db.exec('BEGIN IMMEDIATE');db.exec(fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));db.exec(fs.readFileSync(new URL('../db/schema-v2.sql',import.meta.url),'utf8'));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  const revision=()=>db.prepare('SELECT revision FROM meta WHERE id=1').get().revision;
  function location(name){name=text(name,'مکان',100);const key=norm(name),old=db.prepare('SELECT * FROM locations WHERE name_key=?').get(key);if(old)return old.id;const locId=id();db.prepare('INSERT INTO locations(id,name_key,name) VALUES(?,?,?)').run(locId,key,name);return locId;}
  function group(payload,now){
    const type=payload.type;ensure(Object.hasOwn(types,type),'نوع ماده معتبر نیست.');
    const material=text(payload.material,'جنس یا پوشش',80),thickness=unit(payload.thickness,1000,10000,'ضخامت');
    let diameter=null,width=null,height=null;
    if(type==='tube'){diameter=unit(payload.diameter,1000,100000,'قطر');ensure(diameter>2*thickness,'قطر خارجی باید از دو برابر ضخامت بیشتر باشد.');}
    if(type==='profile'){width=unit(payload.width,1000,100000,'عرض مقطع');height=unit(payload.height,1000,100000,'ارتفاع مقطع');ensure(Math.min(width,height)>2*thickness,'ابعاد مقطع باید از دو برابر ضخامت بیشتر باشند.');if(width<height)[width,height]=[height,width];}
    const key=JSON.stringify([type,norm(material),thickness,diameter,width,height]),old=db.prepare('SELECT id FROM material_groups WHERE group_key=?').get(key);if(old)return old.id;
    const groupId=id();db.prepare('INSERT INTO material_groups(id,group_key,type,material,diameter_um,thickness_um,width_um,height_um,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(groupId,key,type,material,diameter,thickness,width,height,now);return groupId;
  }
  function serializedGroup(g){return {id:g.group_id??g.id,type:g.type,material:g.material,diameter:g.diameter_um===null?null:g.diameter_um/1000,thickness:g.thickness_um/1000,width:g.group_width_um===undefined?(g.width_um===null?null:g.width_um/1000):(g.group_width_um===null?null:g.group_width_um/1000),height:g.height_um===null?null:g.height_um/1000};}
  const pieceQuery='SELECT p.*,g.type,g.material,g.diameter_um,g.thickness_um,g.width_um AS group_width_um,g.height_um,l.name AS location FROM pieces p JOIN material_groups g ON g.id=p.group_id JOIN locations l ON l.id=p.location_id';
  function serializedPiece(row){return {id:row.id,code:(row.type==='tube'?'T':row.type==='sheet'?'S':'P')+'-'+String(row.serial).padStart(6,'0'),group:serializedGroup(row),groupId:row.group_id,locationId:row.location_id,location:row.location,length:row.length_um/(row.type==='sheet'?1000:1e6),width:row.width_um===null?null:row.width_um/1000,remnant:!!row.remnant,status:row.status,reserved:row.status==='reserved',order:row.reservation_order,createdAt:row.created_at,updatedAt:row.updated_at};}
  function piece(pieceId){ensure(typeof pieceId==='string','قطعه معتبر نیست.');const row=db.prepare(pieceQuery+' WHERE p.id=?').get(pieceId);ensure(row,'قطعه پیدا نشد.',404);return serializedPiece(row);}
  const amount='CASE WHEN g.type=\'sheet\' THEN CAST(p.length_um AS REAL)*p.width_um/1e12 ELSE p.length_um/1e6 END';
  function state(){
    const rows=db.prepare('SELECT g.id AS group_id,g.type,g.material,g.diameter_um,g.thickness_um,g.width_um,g.height_um,p.location_id,l.name AS location,COUNT(*) AS count,SUM('+amount+') AS total,SUM(CASE WHEN p.status=\'available\' THEN 1 ELSE 0 END) AS free,SUM(CASE WHEN p.status=\'available\' THEN '+amount+' ELSE 0 END) AS freeAmount FROM pieces p JOIN material_groups g ON g.id=p.group_id JOIN locations l ON l.id=p.location_id WHERE p.status<>\'issued\' GROUP BY g.id,p.location_id ORDER BY g.type,g.diameter_um,g.thickness_um,g.material,l.name').all();
    const racks=rows.map(r=>({...serializedGroup(r),rackId:r.group_id+':'+r.location_id,locationId:r.location_id,location:r.location,count:r.count,total:r.total,free:r.free,freeAmount:r.freeAmount}));
    const summary=Object.fromEntries(Object.keys(types).map(type=>[type,{count:0,total:0,freeAmount:0,reserved:0}]));
    for(const r of racks){const s=summary[r.type];s.count+=r.count;s.total+=r.total;s.freeAmount+=r.freeAmount;s.reserved+=r.count-r.free;}
    const assuranceState=assurance.overview(racks);
    return {schema:2,revision:revision(),racks,summary,...assuranceState,locations:db.prepare('SELECT id,name FROM locations ORDER BY name').all()};
  }
  function rackPieces(rackId,page=1,size=24){
    const [groupId,locationId]=rackId.split(':');ensure(groupId&&locationId,'گروه معتبر نیست.');
    page=Number(page);size=Number(size);ensure(Number.isInteger(page)&&page>=1&&Number.isInteger(size)&&size>=1&&size<=60,'صفحه معتبر نیست.');
    const count=db.prepare('SELECT COUNT(*) AS n FROM pieces WHERE group_id=? AND location_id=? AND status<>\'issued\'').get(groupId,locationId).n;
    const rows=db.prepare(pieceQuery+' WHERE p.group_id=? AND p.location_id=? AND p.status<>\'issued\' ORDER BY p.length_um DESC,p.width_um DESC,p.serial LIMIT ? OFFSET ?').all(groupId,locationId,size,(page-1)*size);
    return {count,page,size,pieces:rows.map(serializedPiece)};
  }
  function history(page=1,pieceId=''){
    page=Number(page);ensure(Number.isInteger(page)&&page>=1,'صفحه معتبر نیست.');const where=pieceId?' WHERE e.piece_id=? OR EXISTS(SELECT 1 FROM pieces p WHERE p.id=? AND p.receipt_event_id=e.id)':'',params=pieceId?[pieceId,pieceId]:[];
    const total=db.prepare('SELECT COUNT(*) AS n FROM events e'+where).get(...params).n;
    const rows=db.prepare('SELECT e.*,p.serial,g.type FROM events e LEFT JOIN pieces p ON p.id=e.piece_id LEFT JOIN material_groups g ON g.id=p.group_id'+where+' ORDER BY e.recorded_at DESC,e.rowid DESC LIMIT 50 OFFSET ?').all(...params,(page-1)*50);
    return {total,page,events:rows.map(e=>({...e,payload:JSON.parse(e.payload),pieceCode:e.serial?(e.type==='tube'?'T':e.type==='sheet'?'S':'P')+'-'+String(e.serial).padStart(6,'0'):null}))};
  }
  function command(input,actor,actorRole='legacy'){
    ensure(input&&typeof input==='object','درخواست معتبر نیست.');const requestId=input.requestId;ensure(typeof requestId==='string'&&/^[a-zA-Z0-9_-]{8,120}$/.test(requestId),'شناسه ثبت معتبر نیست.');
    const digest=createHash('sha256').update(JSON.stringify({kind:input.kind,payload:input.payload})).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try{
      const previous=db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
      if(previous){ensure(previous.digest===digest,'شناسه قبلی برای درخواست متفاوت قابل استفاده نیست.',409);db.exec('COMMIT');return {...JSON.parse(previous.result),duplicate:true,revision:revision()};}
      ensure(input.revision===revision(),'موجودی در دستگاه دیگری تغییر کرده است؛ بازخوانی کنید و دوباره ثبت کنید.',409);
      const p=input.payload??{},kind=input.kind;
      ensure(['receipt','reserve','release','issue','return','transfer','correct','data_request','data_response','data_verify','data_followup','data_cancel'].includes(kind),'نوع ثبت معتبر نیست.');
      const operator=text(p.operator,'ثبت‌کننده',100),document=text(p.document,'شماره سند',100),date=text(p.date,'تاریخ',20);ensure(jalaliDay(date)!==null,'تاریخ شمسی معتبر وارد کنید.');
      const note=text(p.note??'','توضیح',2000,false),order=text(p.order??'','کد سفارش',100,false),eventId=id(),now=new Date().toISOString();
      let details={},pieceId=null;
      if(kind.startsWith('data_')){
        db.prepare('INSERT INTO events(id,kind,document,operation_date,operator,order_code,note,payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(eventId,kind,document,date,operator,order,note,'{}',actor,now);
        details=assurance.mutate(kind,{...p,operator},now,eventId);
        db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify(details),eventId);
      }else if(kind==='receipt'){
        const groupId=group(p,now),locId=location(p.location);
        const count=p.count;ensure(Number.isInteger(count)&&count>=1&&count<=1000,'تعداد ورود باید عدد صحیح بین ۱ تا ۱۰۰۰ باشد.');
        const length=unit(p.length,p.type==='sheet'?1000:1e6,p.type==='sheet'?1000000:1000,'طول');
        const width=p.type==='sheet'?unit(p.sheetWidth,1000,1000000,'عرض ورق'):null;ensure(typeof p.remnant==='boolean','وضعیت کامل یا باقیمانده را انتخاب کنید.');
        details={groupId,locationId:locId,group:serializedGroup(db.prepare('SELECT * FROM material_groups WHERE id=?').get(groupId)),location:db.prepare('SELECT name FROM locations WHERE id=?').get(locId).name,count,length:p.length,width:p.type==='sheet'?p.sheetWidth:null,length_um:length,width_um:width,remnant:p.remnant,pieceIds:[]};
        db.prepare('INSERT INTO events(id,kind,document,operation_date,operator,order_code,note,payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(eventId,kind,document,date,operator,order,note,'{}',actor,now);
        const insert=db.prepare('INSERT INTO pieces(id,group_id,location_id,length_um,width_um,remnant,status,receipt_event_id,created_at,updated_at,last_event_id) VALUES(?,?,?,?,?,?,\'available\',?,?,?,?)');
        for(let i=0;i<count;i++){const piece=id();insert.run(piece,groupId,locId,length,width,p.remnant?1:0,eventId,now,now,eventId);details.pieceIds.push(piece);}
        db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify(details),eventId);
      }else{
        const before=piece(p.pieceId);pieceId=before.id;details={before};
        if(kind==='reserve'){ensure(before.status==='available','فقط قطعه آزاد را می‌توان رزرو کرد.');ensure(order,'کد سفارش برای رزرو لازم است.');db.prepare('UPDATE pieces SET status=\'reserved\',reservation_order=? WHERE id=?').run(order,pieceId);}
        if(kind==='release'){ensure(before.status==='reserved','قطعه رزرو نیست.');ensure(order===before.order,'کد سفارش باید با رزرو فعلی برابر باشد.');db.prepare('UPDATE pieces SET status=\'available\',reservation_order=\'\' WHERE id=?').run(pieceId);}
        if(kind==='issue'){ensure(before.status!=='issued','قطعه قبلاً خارج شده است.');ensure(order||note,'کد سفارش یا علت مصرف عمومی لازم است.');ensure(before.status!=='reserved'||before.order===order,'این قطعه برای سفارش دیگری رزرو شده است.');db.prepare('UPDATE pieces SET status=\'issued\',reservation_order=\'\' WHERE id=?').run(pieceId);}
        if(kind==='return'){ensure(before.status==='issued','فقط قطعه خارج‌شده قابل برگشت است.');db.prepare('UPDATE pieces SET status=\'available\',reservation_order=\'\' WHERE id=?').run(pieceId);}
        if(kind==='transfer'){ensure(before.status!=='issued','قطعه خارج‌شده قابل انتقال نیست.');const locId=location(p.location);ensure(locId!==before.locationId,'مبدأ و مقصد باید متفاوت باشند.');db.prepare('UPDATE pieces SET location_id=? WHERE id=?').run(locId,pieceId);}
        if(kind==='correct'){
          ensure(before.status!=='issued','ابتدا قطعه را برگشت دهید.');ensure(note,'علت اصلاح را وارد کنید.');
          const length=unit(p.length,before.group.type==='sheet'?1000:1e6,before.group.type==='sheet'?1000000:1000,'طول'),width=before.group.type==='sheet'?unit(p.sheetWidth,1000,1000000,'عرض ورق'):null;ensure(typeof p.remnant==='boolean','وضعیت قطعه معتبر نیست.');
          db.prepare('UPDATE pieces SET length_um=?,width_um=?,remnant=? WHERE id=?').run(length,width,p.remnant?1:0,pieceId);
        }
        db.prepare('INSERT INTO events(id,kind,piece_id,document,operation_date,operator,order_code,note,payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(eventId,kind,pieceId,document,date,operator,order,note,'{}',actor,now);
        db.prepare('UPDATE pieces SET updated_at=?,last_event_id=? WHERE id=?').run(now,eventId,pieceId);
        details.after=piece(pieceId);db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify(details),eventId);
      }
      if(kind.startsWith('data_')){details.actorRole=actorRole;db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify(details),eventId);}
      db.prepare('UPDATE meta SET revision=revision+1 WHERE id=1').run();
      const result={ok:true,eventId,revision:revision(),pieceId,pieceIds:details.pieceIds??[],dataRequestId:details.dataRequestId??null};
      db.prepare('INSERT INTO requests(id,digest,event_id,result) VALUES(?,?,?,?)').run(requestId,digest,eventId,JSON.stringify(result));
      db.exec('COMMIT');return result;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function allPieces(){return db.prepare(pieceQuery+' ORDER BY p.serial').all().map(serializedPiece);}
  function backup(destination){ensure(!fs.existsSync(destination),'فایل پشتیبان از قبل وجود دارد.');db.exec("VACUUM INTO '"+destination.replaceAll("'","''")+"'");}
  const assurance=createAssurance(db,{ensure,text,id,stock:allPieces,revision});
  return {db,assurance,state,piece,rackPieces,history,command,allPieces,backup,revision,close:()=>db.close()};
}
