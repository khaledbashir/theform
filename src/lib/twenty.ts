/**
 * Twenty CRM REST client — writes form submissions to custom objects.
 *
 * Env vars:
 *   TWENTY_API_URL  (default: https://abc-twenty.izcgmb.easypanel.host)
 *   TWENTY_API_KEY  (required — workspace API key)
 */

const BASE = process.env.TWENTY_API_URL || "https://abc-twenty.izcgmb.easypanel.host";
const KEY = process.env.TWENTY_API_KEY || "";

export function isTwentyConfigured(): boolean {
  return !!KEY;
}

/**
 * Convert snake_case field IDs to camelCase for Twenty's expected naming.
 * Falls back to the original if already camelCase.
 */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Given a form response, a target Twenty object (e.g. "printRequests"),
 * and an optional explicit field mapping, produce the payload to POST.
 *
 * Mapping precedence:
 *   1. Explicit fieldMap entry (formFieldId → twentyFieldName)
 *   2. Auto-mapping via snakeToCamel(formFieldId)
 */
export function buildTwentyPayload(
  responseData: Record<string, unknown>,
  fieldMap?: Record<string, string> | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [formId, rawValue] of Object.entries(responseData)) {
    if (rawValue == null || rawValue === "") continue;
    const twentyKey = fieldMap?.[formId] || snakeToCamel(formId);
    out[twentyKey] = rawValue;
  }
  return out;
}

/**
 * POST a record to a Twenty custom object endpoint.
 * Returns { ok, id?, error? }.
 */
export async function createTwentyRecord(
  target: string,
  payload: Record<string, unknown>
): Promise<{ ok: true; id: string; name?: string } | { ok: false; error: string }> {
  if (!KEY) return { ok: false, error: "TWENTY_API_KEY not configured" };
  if (!target) return { ok: false, error: "crmTarget missing" };

  try {
    const res = await fetch(`${BASE}/rest/${target}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.messages?.[0] || data?.error || `HTTP ${res.status}`;
      return { ok: false, error: String(msg) };
    }
    // Twenty returns { data: { create<Target>: {...record} } }
    const createKey = `create${target.charAt(0).toUpperCase()}${target.slice(1)}`;
    const record = data?.data?.[createKey];
    if (!record?.id) {
      return { ok: false, error: "Twenty returned no record id" };
    }
    return { ok: true, id: record.id, name: record.name };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
}

/**
 * List of ANC-specific CRM targets (Twenty custom object plural endpoints)
 * shown as options in the admin UI.
 */
export const ANC_CRM_TARGETS = [
  { value: "", label: "— No CRM integration —" },
  { value: "printRequests", label: "Print Request (Britten)" },
  { value: "designRequests", label: "Design Request" },
  { value: "cgDesignRequests", label: "CG Design Request" },
  { value: "contentSchedules", label: "Content Schedule" },
  { value: "partsOrders", label: "Parts Order" },
  { value: "walkthroughLogs", label: "Walkthrough Log" },
  { value: "serviceTickets", label: "Service Ticket" },
  { value: "maintenanceLogs", label: "Maintenance Log" },
  { value: "rmaTrackers", label: "RMA Tracker" },
  { value: "checklistItems", label: "Checklist Item (30/60/90)" },
];
