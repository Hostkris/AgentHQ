-- Forward fix for the already-installed initiative RPC. Project kind must be
-- from the existing workspace enum; autonomous work is tracked in metadata.
do $patch$
declare definition text;
 old_text text:=chr(39)||'project_kind'||chr(39)||','||chr(39)||'internal_initiative'||chr(39);
 new_text text:=chr(39)||'project_kind'||chr(39)||','||chr(39)||'general'||chr(39);
begin
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='agent_hq_launch_autonomy';
 if definition is null then raise exception 'Initiative function is missing';end if;
 if position(old_text in definition)>0 then execute replace(definition,old_text,new_text);end if;
end $patch$;
