import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Use Node.js 24 or later.');
for(const dir of ['public','lib','tools']){
  for(const name of await fs.readdir(path.join(root,dir)))if(name.endsWith('.mjs')){
    const check=spawnSync(process.execPath,['--check',path.join(root,dir,name)],{encoding:'utf8'});if(check.status)throw new Error(check.stderr);
  }
}
await fs.access(path.join(root,'db/schema.sql'));await fs.access(path.join(root,'public/index.html'));
const check=spawnSync(process.execPath,['--check',path.join(root,'server.mjs')],{encoding:'utf8'});if(check.status)throw new Error(check.stderr);
console.log('Ready for deployment. Start with npm start.');
