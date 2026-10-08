import {types,kinds,fa,esc,dims,size,today,digits,norm} from './model.mjs';
import {createTracking,qualityBadge,qualityBanner,scopeLabel} from './tracking.mjs';
import {canWrite} from './permissions.mjs';
import {shape} from './shapes.mjs';
const root=document.getElementById('rn-material-demo'),get=id=>document.getElementById(id);
let state={revision:0,racks:[],summary:{},locations:[]},category='all',view='inventory',page=1,historyPage=1,selected=null,formMode='',entryType='tube',online=false,session=null,busy=false,renderToken=0,lastSync=null;
const rackPages=new Map(),cacheKey='rn-visual-inventory-cache-v1',pendingKey='rn-visual-inventory-pending-v1',draftKey='rn-visual-inventory-draft-v1';
let pending=null;
try{state=JSON.parse(localStorage.getItem(cacheKey))??state;pending=JSON.parse(localStorage.getItem(pendingKey))??null;}catch{}
function notify(message){get('rn-message').textContent=message;}
async function api(path,options){
  const response=await fetch(path,{cache:'no-store',...options});let data;
  try{data=await response.json();}catch{throw new Error('پاسخ سرور دریافت نشد.');}
  if(!response.ok){const error=new Error(data.error||'درخواست انجام نشد.');error.status=response.status;throw error;}
  return data;
}
function updateConnection(){
  get('connection').textContent=busy?'در حال ثبت':online?'متصل · نسخه '+fa(state.revision):'ارتباط قطع است';
  get('sync-note').innerHTML=pending?'یک ثبت هنوز تأیید نشده است؛ تا تعیین نتیجه، ثبت جدید انجام نمی‌شود. <button class="rn-button" type="button" data-action="retry">بررسی و ارسال مجدد</button>':!online?'موجودی نمایش‌داده‌شده آخرین داده دریافتی است. تأیید ثبت به ارتباط با سرور نیاز دارد.':'';
  const denied=kind=>!!session&&!canWrite(session.role,kind);
  root.querySelectorAll('button[type="submit"]').forEach(b=>{const form=b.closest('form'),kind=form?.dataset.kind??(form?.id==='entry-form'?'receipt':formMode);b.disabled=busy||!!pending||denied(kind);});
  const actionKinds={add:'receipt',trackingNew:'data_request',trackingResponse:'data_response',trackingVerify:'data_verify',trackingCancel:'data_cancel',trackingFollowup:'data_followup'};
  root.querySelectorAll('button[data-action]').forEach(b=>{const kind=b.dataset.action==='operation'?b.dataset.kind:actionKinds[b.dataset.action];if(kind)b.disabled=denied(kind);});
}
async function refresh(){
  try{if(!session){session=await api('/api/session');get('rn-session').textContent='حساب: '+session.displayName+' · '+session.roleTitle+(session.individualAccounts?'':' · حساب مشترک / محلی');}state=await api('/api/state');online=true;lastSync=new Date();try{localStorage.setItem(cacheKey,JSON.stringify(state));}catch{}await render();}
  catch(error){online=false;updateConnection();notify(error.message);}
}
function fields(){
  let operator='';try{operator=session?.displayName??localStorage.getItem('rn-visual-operator')??'';}catch{}
  return '<label class="rn-field">تاریخ عملیات شمسی<input class="rn-input" name="date" required value="'+today()+'" placeholder="1405/07/16" dir="ltr"></label><label class="rn-field">ثبت‌کننده<input class="rn-input" name="operator" required maxlength="100" value="'+esc(operator)+'"></label><label class="rn-field">شماره سند / مرجع شمارش<input class="rn-input" name="document" required maxlength="100"></label><label class="rn-field">کد سفارش<input class="rn-input" name="order" maxlength="100" dir="ltr"></label><label class="rn-field rn-fields-full">توضیح / علت<textarea class="rn-input" name="note" maxlength="2000"></textarea></label>';
}
const numberField=(label,name,value='',step='0.001',min='0.001')=>'<label class="rn-field">'+label+'<input class="rn-input" type="number" inputmode="decimal" min="'+min+'" step="'+step+'" name="'+name+'" required value="'+esc(value)+'"></label>';
function locationField(value='',label='محل نگهداری'){return '<label class="rn-field">'+label+'<input class="rn-input" name="location" required maxlength="100" value="'+esc(value)+'" list="locations"></label><datalist id="locations">'+state.locations.map(l=>'<option value="'+esc(l.name)+'"></option>').join('')+'</datalist>';}
function remnantField(value=false){return '<label class="rn-field">وضعیت قطعه<select class="rn-input" name="remnant"><option value="no" '+(!value?'selected':'')+'>کامل</option><option value="yes" '+(value?'selected':'')+'>باقیمانده برش</option></select></label>';}
function endForm(){return '<div class="rn-form-foot"><button class="rn-button primary" type="submit">ثبت در سرور</button></div><div class="rn-errors" id="form-error" role="alert"></div>';}
function showReceipt(restoreDraft=false){
  formMode='receipt';selected=null;get('rn-detail').innerHTML='';
  const t=entryType;
  get('rn-editor').innerHTML='<section class="rn-detail"><div class="rn-detail-line"><h3>ثبت ورود قطعات هم‌اندازه</h3><button class="rn-button" type="button" data-action="closeForm">بستن</button></div><form id="entry-form" class="rn-form"><label class="rn-field">نوع ماده<select class="rn-input" name="type" id="entry-type">'+Object.entries(types).map(([type,v])=>'<option value="'+type+'" '+(type===t?'selected':'')+'>'+v.label+'</option>').join('')+'</select></label><label class="rn-field">جنس / گرید / پوشش<input class="rn-input" name="material" required maxlength="80" placeholder="مثلاً فولادی ST37 بدون پوشش"></label>'+locationField()+numberField('ضخامت — میلی‌متر','thickness')+(t==='tube'?numberField('قطر خارجی — میلی‌متر','diameter'):t==='profile'?numberField('عرض مقطع — میلی‌متر','width')+numberField('ارتفاع مقطع — میلی‌متر','height'):numberField('عرض ورق — میلی‌متر','sheetWidth'))+numberField(t==='sheet'?'طول ورق — میلی‌متر':'طول هر قطعه — متر','length')+numberField('تعداد قطعات هم‌اندازه','count',1,'1','1')+remnantField()+fields()+endForm()+'</form></section>';
  if(restoreDraft){try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft?.type===t)for(const [name,value] of Object.entries(draft)){const input=get('entry-form').elements.namedItem(name);if(input)input.value=value;}}catch{}}
  updateConnection();
}
function persistDraft(){const form=get('entry-form');if(!form)return;try{localStorage.setItem(draftKey,JSON.stringify(Object.fromEntries(new FormData(form))));}catch{}}
async function selectPiece(id){
  try{selected=await api('/api/piece?id='+encodeURIComponent(id));online=true;formMode='';get('rn-editor').innerHTML='';showDetail();get('rn-detail').scrollIntoView({behavior:'smooth',block:'nearest'});}
  catch(error){notify(error.message);}
}
function showDetail(){
  if(!selected){get('rn-detail').innerHTML='';return;}
  const p=selected,g=p.group;
  get('rn-detail').innerHTML='<section class="rn-detail"><div class="rn-detail-line"><div><h3>'+types[g.type].label+' · '+size(g,p)+'</h3><div class="rn-dims">'+dims(g)+' میلی‌متر · '+esc(g.material)+'</div><div class="rn-small">'+esc(p.location)+' · '+(p.remnant?'باقیمانده برش':'کامل')+'</div></div><div><span class="rn-details-code">'+esc(p.code)+'</span><div class="rn-small">'+(p.status==='reserved'?'رزرو '+esc(p.order):p.status==='issued'?'خارج‌شده':'آزاد')+'</div></div></div><div class="rn-actions">'+(p.status==='issued'?'<button class="rn-button" type="button" data-action="operation" data-kind="return">برگشت به انبار</button>':'<button class="rn-button" type="button" data-action="operation" data-kind="'+(p.reserved?'release':'reserve')+'">'+(p.reserved?'آزادسازی رزرو':'رزرو سفارش')+'</button><button class="rn-button danger" type="button" data-action="operation" data-kind="issue">ثبت خروج</button><button class="rn-button" type="button" data-action="operation" data-kind="transfer">انتقال مکان</button><button class="rn-button" type="button" data-action="operation" data-kind="correct">اصلاح ابعاد</button>')+'<button class="rn-button" type="button" data-action="pieceHistory">سوابق این قطعه</button><button class="rn-button" type="button" data-action="closeDetail">بستن</button></div><div id="operation-slot"></div></section>';
  updateConnection();
}
function showOperation(kind){
  if(!selected)return;formMode=kind;const p=selected,t=p.group.type;
  get('operation-slot').innerHTML='<form id="operation-form" class="rn-form rn-extra"><div class="rn-fields-full rn-small">'+esc(kinds[kind])+' · '+esc(p.code)+' · '+size(p.group,p)+'</div>'+(kind==='transfer'?locationField('','مکان مقصد'):kind==='correct'?numberField(t==='sheet'?'طول جدید — میلی‌متر':'طول جدید — متر','length',p.length)+(t==='sheet'?numberField('عرض جدید — میلی‌متر','sheetWidth',p.width):'')+remnantField(p.remnant):'')+fields()+endForm()+'</form>';
  const form=get('operation-form');form.elements.namedItem('order').value=p.order||'';
  if(['reserve','release'].includes(kind))form.elements.namedItem('order').required=true;
  if(kind==='correct')form.elements.namedItem('note').required=true;
  updateConnection();
}
async function render(){
  const token=++renderToken;
  get('rn-data-banner').innerHTML=qualityBanner(state);
  get('rn-stats').innerHTML=Object.entries(types).map(([type,t])=>{const s=state.summary[type]||{count:0,total:0,freeAmount:0},q=state.dataQuality?.[type];return '<div class="rn-stat"><div><span class="rn-stat-label">'+t.label+' · '+fa(s.count)+' قطعه ثبت‌شده</span><strong>'+(s.count===0&&!q?.zeroConfirmed?'نامشخص':fa(s.total)+' '+t.unit)+'</strong><div class="rn-small">ثبت‌شده: '+fa(s.total)+' '+t.unit+' · آزاد ثبت‌شده: '+fa(s.freeAmount)+' '+t.unit+'</div>'+qualityBadge(q)+(q?.nextOwner?'<div class="rn-small">اقدام بعدی: '+esc(q.nextOwner)+'</div>':'')+'</div></div>';}).join('');
  get('search').disabled=view!=='inventory';
  get('rn-racks').hidden=view!=='inventory';get('rn-history').hidden=view!=='history';get('rn-tracking').hidden=view!=='tracking';get('rn-legend').hidden=view!=='inventory';
  root.querySelectorAll('[data-action="category"]').forEach(b=>b.setAttribute('aria-pressed',String(category===b.dataset.category&&view==='inventory')));
  root.querySelectorAll('[data-action="history"],[data-action="tracking"]').forEach(b=>b.setAttribute('aria-pressed',String(view===b.dataset.action)));
  updateConnection();
  if(view==='history'){await loadHistory();return;}
  if(view==='tracking'){await tracking.render();return;}
  const query=norm(get('search').value),racks=state.racks.filter(g=>(category==='all'||g.type===category)&&norm([g.material,g.location,g.diameter,g.thickness,g.width,g.height].join(' ')).includes(query));
  const pages=Math.max(1,Math.ceil(racks.length/6));page=Math.min(page,pages);const visible=racks.slice((page-1)*6,page*6);
  if(!visible.length){get('rn-racks').innerHTML='<div class="rn-empty">'+(state.racks.length?'گروهی مطابق جستجو پیدا نشد.':'هنوز موجودی ثبت نشده است. از «ثبت ورود» شروع کنید؛ هر طول یا ابعاد متفاوت را جدا وارد کنید.')+'</div>';get('group-pager').innerHTML='';return;}
  const results=await Promise.all(visible.map(async g=>{try{const data=await api('/api/rack?id='+encodeURIComponent(g.rackId)+'&page='+(rackPages.get(g.rackId)||1));return {g,data};}catch(error){return {g,error:error.message};}}));
  if(token!==renderToken)return;
  let html='<div class="rn-grid">';
  for(const {g,data,error} of results){
    if(error){html+='<article class="rn-rack"><h3>'+esc(g.material)+'</h3><p class="rn-error">'+esc(error)+'</p></article>';continue;}
    if(data.page>1&&!data.pieces.length){rackPages.set(g.rackId,1);await render();return;}
    html+='<article class="rn-rack"><div class="rn-rack-heading"><h3>'+esc(g.material)+'</h3><span class="rn-code">'+(g.type==='tube'?'T':g.type==='sheet'?'S':'P')+'-'+g.id.slice(0,8)+'</span></div><div class="rn-dims">'+dims(g)+' میلی‌متر</div><div class="rn-small">'+esc(g.location)+'</div>'+qualityBadge(g.quality)+'<div class="rn-rack-totals"><span><b>'+fa(g.count)+'</b> قطعه · <b>'+fa(g.total)+'</b> '+types[g.type].unit+'</span><span>آزاد <b>'+fa(g.free)+'</b> · رزرو <b>'+fa(g.count-g.free)+'</b></span></div><div class="rn-pieces">'+data.pieces.map(p=>'<button type="button" class="rn-piece '+(p.reserved?'reserved':'')+'" data-action="piece" data-id="'+esc(p.id)+'" aria-pressed="'+(selected?.id===p.id)+'" aria-label="'+esc(p.code+'، '+size(g,p)+'، '+(p.reserved?'رزرو '+p.order:'آزاد'))+'">'+shape(g,p)+'<span class="rn-piece-size">'+size(g,p)+'</span><span class="rn-piece-status">'+(p.reserved?'رزرو':p.remnant?'باقیمانده':'کامل')+'</span></button>').join('')+'</div>'+ (data.count>data.size?'<div class="rn-pager"><button class="rn-button" type="button" data-action="rackPrev" data-rack="'+esc(g.rackId)+'" '+(data.page===1?'disabled':'')+'>قبلی</button><span>'+fa((data.page-1)*data.size+1)+'–'+fa(Math.min(data.page*data.size,data.count))+' از '+fa(data.count)+'</span><button class="rn-button" type="button" data-action="rackNext" data-rack="'+esc(g.rackId)+'" '+(data.page*data.size>=data.count?'disabled':'')+'>بعدی</button></div>':'')+'</article>';
  }
  get('rn-racks').innerHTML=html+'</div>';
  get('group-pager').innerHTML=pages>1?'<button class="rn-button" data-action="groupPrev" type="button" '+(page===1?'disabled':'')+'>گروه‌های قبلی</button><span>'+fa(page)+' از '+fa(pages)+'</span><button class="rn-button" data-action="groupNext" type="button" '+(page===pages?'disabled':'')+'>گروه‌های بعدی</button>':'';
}
async function loadHistory(pieceId=''){
  try{
    const data=await api('/api/history?page='+historyPage+(pieceId?'&pieceId='+encodeURIComponent(pieceId):''));
    const target=pieceId?get('operation-slot'):get('rn-history');
    target.innerHTML='<section class="rn-detail"><h3>'+ (pieceId?'سوابق این قطعه':'سوابق ورود و گردش موجودی')+'</h3>'+data.events.map(e=>{
      const p=e.payload.after??e.payload.before??(e.kind==='receipt'?e.payload:null),group=p?.group;
      return '<div class="rn-history-row"><div class="rn-history-body"><strong>'+esc(kinds[e.kind]||e.kind)+' · '+esc(e.payload.dataRequestId?(e.payload.after?.code??'درخواست آمار'):(e.pieceCode??fa(e.payload.count??0)+' قطعه'))+'</strong><div class="rn-small">'+esc(e.operation_date)+' · '+esc(e.operator)+' · سند '+esc(e.document)+'</div><div class="rn-small">'+(group?esc(types[group.type].label+' · '+dims(group)+' · '+size(group,p)+' · '+p.location):e.payload.dataRequestId?esc(scopeLabel(p)):'')+(e.order_code?' · سفارش '+esc(e.order_code):'')+'</div><div class="rn-small">'+esc(e.note)+'</div></div>'+(e.piece_id?'<button type="button" class="rn-button" data-action="piece" data-id="'+esc(e.piece_id)+'">قطعه</button>':'')+'</div>';
    }).join('')+(data.total?'':'<div class="rn-empty">هنوز سابقه‌ای وجود ندارد.</div>')+'</section>';
    if(!pieceId)get('group-pager').innerHTML=data.total>50?'<button class="rn-button" type="button" data-action="historyPrev" '+(historyPage===1?'disabled':'')+'>قبلی</button><span>'+fa(historyPage)+'</span><button class="rn-button" type="button" data-action="historyNext" '+(historyPage*50>=data.total?'disabled':'')+'>بعدی</button>':'';
  }catch(error){notify(error.message);}
}
async function completeCommand(result,command){
  pending=null;try{localStorage.removeItem(pendingKey);if(command.kind==='receipt')localStorage.removeItem(draftKey);localStorage.setItem('rn-visual-operator',command.payload.operator);}catch{}
  formMode='';get('rn-editor').innerHTML='';selected=null;get('rn-detail').innerHTML='';await refresh();let detailUnavailable=false;if(result.dataRequestId){try{await tracking.pick(result.dataRequestId);}catch{detailUnavailable=true;}}notify((result.duplicate?'این ثبت قبلاً تأیید شده بود. ':'')+'در سرور ثبت شد.'+(detailUnavailable?' جزئیات فعلاً دریافت نشد؛ بازخوانی کنید.':''));
}
async function sendPending(){
  if(!pending||busy)return;busy=true;updateConnection();const command=pending;
  try{
    const result=await api('/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
    online=true;await completeCommand(result,command);
  }catch(error){
    if(error.status&&error.status<500){pending=null;try{localStorage.removeItem(pendingKey);}catch{}if(error.status===409){await refresh();if(selected)await selectPiece(selected.id);}}
    else online=false;
    const el=get('form-error');if(el)el.textContent=error.message;notify(error.status&&error.status<500?error.message:'ارتباط قطع شد؛ نتیجه این ثبت هنوز مشخص نیست. «بررسی و ارسال مجدد» را بزنید.');
  }finally{busy=false;updateConnection();}
}
async function submit(kind,payload){
  if(pending||busy)throw new Error('ابتدا نتیجه ثبت قبلی را بررسی کنید.');
  const command={requestId:globalThis.crypto?.randomUUID?.()??('req_'+Date.now().toString(36)+'_'+Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(36)).join('_')),revision:state.revision,kind,payload};
  try{localStorage.setItem(pendingKey,JSON.stringify(command));}catch{throw new Error('ذخیره شناسه ثبت در این مرورگر ممکن نیست؛ فضای دستگاه یا تنظیمات مرورگر را بررسی کنید.');}
  pending=command;await sendPending();
}
const tracking=createTracking({get,api,fields,endForm,numberField,notify,updateConnection,currentSession:()=>session});
root.addEventListener('click',async e=>{
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(await tracking.handle(button))return;
  if(action==='tracking'){view='tracking';selected=null;get('rn-detail').innerHTML='';get('rn-editor').innerHTML='';tracking.reset();await render();}
  if(action==='category'){get('rn-editor').innerHTML='';get('rn-detail').innerHTML='';selected=null;view='inventory';category=button.dataset.category;page=1;await render();}
  if(action==='history'){get('rn-editor').innerHTML='';get('rn-detail').innerHTML='';selected=null;view='history';historyPage=1;await render();}
  if(action==='refresh')await refresh();
  if(action==='add'){view='inventory';await render();entryType=category==='all'?'tube':category;try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft?.type)entryType=draft.type;}catch{}showReceipt(true);get('rn-editor').scrollIntoView({behavior:'smooth',block:'nearest'});}
  if(action==='closeForm'){get('rn-editor').innerHTML='';formMode='';}
  if(action==='piece')await selectPiece(button.dataset.id);
  if(action==='operation')showOperation(button.dataset.kind);
  if(action==='closeDetail'){selected=null;get('rn-detail').innerHTML='';formMode='';}
  if(action==='pieceHistory'&&selected){formMode='';historyPage=1;await loadHistory(selected.id);}
  if(action==='rackNext'||action==='rackPrev'){const id=button.dataset.rack;rackPages.set(id,Math.max(1,(rackPages.get(id)||1)+(action==='rackNext'?1:-1)));await render();}
  if(action==='groupNext'||action==='groupPrev'){page+=action==='groupNext'?1:-1;await render();}
  if(action==='historyNext'||action==='historyPrev'){historyPage+=action==='historyNext'?1:-1;await render();}
  if(action==='retry'){
    if(!pending)return;
    try{const result=await api('/api/request?id='+encodeURIComponent(pending.requestId));if(result.found)await completeCommand(result,pending);else await sendPending();}
    catch(error){notify(error.message);}
  }
});
root.addEventListener('change',e=>{if(e.target.id==='response-status'){tracking.responseChanged();return;}if(e.target.id==='entry-type'){persistDraft();entryType=e.target.value;showReceipt();}else if(e.target.closest('#entry-form'))persistDraft();});
root.addEventListener('input',e=>{if(e.target.id==='search'){page=1;render();}if(e.target.closest('#entry-form'))persistDraft();});
root.addEventListener('submit',async e=>{
  if(!['entry-form','operation-form','tracking-form'].includes(e.target.id))return;e.preventDefault();
  const form=e.target,raw=Object.fromEntries(new FormData(form)),payload=form.id==='tracking-form'?tracking.payload(form):{...raw};
  for(const key of ['count','length','thickness','diameter','width','height','sheetWidth'])if(Object.hasOwn(payload,key))payload[key]=Number(digits(payload[key]));
  if(Object.hasOwn(payload,'remnant'))payload.remnant=payload.remnant==='yes';
  if(selected&&form.id==='operation-form')payload.pieceId=selected.id;
  try{await submit(form.id==='tracking-form'?form.dataset.kind:form.id==='entry-form'?'receipt':formMode,payload);}catch(error){const el=get('form-error');if(el)el.textContent=error.message;notify(error.message);}
});
window.addEventListener('online',()=>refresh());setInterval(()=>{if(!busy&&!pending&&!document.querySelector('form:focus-within'))refresh();},30000);
refresh();
