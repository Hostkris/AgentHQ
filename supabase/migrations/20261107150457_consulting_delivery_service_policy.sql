-- The private deduplication ledger is accessible only to the trusted service.
create policy consulting_delivery_service_only
 on agent_hq_private.consulting_deliveries for all to service_role
 using(true) with check(true);
