// Interoperability with the official pinned MCP client. All private data is synthetic.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {bridgeHandler} from '../supabase/functions/agent-chatgpt-bridge/handler.ts';
import {BRIDGE_URL,MCP_URL} from '../supabase/functions/agent-chatgpt-bridge/oauth.ts';
import {fixture} from './fixtures/chatgpt-handoff-db.mjs';
const require=createRequire(import.meta.url),sdk=process.env.AGENTHQ_MCP_SDK_ROOT||new URL('..',pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js'))).pathname;
const {Client}=await import(pathToFileURL(sdk+'/client/index.js')),{StreamableHTTPClientTransport}=await import(pathToFileURL(sdk+'/client/streamableHttp.js')),{discoverAuthorizationServerMetadata,discoverOAuthProtectedResourceMetadata}=await import(pathToFileURL(sdk+'/client/auth.js'));
const own='11111111-1111-4111-8111-111111111111',db=await fixture(),handler=bridgeHandler(db,o=>o===own);
const fakeFetch=async(url,init={})=>handler(new Request(String(url),init));
const resource=await discoverOAuthProtectedResourceMetadata(MCP_URL,{resourceMetadataUrl:BRIDGE_URL+'/.well-known/oauth-protected-resource'},fakeFetch);assert.equal(resource.resource,MCP_URL);
const metadata=await discoverAuthorizationServerMetadata(resource.authorization_servers[0],{fetchFn:fakeFetch});assert.equal(metadata.issuer,BRIDGE_URL);assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);console.log('PASS: official MCP client discovers OAuth metadata through the path-based issuer fallback');
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const method=req.method||'GET',r=await handler(new Request(BRIDGE_URL+(req.url||'/'),{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(new Uint8Array(await r.arrayBuffer()));}catch(e){res.statusCode=500;res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port+'/mcp',client=new Client({name:'Agent HQ protocol fixture',version:'1.0.0'});
try{await client.connect(new StreamableHTTPClientTransport(new URL(address),{requestInit:{headers:{Authorization:'Bearer '+db.token}}}));const tools=await client.listTools();assert.equal(tools.tools.length,5);const result=await client.callTool({name:'list_project_handoffs',arguments:{}});assert.equal(result.structuredContent.handoffs.length,1);console.log('PASS: official MCP client initializes, discovers file-return tools and reads only an authorized handoff');}finally{await client.close();await new Promise(r=>server.close(r));}
