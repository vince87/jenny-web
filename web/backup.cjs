"use strict";
const fs=require('node:fs/promises');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
const MAX=128*1024*1024;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function acquire(dataDir) {
  await fs.mkdir(dataDir,{recursive:true});
  const lock=path.join(dataDir,'.jenny-active');
  await fs.mkdir(lock); // Existing lock fails closed. Never guess a process is dead.
  await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}));
  return ()=>fs.rm(lock,{recursive:true});
}
async function exportBundle(dataDir,workspaceRoot) {
  const files=[],directories=[]; let size=0;
  async function walk(root,relative) {
    for(const e of await fs.readdir(root,{withFileTypes:true})) {
      if(relative==='data' && e.name==='.jenny-active')continue;
      const abs=path.join(root,e.name), rel=relative+'/'+e.name;
      if(e.isSymbolicLink())throw Error('Backup refuses symbolic links: '+rel);
      if(e.isDirectory()){directories.push(rel);if(directories.length>20000)throw Error('Too many directories');await walk(abs,rel);}
      else if(e.isFile()) {
        const stat=await fs.stat(abs);size+=stat.size;
        if(size>MAX||files.length>=20000)throw Error('Backup exceeds 128 MiB / 20000 files');
        const bytes=await fs.readFile(abs);files.push({path:rel,mode:stat.mode&0o777,sha256:digest(bytes),data:bytes.toString('base64')});
      }else throw Error('Unsupported backup entry');
    }
  }
  await walk(dataDir,'data');await walk(workspaceRoot,'workspaces');
  return gzip(Buffer.from(JSON.stringify({format:'jenny-web-backup',version:1,createdAt:new Date().toISOString(),directories,files})));
}
function validateBundle(b) {
  if(b.format!=='jenny-web-backup'||b.version!==1||!Array.isArray(b.files)||!Array.isArray(b.directories)||b.files.length>20000||b.directories.length>20000)throw Error('Invalid backup');
  const seen=new Set();let size=0;
  const valid=p=>{if(typeof p!=='string'||! /^(data|workspaces)\//.test(p)||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'||/[\x00-\x1f]/.test(x))||seen.has(p))throw Error('Invalid backup path');seen.add(p);};
  for(const p of b.directories)valid(p);
  for(const f of b.files){valid(f.path);if(typeof f.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error('Invalid base64');const bytes=Buffer.from(f.data,'base64');size+=bytes.length;if(size>MAX||digest(bytes)!==f.sha256)throw Error('Backup checksum/size mismatch');}
  const filePaths=new Set(b.files.map(f=>f.path));
  for(const p of seen) {const parts=p.split('/');parts.pop();while(parts.length){if(filePaths.has(parts.join('/')))throw Error('File/directory conflict');parts.pop();}}
  return b;
}
async function restoreBundle(bytes,destination) {
  const b=validateBundle(JSON.parse(await gunzip(bytes,{maxOutputLength:MAX*2})));
  // Destination must not exist: a restore cannot overwrite live data.
  await fs.mkdir(destination,{mode:0o700});
  try {
    for(const d of ['data','workspaces',...b.directories])await fs.mkdir(path.join(destination,d),{recursive:true,mode:0o700});
    for(const f of b.files){const target=path.join(destination,f.path);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await fs.writeFile(target,Buffer.from(f.data,'base64'),{flag:'wx',mode:(f.mode&0o111)?0o700:0o600});}
  }catch(e){await fs.rm(destination,{recursive:true,force:true});throw e;}
  return {files:b.files.length,destination};
}
module.exports={acquire,exportBundle,restoreBundle,validateBundle};
