import { describe, expect, it } from "vitest";
import { availableTransitions, DEFAULT_TRANSITIONS, evaluateTransition, type TransitionContext } from "@/lib/domain/workflow";

const ctx = (over: Partial<TransitionContext>): TransitionContext => ({ role: "ADMIN", status: "NEW_IN_RMS", checks: {}, ...over });
const allChecks = { HAS_RMS_DATA: true, HAS_BRAND_AND_CATEGORY: true, RMS_COMPLETE: true, CONTENT_COMPLETE: true, IMAGES_READY: true,
  QC_EVALUATED: true, QC_NO_ERRORS: true, NO_OPEN_FLAGS: true, MAGENTO_COMPLETE: true, URL_KEY_UNIQUE: true, MAGENTO_LINKED: true };

describe("workflow state machine", () => {
  it("rejects arbitrary stage jumps", () => {
    const r = evaluateTransition("LIVE", ctx({ status: "NEW_IN_RMS", checks: allChecks }), DEFAULT_TRANSITIONS);
    expect(r.allowed).toBe(false);
    expect(r.errors[0]).toMatch(/not allowed/);
  });
  it("walks the happy path when validations pass", () => {
    const path = ["NEW_IN_RMS", "RMS_QA", "READY_FOR_CONTENT", "CONTENT_IN_PROGRESS", "AWAITING_IMAGES", "READY_FOR_QC", "QC_IN_PROGRESS",
      "QC_APPROVED", "READY_FOR_MAGENTO", "MAGENTO_LINKED", "LIVE", "FINAL_REVIEW", "COMPLETED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      const r = evaluateTransition(path[i + 1], ctx({ status: path[i], checks: allChecks }), DEFAULT_TRANSITIONS);
      expect(r.allowed, `${path[i]} -> ${path[i + 1]}: ${r.errors.join()}`).toBe(true);
    }
  });
  it("enforces validations", () => {
    const r = evaluateTransition("READY_FOR_QC", ctx({ status: "CONTENT_IN_PROGRESS", checks: { ...allChecks, IMAGES_READY: false },
      details: { IMAGES_READY: "main image is REQUESTED" } }), DEFAULT_TRANSITIONS);
    expect(r.allowed).toBe(false);
    expect(r.errors.join()).toMatch(/Main image.*REQUESTED/);
    const qc = evaluateTransition("QC_APPROVED", ctx({ role: "CONTENT_QUALITY", status: "QC_IN_PROGRESS", checks: { ...allChecks, QC_NO_ERRORS: false } }), DEFAULT_TRANSITIONS);
    expect(qc.allowed).toBe(false);
  });
  it("enforces roles", () => {
    const r = evaluateTransition("QC_APPROVED", ctx({ role: "CONTENT_CREATOR", status: "QC_IN_PROGRESS", checks: allChecks }), DEFAULT_TRANSITIONS);
    expect(r.allowed).toBe(false);
    expect(r.errors.join()).toMatch(/Role CONTENT_CREATOR/);
    const v = evaluateTransition("RMS_QA", ctx({ role: "VIEWER", checks: allChecks }), DEFAULT_TRANSITIONS);
    expect(v.allowed).toBe(false);
  });
  it("requires a reason for rejection and blocking", () => {
    const base = ctx({ role: "CONTENT_QUALITY", status: "QC_IN_PROGRESS", checks: allChecks });
    expect(evaluateTransition("QC_REJECTED", base, DEFAULT_TRANSITIONS).allowed).toBe(false);
    expect(evaluateTransition("QC_REJECTED", { ...base, reason: "Arabic title mistranslated" }, DEFAULT_TRANSITIONS).allowed).toBe(true);
    expect(evaluateTransition("BLOCKED", { ...base, reason: "Supplier recall" }, DEFAULT_TRANSITIONS).allowed).toBe(true);
  });
  it("rejected items return to content only", () => {
    const opts = availableTransitions("QC_REJECTED", "CONTENT_CREATOR", DEFAULT_TRANSITIONS).map((t) => t.target);
    expect(opts).toContain("CONTENT_IN_PROGRESS");
    expect(opts).not.toContain("QC_APPROVED");
  });
  it("unblock resumes the previous status", () => {
    const r = evaluateTransition("READY_FOR_QC", ctx({ status: "BLOCKED", previousStatus: "READY_FOR_QC", checks: {} }), DEFAULT_TRANSITIONS);
    expect(r.allowed).toBe(true);
    const wrong = evaluateTransition("LIVE", ctx({ status: "BLOCKED", previousStatus: "READY_FOR_QC", checks: {} }), DEFAULT_TRANSITIONS);
    expect(wrong.allowed).toBe(false);
  });
  it("honours configuration: deactivated rules disappear", () => {
    const rules = DEFAULT_TRANSITIONS.map((r) => (r.fromStatus === "NEW_IN_RMS" && r.toStatus === "RMS_QA" ? { ...r, active: false } : r));
    expect(evaluateTransition("RMS_QA", ctx({ checks: allChecks }), rules).allowed).toBe(false);
  });
  it("completed items cannot be blocked", () => {
    expect(availableTransitions("COMPLETED", "ADMIN", DEFAULT_TRANSITIONS)).toEqual([]);
  });
});
