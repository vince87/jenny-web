"use strict";
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
async function gitRead(workspaces,name,action) {
  await workspaces.service(name);
  const root=path.join(workspaces.root,name), dir=path.join(root,'.git');
  const st=await fs.lstat(dir);
  if(!st.isDirectory() || st.isSymbolicLink() || await fs.realpath(dir)!==dir) throw new Error('Repository Git locale non supportato.');
  for(const file of ['commondir','objects/info/alternates','objects/info/http-alternates']) {
    try { await fs.lstat(path.join(dir,file)); throw new Error('Repository Git locale non supportato.'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  const config=await fs.readFile(path.join(dir,'config'),'utf8');
  if(/\[\s*include/i.test(config)) throw new Error('Repository Git locale non supportato.');
  const commands={status:['status','--porcelain=v1','--untracked-files=normal','--ignore-submodules=all'],diff:['diff','--no-ext-diff','--no-textconv','--ignore-submodules=all','--','.'],staged:['diff','--cached','--no-ext-diff','--no-textconv','--ignore-submodules=all','--'],log:['log','-20','--format=%h %ad %s','--date=short','--no-show-signature']};
  if(!Object.hasOwn(commands,action)) throw new Error('Azione Git non valida.');
  const {stdout}=await exec('git',['--no-optional-locks','--no-pager','--git-dir='+dir,'--work-tree='+root,'-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null','-c','submodule.recurse=false',...commands[action]],{cwd:root,timeout:5000,maxBuffer:256*1024,env:{PATH:process.env.PATH,HOME:'/nonexistent',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1',LC_ALL:'C.UTF-8'}});
  return {action,output:stdout};
}
module.exports={gitRead};
