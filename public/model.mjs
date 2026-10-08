export const types={tube:{label:'لوله',unit:'متر'},sheet:{label:'ورق',unit:'مترمربع'},profile:{label:'پروفیل',unit:'متر'}};
export const kinds={receipt:'ورود موجودی',reserve:'رزرو سفارش',release:'آزادسازی رزرو',issue:'خروج و مصرف',return:'برگشت به انبار',transfer:'انتقال مکان',correct:'اصلاح ابعاد'};
export const digits=s=>String(s??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/٫/g,'.');
export const norm=s=>digits(s).trim().toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ');
export const fa=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(n);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jf=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
const dateParts=d=>Object.fromEntries(jf.formatToParts(d).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
export function jalaliDay(s){
  const m=digits(s).trim().match(/^(1[34]\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);if(!m)return null;
  const [y,mo,da]=m.slice(1).map(Number);if(mo<1||mo>12||da<1||da>31)return null;
  let start=null;for(let i=0;i<35;i++){const t=Date.UTC(y+621,2,1)+i*86400000,p=dateParts(new Date(t));if(p.year===y&&p.month===1&&p.day===1){start=t;break;}}
  if(start===null)return null;const offset=mo<=7?(mo-1)*31:186+(mo-7)*30,ts=start+(offset+da-1)*86400000,p=dateParts(new Date(ts));return p.year===y&&p.month===mo&&p.day===da?ts/86400000:null;
}
export function today(){const f=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'}),p=Object.fromEntries(f.formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'/'+p.month+'/'+p.day;}
export function dims(g){return g.type==='tube'?'قطر خارجی '+fa(g.diameter)+' · ضخامت '+fa(g.thickness):g.type==='profile'?'مقطع '+fa(g.width)+' × '+fa(g.height)+' · ضخامت '+fa(g.thickness):'ضخامت '+fa(g.thickness);}
export function size(g,p){return g.type==='sheet'?fa(p.width)+' × '+fa(p.length)+' میلی‌متر':fa(p.length)+' متر';}
export function measure(g,p){return g.type==='sheet'?p.width*p.length/1e6:p.length;}
export const dataStatuses={unknown:'نامشخص؛ تأیید پوشش موجودی نداریم',waiting:'در انتظار آمار انبار',partial:'آمار ناقص',received:'دریافت‌شده؛ در انتظار بررسی',verified:'تأییدشده در محدوده درخواست',unavailable:'انبار اعلام کرده آمار در دسترس نیست',cancelled:'بسته‌شده با ذکر علت',stale:'داده قدیمی؛ نیازمند پاسخ تازه',changed:'گردش موجودی پس از پاسخ؛ نیازمند تأیید تازه'};
Object.assign(kinds,{data_request:'درخواست آمار',data_response:'پاسخ انبار',data_verify:'بررسی و تأیید آمار',data_followup:'پیگیری / ابلاغ / ارجاع',data_cancel:'بستن درخواست'});
export const stamp=iso=>iso?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(iso)):'—';
// Convert a Persian date and a wall-clock time using the actual Tehran timezone.
export function jalaliTimestamp(date,time){
  const day=jalaliDay(date),m=digits(time).match(/^(\d{2}):(\d{2})$/);if(day===null||!m)return null;
  const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return null;
  const target=day*86400000+(h*60+min)*60000,formatter=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let value=target;
  for(let i=0;i<3;i++){const p=Object.fromEntries(formatter.formatToParts(new Date(value)).map(x=>[x.type,x.value]));const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));value+=target-represented;}
  return new Date(value).toISOString();
}

export function persianDateOf(value){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.year+'/'+p.month+'/'+p.day;}
