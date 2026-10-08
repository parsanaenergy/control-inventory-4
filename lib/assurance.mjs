import {createHash} from 'node:crypto';
import {norm,types,dataStatuses,jalaliTimestamp} from '../public/model.mjs';
export function createAssurance(db,{ensure,text,id,stock,revision}){
  const covers=(r,type,location)=> (r.scopeType==='all'||r.scopeType===type)&&(!r.scopeLocation||!!location&&norm(r.scopeLocation)===norm(location));
  const overlaps=(r,type,location)=> (r.scopeType==='all'||r.scopeType===type)&&(!location||!r.scopeLocation||norm(r.scopeLocation)===norm(location));
  function serialize(r){return {id:r.id,code:'D-'+String(r.serial).padStart(6,'0'),scopeType:r.scope_type,scopeLocation:r.scope_location,project:r.project,requester:r.requester,supplier:r.supplier,requiredAsOf:r.required_as_of,dueAt:r.due_at,freshnessHours:r.freshness_hours,status:r.status,requestedAt:r.requested_at,notifiedAt:r.notified_at,receivedAt:r.received_at,asOf:r.as_of_at,verifiedAt:r.verified_at,respondent:r.respondent,verifier:r.verifier,evidenceRef:r.evidence_ref,snapshot:r.snapshot?JSON.parse(r.snapshot):null};}
  function find(requestId){ensure(typeof requestId==='string','درخواست آمار معتبر نیست.');const r=db.prepare('SELECT * FROM data_requests WHERE id=?').get(requestId);ensure(r,'درخواست آمار پیدا نشد.',404);return serialize(r);}
  function capture(r,source=stock()){
    const pieces=source.filter(p=>(r.scopeType==='all'||p.group.type===r.scopeType)&&(!r.scopeLocation||norm(p.location)===norm(r.scopeLocation))&&p.status!=='issued').sort((a,b)=>a.id.localeCompare(b.id));
    const summary=Object.fromEntries((r.scopeType==='all'?Object.keys(types):[r.scopeType]).map(t=>[t,{count:0,total:0,free:0,reserved:0}]));
    for(const p of pieces){const s=summary[p.group.type];s.count++;s.total+=p.group.type==='sheet'?p.length*p.width/1e6:p.length;s[p.reserved?'reserved':'free']++;}
    const stockHash=createHash('sha256').update(JSON.stringify(pieces.map(p=>[p.id,p.group,p.locationId,p.length,p.width,p.remnant,p.status,p.order]))).digest('hex');
    return {revision:revision(),summary,stockHash};
  }
  function assess(r,now=Date.now(),currentHash){
    let quality=r.status;
    if(['received','verified'].includes(r.status)){
      if(!r.asOf||Date.parse(r.asOf)<now-r.freshnessHours*3600000)quality='stale';
      else if(currentHash!==undefined&&currentHash!==r.snapshot?.stockHash)quality='changed';
    }
    const awaiting=['waiting','partial','unavailable'].includes(r.status),overdue=awaiting&&now>Date.parse(r.dueAt);
    const nextOwner=r.status==='cancelled'||r.status==='verified'&&quality==='verified'?'':r.status==='received'&&quality==='received'?r.requester:!r.notifiedAt&&awaiting?r.requester:r.supplier;
    return {...r,quality,label:dataStatuses[quality],overdue,deliveryLate:!!r.receivedAt&&Date.parse(r.receivedAt)>Date.parse(r.dueAt),nextOwner,notificationPending:awaiting&&!r.notifiedAt,usable:quality==='verified'};
  }
  function all(){return db.prepare('SELECT * FROM data_requests ORDER BY serial DESC').all().map(serialize);}
  function query(page=1,now=Date.now()){
    page=Number(page);ensure(Number.isInteger(page)&&page>=1,'صفحه معتبر نیست.');const rows=all(),size=20,source=rows.length?stock():[];
    return {total:rows.length,page,size,requests:rows.slice((page-1)*size,page*size).map(r=>assess(r,now,['verified','received'].includes(r.status)?capture(r,source).stockHash:undefined))};
  }
  function detail(requestId){const r=find(requestId);return {...assess(r,Date.now(),['verified','received'].includes(r.status)?capture(r).stockHash:undefined),events:db.prepare("SELECT * FROM events WHERE json_extract(payload,'$.dataRequestId')=? ORDER BY rowid DESC").all(requestId).map(e=>({...e,payload:JSON.parse(e.payload)}))};}
  function quality(type,location='',now=Date.now(),rows=all(),hashes=new Map(),source){
    const relevant=rows.filter(r=>r.status!=='cancelled'&&overlaps(r,type,location));
    const assessed=relevant.map(r=>{const key=r.scopeType+'|'+norm(r.scopeLocation);if(!hashes.has(key))hashes.set(key,capture(r,source).stockHash);return assess(r,now,hashes.get(key));});
    const blocking=assessed.filter(r=>!r.usable);
    // A narrow location attestation cannot confirm a whole category or another location.
    const certificate=assessed.find(r=>covers(r,type,location));
    const reference=blocking[0]??certificate;
    const status=blocking[0]?.quality??(certificate?.usable?'verified':'unknown');
    return {status,label:dataStatuses[status],usable:status==='verified',requestId:reference?.id??null,code:reference?.code??'',nextOwner:reference?.nextOwner??'',notificationPending:reference?.notificationPending??false,overdue:blocking.some(r=>r.overdue),asOf:certificate?.asOf??null,verifiedAt:certificate?.verifiedAt??null,zeroConfirmed:status==='verified'&&certificate?.snapshot?.confirmedZeroTypes?.includes(type)||false,openRequests:blocking.length};
  }
  function overview(racks,now=Date.now()){
    const rows=all(),hashes=new Map(),source=rows.length?stock():[],dataQuality=Object.fromEntries(Object.keys(types).map(t=>[t,quality(t,'',now,rows,hashes,source)]));
    for(const rack of racks)rack.quality=quality(rack.type,rack.location,now,rows,hashes,source);
    const assessed=rows.filter(r=>r.status!=='cancelled').map(r=>{const key=r.scopeType+'|'+norm(r.scopeLocation);if(!hashes.has(key))hashes.set(key,capture(r,source).stockHash);return assess(r,now,hashes.get(key));});
    return {dataQuality,tracking:{open:assessed.filter(r=>!r.usable).length,overdue:assessed.filter(r=>r.overdue).length,notificationPending:assessed.filter(r=>r.notificationPending).length,awaitingReview:assessed.filter(r=>r.status==='received'&&r.quality==='received').length}};
  }
  function mutate(kind,p,now,eventId){
    if(kind==='data_request'){
      ensure(p.scopeType==='all'||Object.hasOwn(types,p.scopeType),'محدوده نوع ماده معتبر نیست.');
      const location=text(p.scopeLocation??'','محدوده مکان',100,false),requester=text(p.requester,'درخواست‌کننده',100),supplier=text(p.supplier,'مسئول ارائه آمار',100),project=text(p.project??'','پروژه / تصمیم وابسته',200,false);
      const dueAt=jalaliTimestamp(p.dueDate,p.dueTime),required=jalaliTimestamp(p.requiredDate,p.requiredTime);ensure(dueAt&&required,'تاریخ و ساعت مهلت / زمان آمار معتبر نیست.');ensure(Date.parse(dueAt)>=Date.parse(now),'مهلت درخواست جدید باید از زمان ثبت به بعد باشد؛ مهلت گذشته را به درخواست تازه نسبت ندهید.');ensure(Date.parse(required)<=Date.parse(dueAt),'زمان آمار درخواستی نباید بعد از مهلت تحویل باشد.');
      ensure(Number.isInteger(p.freshnessHours)&&p.freshnessHours>=1&&p.freshnessHours<=720,'عمر مجاز آمار باید بین ۱ و ۷۲۰ ساعت باشد.');
      const requestId=id();db.prepare("INSERT INTO data_requests(id,scope_type,scope_location,project,requester,supplier,required_as_of,due_at,freshness_hours,status,requested_at,last_event_id) VALUES(?,?,?,?,?,?,?,?,?,'waiting',?,?)").run(requestId,p.scopeType,location,project,requester,supplier,required,dueAt,p.freshnessHours,now,eventId);
      return {dataRequestId:requestId,before:null,after:find(requestId)};
    }
    const before=find(p.dataRequestId);ensure(before.status!=='cancelled','درخواست بسته شده است؛ درخواست تازه ثبت کنید.');let extra={};
    if(kind==='data_response'){
      ensure(['partial','received','unavailable'].includes(p.responseStatus),'وضعیت پاسخ معتبر نیست.');const respondent=text(p.respondent,'نام اعلام‌کننده آمار',100),evidence=text(p.evidenceRef,'مرجع پاسخ / صورت‌شمارش',300),note=text(p.note??'','توضیح پاسخ',2000,false);
      if(p.responseStatus!=='received')ensure(note,'علت ناقص بودن / نداشتن آمار را وارد کنید.');
      let asOf=null,snapshot=null;
      if(p.responseStatus!=='unavailable'){
        asOf=jalaliTimestamp(p.asOfDate,p.asOfTime);ensure(asOf&&Date.parse(asOf)<=Date.parse(now),'زمان آمار معتبر و حداکثر زمان ثبت باشد.');
        if(p.responseStatus==='received'){ensure(p.completeConfirmed===true,'کامل بودن پوشش این محدوده را تصریح کنید.');ensure(Date.parse(asOf)>=Date.parse(before.requiredAsOf),'آمار قدیمی‌تر از زمان درخواستی است؛ پاسخ را ناقص ثبت کنید.');}
        snapshot={...capture(before),capturedAt:now,confirmedZeroTypes:[]};
        const zeroTypes=Object.keys(snapshot.summary).filter(t=>snapshot.summary[t].count===0);
        if(p.responseStatus==='received'&&zeroTypes.length){ensure(p.zeroConfirmed===true,'صفرهای محدوده باید با شمارش واقعی و تأیید صریح ثبت شوند؛ نبود رکورد به معنی صفر نیست.');snapshot.confirmedZeroTypes=zeroTypes;}
      }
      db.prepare('UPDATE data_requests SET status=?,respondent=?,evidence_ref=?,as_of_at=?,received_at=?,verified_at=NULL,verifier=\'\',snapshot=?,last_event_id=? WHERE id=?').run(p.responseStatus,respondent,evidence,asOf,now,snapshot?JSON.stringify(snapshot):null,eventId,before.id);
    }
    if(kind==='data_verify'){
      ensure(before.status==='received','فقط پاسخ کاملِ دریافت‌شده قابل تأیید است.');ensure(p.reviewConfirmed===true,'تطبیق پاسخ و موجودی ثبت‌شده را تأیید کنید.');
      ensure(before.snapshot?.stockHash===capture(before).stockHash,'موجودی این محدوده پس از پاسخ تغییر کرده است؛ پاسخ تازه لازم است.',409);
      ensure(Date.parse(before.asOf)>=Date.parse(now)-before.freshnessHours*3600000,'عمر آمار از حد مجاز گذشته است؛ پاسخ تازه لازم است.');
      db.prepare("UPDATE data_requests SET status='verified',verifier=?,verified_at=?,last_event_id=? WHERE id=?").run(p.operator,now,eventId,before.id);
    }
    if(kind==='data_followup'){
      ensure(['notify','acknowledge','followup','escalate'].includes(p.followupType),'نوع پیگیری معتبر نیست.');
      const contact=text(p.contact,'مخاطب پیگیری',100),channel=text(p.channel,'روش پیگیری',100),reference=text(p.reference,'مرجع ابلاغ / پیگیری',300);ensure(text(p.note??'','شرح پیگیری',2000,false),'شرح پیگیری لازم است.');
      if(['notify','acknowledge'].includes(p.followupType))ensure(norm(contact)===norm(before.supplier),'مخاطب ابلاغ یا اعلام دریافت باید مسئول ارائه آمار همین درخواست باشد؛ برای مخاطب دیگر، پیگیری یا ارجاع انتخاب کنید.');
      extra={followupType:p.followupType,contact,channel,reference};
      if(['notify','acknowledge'].includes(p.followupType))db.prepare('UPDATE data_requests SET notified_at=COALESCE(notified_at,?),last_event_id=? WHERE id=?').run(now,eventId,before.id);
      else db.prepare('UPDATE data_requests SET last_event_id=? WHERE id=?').run(eventId,before.id);
    }
    if(kind==='data_cancel'){ensure(text(p.note??'','علت بستن',2000,false),'علت بستن درخواست لازم است.');db.prepare("UPDATE data_requests SET status='cancelled',last_event_id=? WHERE id=?").run(eventId,before.id);}
    return {dataRequestId:before.id,before,after:find(before.id),...extra};
  }
  function report(){
    const headers=['نوع ردیف','کد درخواست','نوع ماده','مکان','پروژه / تصمیم','کیفیت فعلی','قابل اتکا برای برنامه قطعی','مسئول ارائه آمار اعلامی','درخواست‌کننده','اقدام بعدی','ثبت درخواست سرور','ابلاغ ثبت‌شده','مهلت تحویل','ثبت پاسخ سرور','آمار مربوط به','ثبت تأیید سرور','پاسخ بعد از مهلت','نوع اقدام','زمان ثبت اقدام سرور','ثبت‌کننده اعلامی','حساب ورود','سند','مرجع پاسخ / پیگیری','شرح','تعداد ثبت‌شده لوله در تصویر پاسخ','تعداد ثبت‌شده ورق در تصویر پاسخ','تعداد ثبت‌شده پروفیل در تصویر پاسخ','نقش حساب هنگام اقدام'];
    const rows=[headers],registered=stock().filter(p=>p.status!=='issued');
    for(const type of Object.keys(types)){
      const q=quality(type),row=Array(headers.length).fill('');
      row[0]='اعتبار پوشش فعلی';row[1]=q.code;row[2]=types[type].label;row[3]='تمام محل‌ها';row[5]=q.label;row[6]=q.usable?'بله':'خیر';row[9]=q.nextOwner;row[14]=q.asOf??'';row[15]=q.verifiedAt??'';row[23]='ارقام، موجودی ثبت‌شده‌اند؛ نبود داده به معنی صفر نیست.';
      row[24+Object.keys(types).indexOf(type)]=registered.filter(p=>p.group.type===type).length;rows.push(row);
    }
    const current=new Map(all().map(r=>[r.id,assess(r,Date.now(),capture(r).stockHash)]));
    const events=db.prepare("SELECT * FROM events WHERE kind LIKE 'data_%' ORDER BY rowid").all();
    for(const e of events){const payload=JSON.parse(e.payload),r=payload.after,q=current.get(payload.dataRequestId),s=r.snapshot?.summary??{};rows.push(['سابقه اقدام',r.code,r.scopeType==='all'?'تمام مواد':types[r.scopeType].label,r.scopeLocation||'تمام محل‌ها',r.project,q.label,q.usable?'بله':'خیر',r.supplier,r.requester,q.nextOwner,r.requestedAt,r.notifiedAt??'',r.dueAt,r.receivedAt??'',r.asOf??'',r.verifiedAt??'',q.deliveryLate?'بله':'خیر',payload.followupType??e.kind,e.recorded_at,e.operator,e.actor,e.document,payload.reference??r.evidenceRef,e.note,...Object.keys(types).map(t=>s[t]?.count??''),payload.actorRole??'نسخه قبلی']);}
    return rows;
  }
  return {query,detail,all,quality,overview,mutate,capture,assess,report};
}
