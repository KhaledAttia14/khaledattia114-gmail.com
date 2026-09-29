/**
 * Workflow state machine. Transitions are data (WorkflowTransitionRule rows) so they can be
 * configured by admins; this module holds the defaults and the pure evaluation logic.
 */
import type { Role } from "./rbac";
import type { Stage } from "./completeness";

export const WORKFLOW_STATUSES = [
  "NEW_IN_RMS",
  "RMS_QA",
  "READY_FOR_CONTENT",
  "CONTENT_IN_PROGRESS",
  "AWAITING_IMAGES",
  "READY_FOR_QC",
  "QC_IN_PROGRESS",
  "QC_APPROVED",
  "READY_FOR_MAGENTO",
  "MAGENTO_LINKED",
  "LIVE",
  "FINAL_REVIEW",
  "COMPLETED",
  "QC_REJECTED",
  "NEEDS_EDIT",
  "BLOCKED",
  "MISSING_DATA",
  "MISSING_IMAGES",
  "PROCUREMENT_FOLLOW_UP",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const MAIN_PATH: WorkflowStatus[] = WORKFLOW_STATUSES.slice(0, 13) as WorkflowStatus[];
export const EXCEPTION_STATUSES: WorkflowStatus[] = [
  "QC_REJECTED", "NEEDS_EDIT", "BLOCKED", "MISSING_DATA", "MISSING_IMAGES", "PROCUREMENT_FOLLOW_UP",
];

export const STATUS_LABELS: Record<WorkflowStatus, string> = {
  NEW_IN_RMS: "New in RMS",
  RMS_QA: "RMS QA",
  READY_FOR_CONTENT: "Ready for Content",
  CONTENT_IN_PROGRESS: "Content in Progress",
  AWAITING_IMAGES: "Awaiting Images",
  READY_FOR_QC: "Ready for QC",
  QC_IN_PROGRESS: "QC in Progress",
  QC_APPROVED: "QC Approved",
  READY_FOR_MAGENTO: "Ready for Magento",
  MAGENTO_LINKED: "Magento Linked",
  LIVE: "Live",
  FINAL_REVIEW: "Final Review",
  COMPLETED: "Completed",
  QC_REJECTED: "QC Rejected",
  NEEDS_EDIT: "Needs Edit",
  BLOCKED: "Blocked",
  MISSING_DATA: "Missing Data",
  MISSING_IMAGES: "Missing Images",
  PROCUREMENT_FOLLOW_UP: "Procurement Follow-up",
};

/** Tailwind tone per status (used by StatusBadge). */
export const STATUS_TONE: Record<WorkflowStatus, "slate" | "blue" | "amber" | "violet" | "green" | "red" | "orange" | "teal"> = {
  NEW_IN_RMS: "slate",
  RMS_QA: "slate",
  READY_FOR_CONTENT: "blue",
  CONTENT_IN_PROGRESS: "blue",
  AWAITING_IMAGES: "amber",
  READY_FOR_QC: "violet",
  QC_IN_PROGRESS: "violet",
  QC_APPROVED: "teal",
  READY_FOR_MAGENTO: "teal",
  MAGENTO_LINKED: "teal",
  LIVE: "green",
  FINAL_REVIEW: "green",
  COMPLETED: "green",
  QC_REJECTED: "red",
  NEEDS_EDIT: "orange",
  BLOCKED: "red",
  MISSING_DATA: "orange",
  MISSING_IMAGES: "orange",
  PROCUREMENT_FOLLOW_UP: "orange",
};

/** Completeness stage that must be satisfied to leave a given status forward. */
export function stageForStatus(s: WorkflowStatus): Stage {
  switch (s) {
    case "NEW_IN_RMS":
    case "RMS_QA":
    case "MISSING_DATA":
    case "PROCUREMENT_FOLLOW_UP":
      return "RMS";
    case "READY_FOR_CONTENT":
    case "CONTENT_IN_PROGRESS":
    case "QC_REJECTED":
    case "NEEDS_EDIT":
    case "BLOCKED":
      return "CONTENT";
    case "AWAITING_IMAGES":
    case "MISSING_IMAGES":
    case "READY_FOR_QC":
    case "QC_IN_PROGRESS":
      return "QC";
    case "QC_APPROVED":
    case "READY_FOR_MAGENTO":
    case "MAGENTO_LINKED":
      return "MAGENTO";
    default:
      return "LIVE";
  }
}

export const VALIDATIONS = {
  HAS_RMS_DATA: "SKU and RMS name (or a title) are present",
  HAS_BRAND_AND_CATEGORY: "Brand and primary category are assigned",
  RMS_COMPLETE: "RMS-stage required fields are complete",
  CONTENT_COMPLETE: "Content-stage required fields are complete",
  IMAGES_READY: "Main image is READY or AVAILABLE",
  QC_EVALUATED: "Automated QC has been run on the latest content",
  QC_NO_ERRORS: "No automated QC errors",
  NO_OPEN_FLAGS: "No open QC field flags",
  MAGENTO_COMPLETE: "Magento-stage required fields are complete",
  URL_KEY_UNIQUE: "URL key is unique",
  MAGENTO_LINKED: "Magento ID recorded or product exported",
} as const;
export type ValidationCode = keyof typeof VALIDATIONS;

export interface TransitionRule {
  fromStatus: string; // status | "*"
  toStatus: string; // status | "@previous"
  label: string;
  allowedRoles: Role[];
  validations: ValidationCode[] | string[];
  reasonRequired: boolean;
  active: boolean;
  sortOrder?: number;
}

const OPS: Role[] = ["ADMIN", "ECOMMERCE_SPECIALIST"];
const CONTENT: Role[] = ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR"];
const QC: Role[] = ["ADMIN", "CONTENT_QUALITY"];
const ALL_EDITORS: Role[] = ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR", "CONTENT_QUALITY"];

function t(
  fromStatus: string, toStatus: string, label: string, allowedRoles: Role[],
  validations: ValidationCode[] = [], reasonRequired = false,
): TransitionRule {
  return { fromStatus, toStatus, label, allowedRoles, validations, reasonRequired, active: true };
}

export const DEFAULT_TRANSITIONS: TransitionRule[] = [
  t("NEW_IN_RMS", "RMS_QA", "Start RMS QA", OPS, ["HAS_RMS_DATA"]),
  t("RMS_QA", "READY_FOR_CONTENT", "Release to content", OPS, ["HAS_RMS_DATA", "RMS_COMPLETE"]),
  t("RMS_QA", "MISSING_DATA", "Missing RMS data", OPS, [], true),
  t("RMS_QA", "PROCUREMENT_FOLLOW_UP", "Follow up with procurement", OPS, [], true),
  t("MISSING_DATA", "RMS_QA", "Data received – back to RMS QA", OPS),
  t("MISSING_DATA", "READY_FOR_CONTENT", "Data received – release to content", OPS, ["RMS_COMPLETE"]),
  t("PROCUREMENT_FOLLOW_UP", "RMS_QA", "Procurement answered", OPS),
  t("READY_FOR_CONTENT", "CONTENT_IN_PROGRESS", "Start content", CONTENT),
  t("CONTENT_IN_PROGRESS", "AWAITING_IMAGES", "Content done – awaiting images", CONTENT, ["CONTENT_COMPLETE"]),
  t("CONTENT_IN_PROGRESS", "READY_FOR_QC", "Submit to QC", CONTENT, ["CONTENT_COMPLETE", "IMAGES_READY"]),
  t("CONTENT_IN_PROGRESS", "MISSING_DATA", "Missing data", CONTENT, [], true),
  t("AWAITING_IMAGES", "READY_FOR_QC", "Images ready – submit to QC", CONTENT, ["CONTENT_COMPLETE", "IMAGES_READY"]),
  t("AWAITING_IMAGES", "MISSING_IMAGES", "Images missing", CONTENT, [], true),
  t("AWAITING_IMAGES", "CONTENT_IN_PROGRESS", "Back to content", CONTENT),
  t("MISSING_IMAGES", "AWAITING_IMAGES", "Image requested again", CONTENT),
  t("MISSING_IMAGES", "READY_FOR_QC", "Images received – submit to QC", CONTENT, ["CONTENT_COMPLETE", "IMAGES_READY"]),
  t("READY_FOR_QC", "QC_IN_PROGRESS", "Start QC", QC),
  t("QC_IN_PROGRESS", "QC_APPROVED", "Approve", QC, ["QC_EVALUATED", "QC_NO_ERRORS", "NO_OPEN_FLAGS"]),
  t("QC_IN_PROGRESS", "QC_REJECTED", "Reject", QC, [], true),
  t("QC_IN_PROGRESS", "NEEDS_EDIT", "Request edit", QC, [], true),
  t("QC_REJECTED", "CONTENT_IN_PROGRESS", "Rework content", CONTENT),
  t("NEEDS_EDIT", "CONTENT_IN_PROGRESS", "Rework content", CONTENT),
  t("NEEDS_EDIT", "READY_FOR_QC", "Edits done – resubmit to QC", CONTENT, ["CONTENT_COMPLETE", "IMAGES_READY"]),
  t("QC_APPROVED", "READY_FOR_MAGENTO", "Prepare for Magento", OPS, ["MAGENTO_COMPLETE", "URL_KEY_UNIQUE"]),
  t("READY_FOR_MAGENTO", "MAGENTO_LINKED", "Mark linked in Magento", OPS, ["MAGENTO_COMPLETE", "MAGENTO_LINKED"]),
  t("READY_FOR_MAGENTO", "NEEDS_EDIT", "Magento preparation issue", OPS, [], true),
  t("MAGENTO_LINKED", "LIVE", "Go live", OPS),
  t("LIVE", "FINAL_REVIEW", "Start final review", [...OPS, "CONTENT_QUALITY"]),
  t("FINAL_REVIEW", "COMPLETED", "Complete", [...OPS, "CONTENT_QUALITY"]),
  t("FINAL_REVIEW", "NEEDS_EDIT", "Live issue – needs edit", [...OPS, "CONTENT_QUALITY"], [], true),
  t("*", "BLOCKED", "Block", ALL_EDITORS, [], true),
  t("BLOCKED", "@previous", "Unblock (resume)", OPS),
];

export interface TransitionContext {
  role: Role;
  status: WorkflowStatus;
  previousStatus?: WorkflowStatus | null;
  reason?: string | null;
  /** results of validations computed by the caller */
  checks: Partial<Record<ValidationCode, boolean>>;
  /** optional explanation per validation, e.g. missing fields */
  details?: Partial<Record<ValidationCode, string>>;
}

export interface TransitionResult {
  allowed: boolean;
  target: WorkflowStatus | null;
  errors: string[];
  rule?: TransitionRule;
}

const TERMINAL_FOR_BLOCK: WorkflowStatus[] = ["BLOCKED", "COMPLETED"];

export function isStatus(s: string): s is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(s);
}

/** Rules that start from `status` (including wildcard rules). */
export function rulesFrom(status: WorkflowStatus, rules: TransitionRule[]): TransitionRule[] {
  return rules.filter(
    (r) => r.active && (r.fromStatus === status || (r.fromStatus === "*" && !TERMINAL_FOR_BLOCK.includes(status) && r.toStatus !== status)),
  );
}

export function resolveTarget(rule: TransitionRule, ctx: Pick<TransitionContext, "previousStatus">): WorkflowStatus | null {
  if (rule.toStatus === "@previous") return ctx.previousStatus ?? null;
  return isStatus(rule.toStatus) ? rule.toStatus : null;
}

/**
 * Evaluate a requested transition. No arbitrary jumps: a matching active rule must exist,
 * the role must be allowed, the reason must be present when required and every validation must pass.
 */
export function evaluateTransition(
  to: WorkflowStatus,
  ctx: TransitionContext,
  rules: TransitionRule[],
): TransitionResult {
  const candidates = rulesFrom(ctx.status, rules).filter((r) => resolveTarget(r, ctx) === to);
  if (candidates.length === 0) {
    return {
      allowed: false, target: null,
      errors: [`Transition ${STATUS_LABELS[ctx.status]} → ${STATUS_LABELS[to]} is not allowed by the workflow`],
    };
  }
  // prefer the explicit rule over the wildcard
  const rule = candidates.find((r) => r.fromStatus !== "*") ?? candidates[0];
  const errors: string[] = [];
  if (!rule.allowedRoles.includes(ctx.role)) {
    errors.push(`Role ${ctx.role} cannot perform "${rule.label}"`);
  }
  if (rule.reasonRequired && !(ctx.reason && ctx.reason.trim().length >= 3)) {
    errors.push(`A reason is required for "${rule.label}"`);
  }
  for (const v of rule.validations as ValidationCode[]) {
    if (ctx.checks[v] !== true) {
      const detail = ctx.details?.[v];
      errors.push(`${VALIDATIONS[v] ?? v}${detail ? `: ${detail}` : ""}`);
    }
  }
  return { allowed: errors.length === 0, target: to, errors, rule };
}

/** Transitions offered in the UI for a role (validations are evaluated separately). */
export function availableTransitions(
  status: WorkflowStatus,
  role: Role,
  rules: TransitionRule[],
  previousStatus?: WorkflowStatus | null,
): { rule: TransitionRule; target: WorkflowStatus }[] {
  return rulesFrom(status, rules)
    .filter((r) => r.allowedRoles.includes(role))
    .map((r) => ({ rule: r, target: resolveTarget(r, { previousStatus }) }))
    .filter((x): x is { rule: TransitionRule; target: WorkflowStatus } => x.target != null && x.target !== status);
}
