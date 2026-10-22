import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { AGENT_HQ_SUPABASE_URL, AGENT_HQ_PUBLISHABLE_KEY } from './agent-cloud-config.js';
export const agentCloud = createClient(AGENT_HQ_SUPABASE_URL, AGENT_HQ_PUBLISHABLE_KEY);
export function connectAgentHQ() { return agentCloud; }
