import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Camera app is a simple live viewfinder with one-tap capture, no worker form',()=>{
 const home=read('agent-home-layout.js');
 const camera=read('agent-camera-cloud.js');
 const app=read('app.js'),index=read('index.html');
 assert.match(home,/\["camera","Camera"/);
 assert.match(camera,/getUserMedia/);
 assert.match(camera,/async function snapshot\(/);
 assert.match(camera,/class="camera-shutter"/);
 assert.match(camera,/data-camera-album/);
 assert.doesNotMatch(camera,/camera-share-panel|camera-recipient|camera-note/);
 assert.match(app,/screen==="camera"/);
 assert.match(index,/agent-camera-cloud\.js/);
});

test('Snapshots save to a separate private owner-scoped Agent HQ Camera Roll',()=>{
 const camera=read('agent-camera-cloud.js');
 const migration=read('supabase/migrations/20261024090000_owner_private_camera_roll.sql');
 assert.match(camera,/async function saveToCameraRoll/);
 assert.match(camera,/from\('agent_camera_photos'\)\.insert/);
 assert.match(camera,/storage\.from\(BUCKET\)\.upload/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/camera\/%/);
 assert.doesNotMatch(camera,/getPublicUrl\(/);
});

test('Owners choose which worker receives a saved photo in Messages',()=>{
 const camera=read('agent-camera-cloud.js'),app=read('app.js');
 assert.match(camera,/openForChat/);
 assert.match(camera,/async function sendDraft/);
 assert.match(camera,/employee_id:target/);
 assert.match(camera,/agent-hq-image-review/);
 assert.match(app,/data-photo-drafts/);
 assert.match(camera,/hasDrafts/);
 assert.match(app,/data-camera-open-chat/);
 assert.match(app,/renderPhotoItem\(item,editingMessages/);
});

test('Home pages glide with live drag reordering and never display move arrows',()=>{
 const home=read('agent-home-layout.js'),css=read('ios-ui.css');
 assert.match(home,/home-slide-viewport/);
 assert.match(home,/function progressSwipe/);
 assert.match(home,/function switchDragPage/);
 assert.match(home,/function reorderAt/);
 assert.match(home,/requestAnimationFrame\(animateGhost\)/);
 assert.match(css,/home-slide-track/);
 assert.match(css,/cubic-bezier/);
 assert.doesNotMatch(home,/data-home-nav|data-home-shift|data-home-next-page/);
});

test('Messages supports iOS-style long-press selection and confirmed bulk deletion',()=>{
 const app=read('app.js'),cloud=read('agent-messages-cloud.js');
 assert.match(app,/data-chat-enter-select/);
 assert.match(app,/data-chat-select-all/);
 assert.match(app,/data-chat-delete-selected/);
 assert.match(app,/data-chat-delete-all/);
 assert.match(app,/function enterBubbleSelection/);
 assert.match(app,/Permanently delete/);
 assert.match(cloud,/async function deleteMessages/);
 assert.match(cloud,/rpc\('delete_agent_chat_message'/);
 assert.match(cloud,/clearConversation/);
});

