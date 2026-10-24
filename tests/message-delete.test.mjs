import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plain=s=>s.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(){
 const listeners=new Map(),calls=[],ledger=[];let auth,fail=false,uid='owner';
 const document={addEventListener:(n,fn)=>listeners.set(n,fn),dispatchEvent:()=>{},hidden:false};
 const window={addEventListener(){},confirm:()=>true};
 const context={window,document,CustomEvent:class{},setInterval(){},setTimeout:fn=>setImmediate(fn),URL,URLSearchParams,console};
 const cloud={auth:{getUser:async()=>({data:{user:{id:uid}}}),onAuthStateChange:fn=>auth=fn},
 from(){return {select(){return this},eq(){return this},order(){return this},range:async(a,b)=>({data:ledger.slice(a,b+1)})}},
 rpc:async(name,args)=>{calls.push({name,args});if(fail)return {error:{message:'Offline'}};ledger.push({kind:args.p_kind,item_key:args.p_key});return {data:true}}};
 vm.createContext(context);vm.runInContext(plain(source('agent-message-controls.js')),context);
 context.cloud=cloud;vm.runInContext('connectMessageControls(cloud)',context);
 return {context,window,calls,ledger,listeners,fail:()=>fail=true,authChange:()=>{uid='other';auth('SIGNED_OUT')}};
}
const workerIds=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'];
const escapeHTML=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fn(name){const s=source('app.js'),start=s.indexOf('function '+name+'('),end=s.indexOf('\nfunction ',start+10);return s.slice(start,end<0?undefined:end)}
test('Every built-in worker and HQ renders X on owner, worker, handoff, approval and sending bubbles',()=>{
 const h=harness(),c=h.context;
 Object.assign(c,{active:'riley',staff:workerIds.map(id=>[id,'',id,'Worker']),messages:new Map(),approvalRequests:new Map(),sendFeedback:new Map(),sendingAgents:new Set(),escapeHTML,messageHTML:escapeHTML,naturalChatText:escapeHTML,chatSelecting:()=>false,chatSelected:new Set(),chatSelectionKey:(kind,id)=>kind+":"+id,renderConversationResearch:()=>"",renderChatConnectorCard:()=>'',renderConversationWork:()=>''});
 vm.runInContext(fn('renderIPhoneChat'),c);
 for(const id of workerIds){
  c.active=id;c.messages.set(id,[...['owner','employee','system'].map((sender,i)=>({id:id+i,sender,text:'Text <script>unsafe</script>',createdAt:'2026-10-24'})),{id:'req',type:'approval'},{id:'pending',sender:'owner',text:'Sending',pending:true}]);
  c.approvalRequests.set('req',{id:'req',website:'https://example.com',reason:'Test',status:'pending'});
  const html=vm.runInContext('renderIPhoneChat()',c);
  assert.equal((html.match(/data-chat-dismiss=/g)||[]).length,5,id);
  assert.equal((html.match(/aria-label="Delete message"/g)||[]).length,5,id);
  assert.match(html,/Available after sending" disabled/);assert(!html.includes('<script>unsafe'));
 }
});
test('Team work and connection cards have durable independent dismiss controls',async()=>{
 const h=harness(),c=h.context;await tick();
 Object.assign(c,{active:'casey',clearedAtByWorker:new Map(),staff:[],escapeHTML,location:new URL('https://example.com/'),chatGmailStatus:{connected:false},chatGmailGrants:[],metaState:{},teamAssignments:new Map([['job',{id:'job',title:'Draft',employee_ids:['casey'],coordination_status:'planning'}]]),coordSteps:new Map(),teamNotes:new Map(),workerLabel:x=>x});
 vm.runInContext(fn('renderChatConnectorCard'),c);
 assert.match(vm.runInContext('renderChatConnectorCard([{id:"scope",text:"connect Facebook"}])',c),/data-chat-dismiss="connector"/);
 vm.runInContext(fn('conversationDraftInfo')+'\n'+fn('renderConversationWork'),c);
 assert.match(vm.runInContext('renderConversationWork("casey")',c),/data-chat-dismiss="work"/);
 await h.window.agentHQMessageControls.dismiss('work','job');
 assert.equal(vm.runInContext('renderConversationWork("casey")',c),'');
 assert.equal(c.teamAssignments.size,1);
});
test('Facebook cards get X in every state, including expired legacy cards',async()=>{
 const h=harness(),c=h.context;await tick();
 const rows=['pending','approved','analyzing','completed','denied','revoked','failed','expired'].map((status,i)=>({id:'request'+i,status:status==='expired'?'pending':status,purpose:'Review <script>unsafe</script>',source_url:'https://www.facebook.com/example',expires_at:new Date(Date.now()+(status==='expired'?-1:1)*3600000).toISOString()}));
 c.socialCloud={auth:{getUser:async()=>({data:{user:{id:'owner'}}}),onAuthStateChange(){}},from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:rows})})};
 c.localStorage={getItem:()=>null};c.crypto={};
 // Keep independent module lexical names isolated while using the real helper.
 vm.runInContext('(function(){const agentCloud=socialCloud;'+plain(source('agent-social-read-cloud.js'))+'})()',c);await tick();
 const html=h.window.agentHQSocialReadThread('riley');
 assert.equal((html.match(/data-chat-dismiss="social"/g)||[]).length,8);
 assert.match(html,/>expired</);assert(!html.includes('<script>unsafe'));
 await h.window.agentHQMessageControls.dismiss('social','request7');
 assert(!h.window.agentHQSocialReadThread('riley').includes('data-chat-item="request7"'));
 assert.equal(h.window.agentHQSocialReadThread('alex'),'');
});
test('Custom-worker replies, owner texts, handoffs and welcome text each have X',()=>{
 const h=harness(),s=source('agent-bot-studio-ui.js'),start=s.indexOf(' function render(){'),end=s.indexOf('\n function collect()',start);
 const bot={id:'bot',name:'Custom worker',role:'Research',starting_message:'Hello',status:'active'};
 Object.assign(h.context,{tab:'chat',E:escapeHTML,bots:[bot],selectedBot:()=>bot,chats:new Map([['bot',['owner','worker','handoff'].map((sender,i)=>({id:'m'+i,body:sender,sender}))]]),busy:false,feedback:''});
 vm.runInContext(s.slice(start,end),h.context);
 assert.equal((vm.runInContext('render()',h.context).match(/data-chat-dismiss="bot"/g)||[]).length,3);
 h.context.chats.clear();assert.match(vm.runInContext('render()',h.context),/data-chat-dismiss="welcome"/);
});
test('Deletion persists through reloads, pages old dismissals, and errors never hide a message',async()=>{
 const h=harness();await tick();
 for(let i=0;i<1005;i++)h.ledger.push({kind:'team',item_key:String(i)});
 await h.window.agentHQMessageControls.refresh();assert(h.window.agentHQMessageControls.isDeleted('team','1004'));
 await h.window.agentHQMessageControls.dismiss('message','m');
 await h.window.agentHQMessageControls.refresh();assert(h.window.agentHQMessageControls.isDeleted('message','m'));
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{name:'dismiss_agent_chat_item',args:{p_kind:'message',p_key:'m'}});
 h.fail();await assert.rejects(h.window.agentHQMessageControls.dismiss('message','keep'),/Offline/);
 assert(!h.window.agentHQMessageControls.isDeleted('message','keep'));
 h.authChange();assert(!h.window.agentHQMessageControls.isDeleted('message','m'));
});
test('Cancel on X sends no delete request or approval',async()=>{
 const h=harness();await tick();h.window.confirm=()=>false;
 const button={dataset:{chatDismiss:'social',chatItem:'request'}};
 await h.listeners.get('click')({target:{closest:()=>button},preventDefault(){},stopPropagation(){}});
 assert.equal(h.calls.length,0);
});

