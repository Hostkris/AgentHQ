import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {bridgeHandler} from './handler.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=(owner:string)=>(Deno.env.get('AGENT_HQ_ALLOWED_OWNER_IDS')||'').split(',').some(id=>id.trim().toLowerCase()===owner.toLowerCase());
// Public OAuth discovery; project tools require separately verified, scoped OAuth tokens.
Deno.serve(bridgeHandler(db,allowed));
