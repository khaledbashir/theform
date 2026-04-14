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

// --- Lookup helpers for auto-fill on form fields ---

/**
 * Email → company match. Tries the exact sending domain first, then the
 * 2-label root (e.g. "tickets.mlb.com" → "mlb.com"). Free-mail domains are
 * skipped so no one gets falsely tagged as a gmail-domain company.
 */
export async function lookupCompanyByEmail(
  email: string
): Promise<{ id: string; name: string; domain: string } | null> {
  if (!KEY) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  const rawDomain = email.slice(at + 1).toLowerCase().trim();
  if (!rawDomain) return null;

  const FREE = new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
    "aol.com", "proton.me", "protonmail.com", "me.com",
  ]);
  if (FREE.has(rawDomain)) return null;

  const parts = rawDomain.split(".");
  const candidates: string[] = [rawDomain];
  if (parts.length > 2) candidates.push(parts.slice(-2).join("."));

  try {
    for (const d of candidates) {
      const res = await fetch(
        `${BASE}/rest/companies?filter=domainName.primaryLinkUrl[ilike]:"%25${d}%25"&limit=5`,
        { headers: { Authorization: `Bearer ${KEY}` } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const hit = (json?.data?.companies || [])[0];
      if (hit?.id) return { id: hit.id, name: hit.name || "", domain: d };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Search Twenty venues by name for a typeahead. Returns up to 10.
 */
export async function searchVenues(
  q: string
): Promise<Array<{ id: string; name: string; market: string | null }>> {
  if (!KEY || !q || q.length < 2) return [];
  try {
    const res = await fetch(
      `${BASE}/rest/venues?filter=name[ilike]:"%25${encodeURIComponent(q)}%25"&limit=10`,
      { headers: { Authorization: `Bearer ${KEY}` } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data?.venues || []).map((v: any) => ({
      id: v.id, name: v.name, market: v.market || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a single venue's address + contact so the form can auto-fill
 * shipping/contact fields.
 */
export async function lookupVenueDetails(venueId: string): Promise<{
  id: string;
  name: string;
  addressStreet1?: string;
  addressCity?: string;
  addressState?: string;
  addressPostcode?: string;
  contactName?: string;
  contactEmail?: string;
} | null> {
  if (!KEY) return null;
  try {
    const res = await fetch(`${BASE}/rest/venues/${venueId}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const v = json?.data?.venue;
    if (!v?.id) return null;
    return {
      id: v.id,
      name: v.name,
      addressStreet1: v.address?.addressStreet1 || undefined,
      addressCity: v.address?.addressCity || undefined,
      addressState: v.address?.addressState || undefined,
      addressPostcode: v.address?.addressPostcode || undefined,
      contactName: v.contactName || undefined,
      contactEmail: v.contactEmail || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * List inventoryAsset records at a given venue — powers the board/section
 * chip-picker on design-request forms so Alexis clicks instead of typing.
 */
export async function assetsAtVenue(venueId: string): Promise<Array<{
  id: string;
  name: string;
  displayType: string | null;
  screenLocation: string | null;
  orientation: string | null;
  resolution: string | null;
}>> {
  if (!KEY || !venueId) return [];
  try {
    const res = await fetch(
      `${BASE}/rest/inventoryAssets?filter=assetVenueId[eq]:"${venueId}"&limit=60`,
      { headers: { Authorization: `Bearer ${KEY}` } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data?.inventoryAssets || []).map((a: any) => ({
      id: a.id,
      name: a.name || a.partName || a.assetNumber || "Untitled asset",
      displayType: a.displayType || null,
      screenLocation: a.screenLocation || null,
      orientation: a.orientation || null,
      resolution: a.resolution || null,
    }));
  } catch {
    return [];
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
