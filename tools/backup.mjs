import {openStore} from '../lib/store.mjs';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),source=process.env.RAMNOOR_DB_PATH||path.join(root,'var/inventory.sqlite'),target=process.argv[2];
if(!target)throw new Error('Usage: npm run db:backup -- /absolute/path/backup.sqlite');
if(!fs.existsSync(source))throw new Error('Source database does not exist.');
if(!path.isAbsolute(target))throw new Error('Use an absolute destination path.');
const store=openStore(source);try{store.backup(target);console.log('Backup saved: '+target);}finally{store.close();}
