'use strict';
const {randomUUID}=require('node:crypto');
const {request}=require('./network.cjs');
// Explicitly supports the stable 2025-11-25 Streamable HTTP protocol.
class MCP {
  constructor(config){this.config=config;this.session=null;}
  async close(){
    if(!this.session)return;
    const headers={'Mcp-Session-Id':this.session,'MCP-Protocol-Version':'2025-11-25'};
    if(this.config.token)headers.Authorization='Bearer '+this.config.token;
    this.session=null;
    // Session deletion is optional; cleanup must not hide a completed tool result.
    try{await request(this.config.url,{method:'DELETE',headers,privateNetwork:this.config.privateNetwork===true,signal:AbortSignal.timeout(3000)});}catch{}
  }
  async rpc(method,params,signal,notification=false) {
    const id=randomUUID();
    const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
    if(this.config.token)headers.Authorization='Bearer '+this.config.token;
    if(this.session)headers['Mcp-Session-Id']=this.session;
    const r=await request(this.config.url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id}:{}),method,params}),signal,privateNetwork:this.config.privateNetwork===true,complete:(text,headers)=>{
      if(!(headers['content-type']||'').includes('text/event-stream'))return false;
      return text.split(/\r?\n\r?\n/).slice(0,-1).some(event=>{try{return JSON.parse(event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n')).id===id;}catch{return false;}});
    }});
    if(r.status<200||r.status>=300)throw Error('MCP HTTP '+r.status);
    if(r.headers['mcp-session-id'])this.session=r.headers['mcp-session-id'];
    if(notification)return;
    let message;
    if((r.headers['content-type']||'').includes('text/event-stream')) {
      for(const event of r.text.split(/\r?\n\r?\n/)) {
        const data=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if(data){const value=JSON.parse(data);if(value.id===id)message=value;}
      }
    } else message=JSON.parse(r.text);
    if(message?.id!==id || message.jsonrpc!=='2.0')throw Error('MCP response ID mismatch.');
    if(message.error)throw Error('MCP request failed ('+message.error.code+').');
    return message.result;
  }
  async init(signal){
    const r=await this.rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'jenny-web',version:'0.6.0'}},signal);
    if(r.protocolVersion!=='2025-11-25')throw Error('MCP server must support protocol 2025-11-25.');
    await this.rpc('notifications/initialized',{},signal,true);
  }
  async list(signal){
    await this.init(signal);const tools=[];let cursor;
    for(let page=0;page<5;page++) {
      const r=await this.rpc('tools/list',cursor?{cursor}:{},signal);
      if(!Array.isArray(r.tools))throw Error('Invalid MCP tool list.');
      tools.push(...r.tools);if(tools.length>100)throw Error('MCP tool limit exceeded.');
      cursor=r.nextCursor;if(!cursor)return tools;
    }
    throw Error('MCP pagination limit exceeded.');
  }
  async call(name,args,signal){await this.init(signal);return this.rpc('tools/call',{name,arguments:args},signal);}
}
module.exports={MCP};
