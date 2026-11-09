import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {agentAlertDestination} from '../agent-message-navigation.js';
import {activityHTML} from '../agent-activity-view.js';
const id='22222222-2222-4222-8222-222222222222';

test('An agent alert opens the saved requesting worker and exact project',()=>{
 for(const phase of ['waiting_owner','waiting_permission']){
  const projects=[{assignment_id:id,phase,waiting_worker:'riley'}];
  assert.deepEqual(agentAlertDestination({actor:'Alex',project_id:id,alert_kind:'question'},projects),{kind:'message',worker:'riley',projectId:id});
 }
});
test('A stale question opens the project once its waiting question is resolved',()=>{
 for(const phase of ['discussion','review','approved'])
  assert.deepEqual(agentAlertDestination({actor:'Riley',project_id:id,alert_kind:'question'},[{assignment_id:id,phase}]),{kind:'project',projectId:id});
});
test('An early popup can open the named worker before project sync completes',()=>{
 assert.deepEqual(agentAlertDestination({actor:'Riley',project_id:id,alert_kind:'question'}),{kind:'message',worker:'riley',projectId:id});
 assert.deepEqual(agentAlertDestination({actor:'MAYA',alert_kind:'approval'}),{kind:'message',worker:'maya',projectId:null});
 assert.deepEqual(agentAlertDestination({actor:'Alex',project_id:id,alert_kind:'review'}),{kind:'project',projectId:id});
});
test('Unknown actors and malformed destinations cannot become arbitrary navigation',()=>{
 for(const actor of ['<script>','https://example.com','unknown',null])
  assert.deepEqual(agentAlertDestination({actor,project_id:'javascript:alert(1)'}),{kind:'approvals'});
 assert.deepEqual(agentAlertDestination({project_id:id}),{kind:'project',projectId:id});
});
test('Escaped activity titles settle instead of triggering endless observer repaints',()=>{
 const source=readFileSync(new URL('../agent-activity-cloud.js',import.meta.url),'utf8');
 const paint=source.slice(source.indexOf('function paint(){'),source.indexOf('function schedule('));
 // The browser serializes an escaped apostrophe as a literal apostrophe.
 // The two source strings must represent the same DOM, without another write.
 const serialize=value=>String(value).replaceAll('&#39;',"'").replaceAll('\u00a0','&nbsp;');
 let html=activityHTML([{state:'waiting',actor:'riley',text:'Riley is waiting for your answer',title:"Owner's Elysian Noir comparison",projectId:id}]);
 let markup=serialize(html),writes=0;
 const root={dataset:{agentActivityThread:'riley'},hidden:false,get innerHTML(){return markup},set innerHTML(value){writes++;markup=serialize(value)}};
 const document={querySelectorAll:()=>[root],createElement(){let value='';return {get innerHTML(){return value},set innerHTML(input){value=serialize(input)}}}};
 const scope={document,labels:{},render:()=>html};runInNewContext(paint+';this.repaint=paint;',scope);
 for(let i=0;i<20;i++)scope.repaint();
 assert.equal(writes,0,'Unchanged browser-normalized content must not be replaced');
 html=activityHTML([{state:'waiting',actor:'riley',text:'Riley is waiting for your answer',title:"Owner's updated comparison",projectId:id}]);
 for(let i=0;i<20;i++)scope.repaint();
 assert.equal(writes,1,'An actual update must write once, then settle');
 html='';scope.repaint();scope.repaint();assert.equal(writes,2);assert.equal(root.hidden,true);
});
