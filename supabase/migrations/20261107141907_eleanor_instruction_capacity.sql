-- Eleanor's complete standing instructions exceed the original generic-worker limit.
-- Preserve the ordinary worker limit and the existing minimum; never truncate text.
alter table public.agent_custom_bots
 drop constraint agent_custom_bots_instructions_check,
 add constraint agent_custom_bots_instructions_check check (
  char_length(btrim(instructions)) between 20 and
   case when template_key='eleanor-secretary-v1' then 8000 else 4500 end
 );
