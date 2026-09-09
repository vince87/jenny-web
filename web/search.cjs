'use strict';
const {request,textHTML}=require('./network.cjs');
class SearchConfig {
 constructor(env=process.env){
  this.provider=(env.WEB_SEARCH_PROVIDER || (env.SEARXNG_BASE_URL?'searxng':'auto')).toLowerCase();
  if(!['auto','searxng','brave','duckduckgo'].includes(this.provider))throw Error('Invalid WEB_SEARCH_PROVIDER.');
  this.braveKey=env.BRAVE_SEARCH_API_KEY || '';
  this.privateNetwork=env.SEARXNG_ALLOW_PRIVATE==='true';
  if(env.SEARXNG_ALLOW_PRIVATE && !['true','false'].includes(env.SEARXNG_ALLOW_PRIVATE))throw Error('SEARXNG_ALLOW_PRIVATE must be true or false.');
  if(this.provider==='searxng'){
   if(!env.SEARXNG_BASE_URL)throw Error('Set SEARXNG_BASE_URL for SearXNG.');
   const url=new URL(env.SEARXNG_BASE_URL);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid SEARXNG_BASE_URL: use HTTP(S), without credentials, query or fragment.');
   url.pathname=url.pathname.replace(/\/+$/,'')+'/search';this.endpoint=url.href;
  }
 }
 view(){return {provider:this.provider,endpoint:this.endpoint || null,configuredByEnvironment:this.provider!=='auto'||!!this.braveKey,hasBraveKey:!!this.braveKey};}
 async searxng(query,signal){
  const url=new URL(this.endpoint);url.searchParams.set('q',query);url.searchParams.set('format','json');
  // Only this administrator-configured endpoint may use the private network.
  // Redirects are not followed and result links still pass through web_read checks.
  const response=await request(url.href,{signal,privateNetwork:this.privateNetwork,headers:{Accept:'application/json'}});
  if(response.status===403)throw Error('SearXNG HTTP 403: enable json in search.formats in SearXNG settings.yml, or check access rules.');
  if(response.status!==200)throw Error('SearXNG HTTP '+response.status+'; check SEARXNG_BASE_URL and server access.');
  let data;try{data=JSON.parse(response.text);}catch{throw Error('SearXNG did not return JSON. Enable search.formats: [html, json] in settings.yml.');}
  if(!Array.isArray(data.results))throw Error('Invalid SearXNG results.');
  const links=[];
  for(const item of data.results){
   if(!item || typeof item.url!=='string'||item.url.length>2000)continue;
   try{const link=new URL(item.url);if(!['http:','https:'].includes(link.protocol)||link.username||link.password)continue;
    links.push({title:textHTML(String(item.title||'')).slice(0,200),url:link.href,description:textHTML(String(item.content||'')).slice(0,1000)});
   }catch{continue;}
   if(links.length===5)break;
  }
  return {provider:'searxng',text:links.map(x=>x.title+'\n'+x.url+'\n'+x.description).join('\n\n'),links,untrusted:true};
 }
}
module.exports={SearchConfig};
