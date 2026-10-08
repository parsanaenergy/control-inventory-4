import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openStore,InventoryError} from './lib/store.mjs';
import {configureAuth,canWrite} from './lib/auth.mjs';
import {types} from './public/model.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const bind=process.env.RAMNOOR_HOST||'127.0.0.1',port=Number(process.env.PORT||8080);
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node.js 24 or later is required.');
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535.');
const auth=configureAuth(process.env,bind);
const dbPath=process.env.RAMNOOR_DB_PATH||path.join(root,'var/inventory.sqlite'),store=openStore(dbPath);
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const csvCell=v=>{let s=String(v??'');if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
    const url=new URL(req.url,'http://'+(req.headers.host||'localhost'));
    if(url.pathname==='/healthz'&&['GET','HEAD'].includes(req.method)){json(res,{status:'ok'});return;}
    const identity=auth.identify(req);
    if(!identity){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Ram Noor Inventory", charset="UTF-8"','Cache-Control':'no-store'});res.end('Authentication required');return;}
    if(url.pathname.startsWith('/api/')){
      if(req.method==='POST'&&url.pathname==='/api/commands'){
        const origin=req.headers.origin;
        if(origin){const expected=process.env.PUBLIC_ORIGIN;if(expected?new URL(origin).origin!==new URL(expected).origin:new URL(origin).host!==req.headers.host)throw new InventoryError('مبدأ درخواست معتبر نیست.',403);}
        if(!(req.headers['content-type']||'').includes('application/json'))throw new InventoryError('درخواست باید JSON باشد.',415);
        const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw new InventoryError('درخواست بیش از حد بزرگ است.',413);chunks.push(chunk);}
        let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InventoryError('قالب درخواست معتبر نیست.');}
        if(!canWrite(identity.role,value.kind,value.payload?.followupType))throw new InventoryError('این عملیات به حساب واحد مسئول نیاز دارد؛ نقش حساب شما مجاز نیست.',403);
        json(res,store.command(value,identity.username,identity.role));return;
      }
      if(req.method!=='GET')throw new InventoryError('روش درخواست معتبر نیست.',405);
      if(url.pathname==='/api/session'){json(res,identity);return;}
      if(url.pathname==='/api/state'){json(res,store.state());return;}
      if(url.pathname==='/api/rack'){json(res,store.rackPieces(url.searchParams.get('id')||'',url.searchParams.get('page')||1));return;}
      if(url.pathname==='/api/piece'){json(res,store.piece(url.searchParams.get('id')));return;}
      if(url.pathname==='/api/history'){json(res,store.history(url.searchParams.get('page')||1,url.searchParams.get('pieceId')||''));return;}
      if(url.pathname==='/api/request'){const row=store.db.prepare('SELECT result FROM requests WHERE id=?').get(url.searchParams.get('id'));json(res,row?{found:true,...JSON.parse(row.result)}:{found:false});return;}
      if(url.pathname==='/api/data-requests'){json(res,store.assurance.query(url.searchParams.get('page')||1));return;}
      if(url.pathname==='/api/data-request'){json(res,store.assurance.detail(url.searchParams.get('id')));return;}
      if(url.pathname==='/api/data-report.csv'){
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="RamNoor-data-followup.csv"','Cache-Control':'no-store'});res.end('\uFEFF'+store.assurance.report().map(r=>r.map(csvCell).join(',')).join('\r\n'));return;
      }
      if(url.pathname==='/api/export.csv'){
        const quality=store.state().dataQuality;
        const rows=[['کد قطعه','نوع','جنس و پوشش','قطر خارجی mm','ضخامت mm','عرض مقطع mm','ارتفاع مقطع mm','طول','واحد طول','عرض ورق mm','مساحت m2','مکان','وضعیت','کد رزرو','باقیمانده','زمان ورود','آخرین تغییر','اعتبار پوشش داده نوع ماده','موجودی ثبت‌شده؛ مبنای قطعی؟'],...store.allPieces().map(p=>[p.code,types[p.group.type].label,p.group.material,p.group.diameter,p.group.thickness,p.group.width,p.group.height,p.length,p.group.type==='sheet'?'میلی‌متر':'متر',p.width,p.group.type==='sheet'?p.length*p.width/1e6:'',p.location,p.status==='available'?'آزاد':p.status==='reserved'?'رزرو':'خارج‌شده',p.order,p.remnant?'بله':'خیر',p.createdAt,p.updatedAt,quality[p.group.type].label,quality[p.group.type].usable?'تأییدشده در محدوده درخواست':'نیازمند تأیید'])];
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="RamNoor-inventory.csv"','Cache-Control':'no-store'});res.end('\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'));return;
      }
      if(url.pathname==='/api/backup'){
        const file=path.join(path.dirname(dbPath),'backup-'+randomUUID()+'.sqlite');
        try{store.backup(file);const buffer=await fs.readFile(file);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="RamNoor-inventory-backup.sqlite"','Cache-Control':'no-store'});res.end(buffer);}finally{await fs.rm(file,{force:true});}return;
      }
      throw new InventoryError('مسیر پیدا نشد.',404);
    }
    if(!['GET','HEAD'].includes(req.method))throw new InventoryError('روش درخواست معتبر نیست.',405);
    const filename=path.resolve(publicRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!filename.startsWith(publicRoot+path.sep))throw new InventoryError('مسیر معتبر نیست.',403);
    let stat;try{stat=await fs.stat(filename);}catch{throw new InventoryError('فایل پیدا نشد.',404);}if(!stat.isFile())throw new InventoryError('فایل پیدا نشد.',404);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:await fs.readFile(filename));
  }catch(error){if(!(error instanceof InventoryError))console.error('Inventory request failed:',error.message);if(!res.headersSent)json(res,{error:error instanceof InventoryError?error.message:'پردازش درخواست انجام نشد.'},error.status||500);}
});
server.listen(port,bind,()=>console.log('Ram Noor inventory: http://'+bind+':'+server.address().port+'/'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
