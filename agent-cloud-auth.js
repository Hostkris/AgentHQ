import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { AGENT_HQ_SUPABASE_URL } from './agent-cloud-config.js';
export function connectAgentHQ(publishableKey) { return createClient(AGENT_HQ_SUPABASE_URL, publishableKey); }
