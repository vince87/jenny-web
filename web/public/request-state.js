(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JennyState=api;})(globalThis,function(){
  class RequestGate {
    constructor(){this.generation=0;}
    begin(key){return {key,generation:++this.generation};}
    invalidate(){this.generation++;}
    accepts(ticket,key){return ticket.key===key&&ticket.generation===this.generation;}
  }
  return {RequestGate};
});
