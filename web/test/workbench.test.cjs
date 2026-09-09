"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {Workspaces}=require('../workspaces.cjs');
const {SessionStore}=require('../store.cjs');
const {exportBundle,restoreBundle,validateBundle,acquire}=require('../backup.cjs');
const {gitRead}=require('../git-read.cjs');
const {RunnerQueue}=require('../runner.cjs');
const {dockerArgs}=require('../scripts/runner-worker.cjs');
const {RequestGate}=require('../public/request-state.js');
const {profileSettings}=require('../profiles.cjs');
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jenny-workbench-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const w=new Workspaces(path.join(root,'workspaces'),path.join(root,'data','file-history'));
 await w.init();await w.create('one');await fs.mkdir(path.join(root,'data'),{recursive:true});
 return {root,w,data:path.join(root,'data')};
}
test('Bounded Unicode reads can resume giant lines without loss; search centers matches',async t=>{
 const {w}=await fixture(t),text='😀'.repeat(9000)+'needle'+'x'.repeat(1000);
 await w.write('one','long.txt',text,null);
 let output='',offset=0,part;
 do {part=await w.readRange('one','long.txt',1,1,offset,1000);assert.ok(Array.from(part.content).length<=1000);output+=part.content;offset=part.nextStartChar;}while(offset!==null);
 assert.equal(output,text);assert.equal(part.truncated,false);
 const found=await w.search('one','needle','',40);assert.match(found.matches[0].text,/needle/);assert.ok(found.matches[0].snippetTruncated);
 await assert.rejects(w.readRange('one','long.txt',1,1,0,99999));
});
test('SQLite imports legacy once and transaction failures roll back',async t=>{
 const {data}=await fixture(t);await fs.mkdir(path.join(data,'sessions'));
 const s={id:'a-b',messages:[],title:'legacy'};await fs.writeFile(path.join(data,'sessions','a-b.json'),JSON.stringify(s));
 const store=new SessionStore(data);assert.equal(store.all()[0].title,'legacy');
 assert.throws(()=>store.transaction(()=>{store.save({...s,title:'bad'});throw Error('rollback');}));assert.equal(store.all()[0].title,'legacy');
 store.save({...s,title:'new'});store.close();
 const again=new SessionStore(data);assert.equal(again.all()[0].title,'new');again.close();
 assert.equal(JSON.parse(await fs.readFile(path.join(data,'sessions','a-b.json'),'utf8')).title,'legacy');
});
test('Full backup restores SQLite, history, binary files and empty directories; unsafe restores fail',async t=>{
 const {data,w,root}=await fixture(t);const store=new SessionStore(data);store.save({id:'a',messages:[],title:'backup'});store.close();
 const first=await w.write('one','a.txt','before',null);await w.write('one','a.txt','after',first.revision);
 await fs.mkdir(path.join(w.root,'one','empty'));await fs.writeFile(path.join(w.root,'one','binary'),Buffer.from([0,255,1]));
 const unlock=await acquire(data);await assert.rejects(acquire(data));const bytes=await exportBundle(data,w.root);await unlock();
 const dest=path.join(root,'restored');await restoreBundle(bytes,dest);
 assert.deepEqual(await fs.readFile(path.join(dest,'workspaces','one','binary')),Buffer.from([0,255,1]));
 const restored=new SessionStore(path.join(dest,'data'));assert.equal(restored.all()[0].title,'backup');restored.close();
 const rw=new Workspaces(path.join(dest,'workspaces'),path.join(dest,'data','file-history'));await rw.init();assert.equal((await rw.history('one','a.txt')).versions.length,1);
 await assert.rejects(restoreBundle(bytes,dest));
 assert.throws(()=>validateBundle({format:'jenny-web-backup',version:1,directories:['data/../escape'],files:[]}));
 assert.throws(()=>validateBundle({format:'jenny-web-backup',version:1,directories:[],files:[{path:'data/a',data:'eA==',sha256:'bad'}]}));
});
test('Git view reports real changes and never invokes configured external diff',async t=>{
 const {root,w}=await fixture(t),repo=path.join(w.root,'one');
 await exec('git',['init',repo]);await fs.writeFile(path.join(repo,'a.txt'),'before');await exec('git',['-C',repo,'add','.']);await exec('git',['-C',repo,'-c','user.name=Test','-c','user.email=test@localhost','commit','-m','first']);
 await fs.writeFile(path.join(repo,'a.txt'),'after');
 const marker=path.join(root,'EXECUTED');await exec('git',['-C',repo,'config','diff.external','touch '+marker]);
 const diff=await gitRead(w,'one','diff');assert.match(diff.output,/\+after/);await assert.rejects(fs.stat(marker));
 assert.match((await gitRead(w,'one','log')).output,/first/);assert.match((await gitRead(w,'one','status')).output,/a.txt/);
 await assert.rejects(gitRead(w,'one','push'));
});
test('Runner requires approval and single-use lease; Docker command restricts network and mounts',async t=>{
 const {data,w}=await fixture(t),store=new SessionStore(data),q=new RunnerQueue(store);
 assert.throws(()=>q.create('one','node-test',false));const job=q.create('one','node-test',true),claimed=q.claim();
 assert.equal(claimed.id,job.id);assert.equal(q.claim(),null);assert.throws(()=>q.complete(job.id,'wrong',{ok:true}));
 q.complete(job.id,claimed.lease,{ok:true,output:'pass'});assert.throws(()=>q.complete(job.id,claimed.lease,{ok:true}));
 const args=dockerArgs(w.root,job,'test');assert.ok(args.includes('--network=none'));assert.ok(args.includes('--read-only'));assert.ok(args.includes('--pull=never'));assert.ok(args.some(a=>a.endsWith('dst=/source,readonly')));assert.ok(!args.join(' ').includes('docker.sock'));
 assert.throws(()=>dockerArgs(w.root,{...job,workspace:'../escape'},'test'));assert.throws(()=>dockerArgs(w.root,{...job,recipe:'shell'},'test'));store.close();
});
test('Request generations reject stale responses across files and workspace switches',()=>{
 const gate=new RequestGate(),a=gate.begin('one'),b=gate.begin('one');assert.equal(gate.accepts(a,'one'),false);assert.equal(gate.accepts(b,'one'),true);assert.equal(gate.accepts(b,'two'),false);gate.invalidate();assert.equal(gate.accepts(b,'one'),false);
});
test('Ollama profiles are per request and leave server defaults unchanged',()=>{
 const base={context:8192,predict:2048,temperature:0.2};const light=profileSettings(base,'light');assert.equal(light.context,4096);assert.equal(base.context,8192);assert.equal(profileSettings(base,'extended').predict,4096);assert.throws(()=>profileSettings(base,'bad'));
});

test('Frontend modules load in HTML order and bind controls without missing IDs',async()=>{
 const vm=require('node:vm');const source=path.join(__dirname,'../public');const html=await fs.readFile(path.join(source,'index.html'),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 class Element {
   constructor(){this.value='';this.checked=false;this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.innerHTML='';this.children=[];this.selectionStart=0;}
   addEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k] || '';}
   append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
   querySelectorAll(){return [];}focus(){}showModal(){this.open=true;}close(){this.open=false;}
 }
 const elements=new Map(ids.map(id=>[id,new Element()]));
 const storage=()=>({getItem(){return null;},setItem(){},removeItem(){}});
 const scope={document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>new Element(),createTextNode:s=>s,documentElement:new Element(),body:new Element()},localStorage:storage(),sessionStorage:storage(),navigator:{},fetch:()=>new Promise(()=>{}),setInterval:()=>0,setTimeout:()=>0,clearTimeout(){},AbortController,URLSearchParams,TextEncoder,TextDecoder,console,confirm:()=>false};scope.window=scope;scope.addEventListener=()=>{};
 vm.createContext(scope);
 for(const m of html.matchAll(/<script src="\/([^"]+)" defer><\/script>/g))vm.runInContext(await fs.readFile(path.join(source,m[1]),'utf8'),scope,{filename:m[1]});
 for(const id of ['workbenchButton','archiveChat','fileHistory','saveInstructions','queueTest'])assert.equal(typeof elements.get(id).onclick,'function',id);
});
test('Native Ollama applies independent profile settings on the wire',async()=>{
 const {OllamaProvider}=require('../ollama.cjs');const p=new OllamaProvider({baseURL:'http://localhost:11434',streaming:false,timeout:1000});const requests=[];
 p.info=async()=>({capabilities:['tools']});p.connect=async(_,body)=>{requests.push(body);return new Response(JSON.stringify({message:{role:'assistant',content:'ok'},done:true}));};
 const signal=new AbortController().signal;
 await Promise.all(['light','extended'].map(profile=>p.generate({model:'test',messages:[{role:'user',content:'hello'}],jennySettings:profileSettings(p.settings,profile)},signal,()=>{})));
 assert.equal(requests[0].options.num_ctx,4096);assert.equal(requests[1].options.num_ctx,16384);assert.equal(p.settings.context,8192);
});

test('Legacy downgrade export closes pending tool calls without changing SQLite',async t=>{
 const {data,root}=await fixture(t),store=new SessionStore(data);
 store.save({id:'a-b',messages:[{role:'assistant',tool_calls:[{id:'call',type:'function',function:{name:'write_files',arguments:'{}'}}]}],pending:{id:'pending'},queue:[{}],status:'waiting'});store.close();
 const dest=path.join(root,'legacy');await exec(process.execPath,[path.join(__dirname,'../scripts/export-legacy.cjs'),data,dest]);
 const old=JSON.parse(await fs.readFile(path.join(dest,'a-b.json'),'utf8'));assert.equal(old.pending,null);assert.equal(old.messages.at(-1).role,'tool');assert.equal(old.messages.at(-1).tool_call_id,'call');
 const again=new SessionStore(data);assert.equal(again.all()[0].status,'waiting');again.close();
});
test('Server entrypoint rejects concurrent data use and releases its lock on shutdown',async t=>{
 const {data,w}=await fixture(t);const {spawn}=require('node:child_process');const {once}=require('node:events');
 const env={...process.env,DATA_DIR:data,WORKSPACES_DIR:w.root,PORT:'0',HOST:'127.0.0.1',JENNY_TOKEN:''};
 const child=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env,stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),5000);timer.unref();})]);
 await assert.rejects(exec(process.execPath,[path.join(__dirname,'../server.cjs')],{env}),/EEXIST/);
 const exited=once(child,'exit');child.kill('SIGTERM');await exited;
 await assert.rejects(fs.stat(path.join(data,'.jenny-active')),e=>e.code==='ENOENT');
});
