/**
 * Submitter detection — given a form response payload, find the field that
 * most likely identifies WHO submitted it.
 *
 * The forms app has no auth, so "submitter" is whatever the form itself asked
 * for. The 8 ANC presets all use one of a small set of conventional field IDs
 * for the person submitting (requester_email, submitted_by, reporter_email,
 * etc.). This module looks them up in priority order and returns the first
 * non-empty match.
 *
 * Used by:
 *   - the form list (homepage) to show "latest from <submitter>"
 *   - the form detail page to render a "Submitter" column on the response
 *     table and a header on each response card
 */

// Priority order: most-specific first. Email beats name (more unique), name
// beats free-text. Add new IDs at the bottom — earlier entries win.
const SUBMITTER_FIELD_IDS = [
  // Email fields (most distinctive — used as a stable identifier)
  "submitted_by_email",
  "requester_email",
  "reporter_email",
  "requestor_email",
  "inspector_email",
  "contact_email",
  "submitter_email",
  // Name fields (preferred display when no email is available)
  "submitted_by",
  "requester_name",
  "reporter_name",
  "requestor_name",
  "inspector_name",
  "tech_name",
  "contact_name",
  "submitter_name",
  "operator",
  "name", // last-resort fallback — many forms ask for "name" generically
];

export interface SubmitterInfo {
  /** Best display label for the submitter (name or email or "Anonymous") */
  label: string;
  /** The form field ID that produced the label, or null if unknown */
  sourceField: string | null;
  /** Whether we have a confident submitter or just fell back to anonymous */
  isAnonymous: boolean;
}

export function detectSubmitter(data: Record<string, any> | null | undefined): SubmitterInfo {
  if (!data || typeof data !== "object") {
    return { label: "Anonymous", sourceField: null, isAnonymous: true };
  }
  for (const key of SUBMITTER_FIELD_IDS) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) {
      return { label: v.trim(), sourceField: key, isAnonymous: false };
    }
  }
  return { label: "Anonymous", sourceField: null, isAnonymous: true };
}
