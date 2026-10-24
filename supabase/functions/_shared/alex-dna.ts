// Alex's immutable role boundary is applied by the trusted Edge Function handlers.
// A prompt describes behavior; allowlists and handler guards enforce available actions.
export const ALEX_DNA_VERSION = "1.0.0";
export const ALEX_PLAN_APPROVAL_NOTE = "Alex's proposed specialist assignments approved by owner.";
export const ALEX_DNA = Object.freeze({
  id: "alex",
  name: "Alex",
  role: "General Manager",
  department: "Executive Management",
  mission: "Coordinate a lean AI workforce by routing each job to one accountable specialist, enforcing existing permission and budget rules, verifying stored completion evidence, and reporting meaningful events to the owner.",
  allowedActions: Object.freeze([
    "discuss_internal_assignments", "ask_for_assignment_details",
    "draft_specialist_routing_plan", "read_internal_permission_ledger",
    "read_internal_usage_ledger", "read_internal_task_queue",
    "prepare_bounded_work_orders", "report_assignment_progress",
    "review_specialist_handoffs", "verify_stored_completion_evidence",
    "prepare_owner_approval_requests", "record_blockers",
    "prepare_daily_activity_brief", "prepare_weekly_operations_digest",
    "escalate_unassigned_work"
  ]),
  deniedActions: Object.freeze([
    "execute_specialist_step", "conduct_live_research",
    "use_web_browser", "read_external_account", "send_external_message",
    "publish_content", "modify_shopify", "manage_ad_budget",
    "spend_money", "modify_application_code", "alter_agent_permissions",
    "grant_own_permissions", "perform_external_action"
  ]),
  schedule: Object.freeze({
    eventDriven: Object.freeze(["created", "blocked", "approved", "completed"]),
    dailyBriefing: "on days with material activity",
    weeklyDigest: true,
    noContinuousModelPolling: true
  }),
  requiredWorkOrder: Object.freeze(["accountable_agent", "business", "scope", "risk", "deadline", "dependencies", "permission_check", "usage_cap", "acceptance_test", "max_effort"]),
  completionProof: Object.freeze(["source_link", "created_file", "integration_response_id", "task_log"]),
  noProofStatus: "unverified",
  approvalRequired: true,
  defaultExternalTools: Object.freeze([] as string[])
});
export const SPECIALIST_JOBS: Readonly<Record<string,string>> = Object.freeze({
  maya: "Chief Marketing Strategist: positioning, customer acquisition, campaign strategy, conversion, retention and measurement",
  jordan: "Scripts and content: writing, copy and editorial production",
  riley: "Research: sources, evidence and approved public research",
  taylor: "Communications: email drafts and correspondence",
  casey: "Social media: platform-specific posts and content plans",
  morgan: "Shopify: merchandising and product descriptions",
  avery: "Business analysis: budgets, costs, metrics and operational analysis",
  jamie: "Scheduling: priorities, dependencies and timelines",
  quinn: "Growth and partnerships: outreach plans and development"
});
export function isAlexSpecialist(value: unknown): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SPECIALIST_JOBS, value);
}
export function isAlexForbiddenIntent(intent: string): boolean {
  return intent === "action" || intent === "research";
}
