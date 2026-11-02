import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bridgeHandler} from '../supabase/functions/agent-chatgpt-bridge/handler.ts';
import {APP_URL,BRIDGE_URL,MCP_URL,SCOPES,hash,secret,pkce,trustedRedirect,resolveClient,startAuthorization,exchangeTokens,authenticateConnection} from '../supabase/functions/agent-chatgpt-bridge/oauth.ts';
import {TOOLS,trustedFileURL,fetchFile,validateFile,returnFiles,callProjectTool} from '../supabase/functions/agent-chatgpt-bridge/projects.ts';
const own='11111111-1111-4111-8111-111111111111',other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',project='22222222-2222-4222-8222-222222222222',hid='33333333-3333-4333-8333-333333333333',claim='44444444-4444-4444-8444-444444444444',cid='55555555-5555-4555-8555-555555555555',photo='66666666-6666-4666-8666-666666666666';
import {fixture} from './fixtures/chatgpt-handoff-db.mjs';
const request=(path,body,token)=>new Request(BRIDGE_URL+path,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
test('MCP discovery is public but every private tool requires a scoped, unexpired and non-revoked authorization',async()=>{
 const db=await fixture(),handler=bridgeHandler(db,o=>o===own);
 const metadata=await (await handler(new Request(BRIDGE_URL+'/.well-known/openid-configuration'))).json();assert.equal(metadata.issuer,BRIDGE_URL);assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
 const init=await (await handler(request('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}}))).json();assert.equal(init.result.protocolVersion,'2025-11-25');
 const descriptors=await (await handler(request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'}))).json();assert.equal(descriptors.result.tools.length,5);assert.ok(!JSON.stringify(descriptors).includes('Study plan'));
 const call={jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_project_handoffs',arguments:{}}};const denied=await handler(request('/mcp',call));assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/oauth-protected-resource/);
 db.tables.agent_chatgpt_handoffs.push({id:photo,owner_id:other,status:'ready',brief:'Other owner secret'});const response=await (await handler(request('/mcp',call,db.token))).json();assert.equal(response.result.structuredContent.handoffs.length,1);assert.ok(!JSON.stringify(response).includes('Other owner secret'));assert.ok(db.tables.agent_chatgpt_connections[0].last_used_at);
 db.tables.agent_chatgpt_connections[0].revoked_at=new Date().toISOString();assert.equal((await handler(request('/mcp',call,db.token))).status,401);
 assert.equal((await handler(request('/mcp',{jsonrpc:'2.0',method:'notifications/initialized'}))).status,202);
 const badOrigin=new Request(BRIDGE_URL+'/mcp',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'});assert.equal((await handler(badOrigin)).status,403);
});
test('OAuth accepts only official ChatGPT callbacks and S256 with exact resource and returns a one-use authorization request',async()=>{
 const db=await fixture(),client=crypto.randomUUID();db.tables.agent_chatgpt_clients.push({client_id:client,redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']});
 assert.equal(trustedRedirect('https://chatgpt.com.evil.invalid/connector_platform_oauth_redirect'),false);assert.equal(trustedRedirect('https://chatgpt.com/connector_platform_oauth_redirect?next=https://evil.invalid'),false);
 const params=new URLSearchParams({client_id:client,redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',state:'random-state',response_type:'code',resource:MCP_URL,code_challenge:await pkce(secret()),code_challenge_method:'S256',scope:SCOPES.join(' ')});
 const redirect=await startAuthorization(db,params);assert.equal(new URL(redirect).origin,new URL(APP_URL).origin);assert.ok(new URL(redirect).searchParams.get('agenthq_chatgpt_authorize'));assert.equal(db.tables.agent_chatgpt_authorizations.length,1);assert.equal(db.tables.agent_chatgpt_authorizations[0].owner_id,undefined);
 params.set('resource','https://evil.invalid/mcp');await assert.rejects(()=>startAuthorization(db,params),/Invalid/);assert.equal(db.tables.agent_chatgpt_authorizations.length,1);
 const handler=bridgeHandler(db,o=>o===own),id=db.tables.agent_chatgpt_authorizations[0].id;
 const consent=await (await handler(request('',{action:'authorization_decision',request_id:id,decision:'approve'},'owner-session'))).json(),url=new URL(consent.redirect_url);assert.equal(url.origin,'https://chatgpt.com');assert.equal(url.searchParams.get('state'),'random-state');assert.equal(url.searchParams.get('iss'),BRIDGE_URL);assert.equal(db.tables.agent_chatgpt_authorizations[0].code_hash,await hash(url.searchParams.get('code')));assert.ok(!JSON.stringify(db.tables).includes(url.searchParams.get('code')));
 const repeat=await handler(request('',{action:'authorization_decision',request_id:id,decision:'approve'},'owner-session'));assert.equal(repeat.status,400);
});
test('CIMD client metadata cannot be used for SSRF or redirect substitution',async()=>{
 const db=await fixture();let calls=0;const id='https://chatgpt.com/oauth/client.json',fetcher=async url=>{calls++;assert.equal(url,id);return Response.json({client_id:id,client_name:'ChatGPT',redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect'],token_endpoint_auth_methods_supported:['none','private_key_jwt']});};
 assert.ok((await resolveClient(db,id,fetcher)).redirect_uris.length);await assert.rejects(()=>resolveClient(db,'https://127.0.0.1/client.json',fetcher),/Only the official/);assert.equal(calls,1);
 await assert.rejects(()=>resolveClient(db,id,async()=>Response.json({client_id:id,client_name:'ChatGPT',redirect_uris:['https://evil.invalid/'],token_endpoint_auth_method:'none'})),/Invalid/);
});
test('Token requests hash credentials and bind the code, client, exact callback, PKCE and resource',async()=>{
 const db=await fixture(),code=secret(),verifier=secret();const result=await exchangeTokens(db,new URLSearchParams({grant_type:'authorization_code',code,client_id:cid,redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',code_verifier:verifier,resource:MCP_URL}));
 assert.ok(result.access_token&&result.refresh_token);const args=db.calls.find(c=>c[0]==='exchange_agent_chatgpt_code')[1];assert.equal(args.p_challenge,await pkce(verifier));assert.equal(args.p_hash,await hash(code));assert.equal(args.p_access,await hash(result.access_token));assert.equal(args.p_resource,MCP_URL);
 await assert.rejects(()=>exchangeTokens(db,new URLSearchParams({grant_type:'password',resource:MCP_URL})),/Unsupported/);
 db.tables.agent_chatgpt_connections[0].access_expires_at=new Date(0).toISOString();assert.equal(await authenticateConnection(db,db.token,()=>true),null);
});
test('OpenAI file parameters expose only file references and reject arbitrary URLs and redirect escapes',async()=>{
 const descriptor=TOOLS.find(t=>t.name==='return_project_files');assert.deepEqual(descriptor._meta['openai/fileParams'],['files']);const file=descriptor.inputSchema.properties.files.items;assert.deepEqual(file.required,['download_url','file_id']);assert.deepEqual(Object.keys(file.properties).sort(),['download_url','file_id','file_name','mime_type']);
 for(const u of ['http://files.oaiusercontent.com/x','https://files.oaiusercontent.com.evil.invalid/x','https://127.0.0.1/x','https://evil.blob.core.windows.net/x','https://files.oaiusercontent.com:8443/x'])assert.equal(trustedFileURL(u),null);
 await assert.rejects(()=>fetchFile({file_id:'file-1',download_url:'https://files.oaiusercontent.com/source'},async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data'}})),/redirected outside/);
 await assert.rejects(()=>fetchFile({file_id:'file-1',download_url:'https://files.oaiusercontent.com/source'},async()=>new Response('x',{headers:{'content-length':'9999999'}})),/5 MB/);
});
test('The actual file bytes are downloaded, parsed, checksum-verified in private storage and returned for review; retry does not duplicate',async()=>{
 const require=createRequire(import.meta.url),pdf=require(require.resolve('pdf-lib',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]})),doc=await pdf.PDFDocument.create();doc.addPage().drawText('A real study plan for review');const bytes=await doc.save(),db=await fixture(),input={handoff_id:hid,claim_id:claim,revision:2,summary:'The attached PDF contains the completed study plan and is ready for owner review.',files:[{file_id:'file-real-pdf',download_url:'https://files.oaiusercontent.com/plan',file_name:'Study plan.pdf',mime_type:'application/pdf'}]};
 let calls=0;const fetcher=async()=>{calls++;return new Response(bytes)};
 const result=await returnFiles(db,{id:cid,owner_id:own},input,fetcher,pdf);assert.equal(result.state,'review');assert.equal(db.objects.size,1);const saved=db.calls.find(c=>c[0]==='finish_agent_chatgpt_handoff')[1];assert.equal(saved.p_files[0].sha256,await hash(bytes));assert.ok(saved.p_files[0].path.startsWith(own+'/'+project+'/chatgpt/'+hid+'/'));assert.ok(saved.p_lease);
 const retry=await returnFiles(db,{id:cid,owner_id:own},input,fetcher,pdf);assert.equal(retry.duplicate,true);assert.equal(calls,1);assert.equal(db.objects.size,1);
 await assert.rejects(()=>returnFiles(db,{id:cid,owner_id:other},input,fetcher,pdf),/not available/);
});
test('A failed or superseded file return cleans new uploads and never reports completion',async()=>{
 const db=await fixture();db.failFinish=true;const input={handoff_id:hid,claim_id:claim,revision:2,summary:'The attached text file contains all of the requested source notes.',files:[{file_id:'file-notes',download_url:'https://files.oaiusercontent.com/notes',file_name:'Notes.txt',mime_type:'text/plain'}]};
 await assert.rejects(()=>returnFiles(db,{id:cid,owner_id:own},input,async()=>new Response('These are real source notes and requirements.')),/Project changed/);assert.equal(db.objects.size,0);assert.equal(db.tables.agent_chatgpt_handoffs[0].status,'in_progress');
 const before=db.calls.length;db.tables.agent_project_sessions[0].revision=3;await assert.rejects(()=>returnFiles(db,{id:cid,owner_id:own},input,async()=>{throw Error('must not fetch')}),/project changed/);assert.equal(db.calls.length,before);
 await assert.rejects(()=>validateFile(new TextEncoder().encode('<html><script>bad</script></html>'),{mime_type:'text/plain'}),/executable/);
});
test('Reference image tool forwards actual owned pixels and source direction, never another project image',async()=>{
 const db=await fixture(),bytes=Uint8Array.from([255,216,255,1,2,3,4,5]),path=own+'/'+project+'/references/'+photo+'.jpg';db.objects.set(path,bytes);db.tables.agent_project_photos.push({id:photo,owner_id:own,assignment_id:project,object_path:path,sha256:await hash(bytes),mime_type:'image/jpeg',caption:'Use navy and ivory.',filename:'Style.jpg'});
 const result=await callProjectTool(db,{id:cid,owner_id:own},'get_handoff_reference_photo',{handoff_id:hid,photo_id:photo});assert.equal(result.content[1].type,'image');assert.equal(Buffer.from(result.content[1].data,'base64').compare(Buffer.from(bytes)),0);assert.match(result.content[0].text,/Use navy and ivory/);
 await assert.rejects(()=>callProjectTool(db,{id:cid,owner_id:other},'get_handoff_reference_photo',{handoff_id:hid,photo_id:photo}),/not available/);
});
