create or replace function agent_hq_private.chatgpt_money_related(p_worker text,p_text text)
returns boolean language sql immutable set search_path='' as $$
 select p_worker='avery' or
  regexp_replace(lower(normalize(coalesce(p_text,''),NFKC)),'[​-‏⁠-⁯]','','g') ~
  '[$£€¥₹]|\m(usd|eur|gbp|cad|aud|dollars?|money|monetary|financial|finance|billing|bill|bills|invoice|invoices|payment|payments|pay|paid|purchase|purchases|buy|buying|spend|spending|budget|budgets|bank|banking|credit|debit|refund|refunds|subscription|subscriptions|price|prices|pricing|cost|costs|profit|profits|margin|margins|revenue|income|salary|wages|tax|taxes|loan|loans|debt|dividends?|investment|investing|invest|stocks?|trading|crypto|roi|roas|checkout|fees?|discounts?|commissions?|charges?|charging|cash|earn|earning|earnings|sales|sell|selling|expenses?|rent|mortgage)\M';
$$;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_chatgpt_requests') then
  alter publication supabase_realtime add table public.agent_chatgpt_requests;
 end if;
end $$;
