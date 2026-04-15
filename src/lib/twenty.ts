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

type CrmFieldMapEntry =
  | string
  | {
      target?: string;
      source?: string;
      value?: unknown;
      resolver?: "venueId" | "companyId" | "personId" | "walkthroughResult";
    };

/**
 * Convert snake_case field IDs to camelCase for Twenty's expected naming.
 * Falls back to the original if already camelCase.
 */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function twentyJson(path: string): Promise<any | null> {
  if (!KEY) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function lookupVenueIdByName(name: string): Promise<string | null> {
  const q = asTrimmedString(name);
  if (!q) return null;
  const json = await twentyJson(
    `/rest/venues?filter=name[ilike]:"%25${encodeURIComponent(q)}%25"&limit=10`
  );
  const venues = json?.data?.venues || [];
  const exact = venues.find((v: any) => String(v?.name || "").toLowerCase() === q.toLowerCase());
  return exact?.id || venues[0]?.id || null;
}

async function lookupCompanyByName(name: string): Promise<string | null> {
  const q = asTrimmedString(name);
  if (!q) return null;
  const json = await twentyJson(
    `/rest/companies?filter=name[ilike]:"%25${encodeURIComponent(q)}%25"&limit=10`
  );
  const companies = json?.data?.companies || [];
  const exact = companies.find((c: any) => String(c?.name || "").toLowerCase() === q.toLowerCase());
  return exact?.id || companies[0]?.id || null;
}

async function resolveCompanyId(responseData: Record<string, unknown>): Promise<string | null> {
  const directId =
    asTrimmedString(responseData.client_name__id) ||
    asTrimmedString(responseData.scheduleClient__id) ||
    asTrimmedString(responseData.cg_client__id);
  if (directId && /^[0-9a-f-]{36}$/i.test(directId)) return directId;

  const byName =
    (await lookupCompanyByName(
      asTrimmedString(responseData.client_name) ||
      asTrimmedString(responseData.scheduleClient) ||
      asTrimmedString(responseData.cg_client)
    )) || null;
  if (byName) return byName;

  const email =
    asTrimmedString(responseData.requester_email) ||
    asTrimmedString(responseData.requestor_email);
  const match = email ? await lookupCompanyByEmail(email) : null;
  return match?.id || null;
}

async function lookupPersonIdByName(name: string): Promise<string | null> {
  const q = asTrimmedString(name);
  if (!q) return null;
  const json = await twentyJson(
    `/rest/people?filter=searchVector[ilike]:"%25${encodeURIComponent(q)}%25"&limit=10`
  );
  const people = json?.data?.people || [];
  const exact = people.find((p: any) => {
    const full = `${p?.name?.firstName || ""} ${p?.name?.lastName || ""}`.trim();
    return full.toLowerCase() === q.toLowerCase();
  });
  return exact?.id || people[0]?.id || null;
}

function toWalkthroughResult(value: unknown): string | null {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  if (raw === "good") return "RESULT_GOOD";
  if (raw === "partial") return "RESULT_PARTIAL";
  if (raw === "problem detected") return "RESULT_PROBLEM";
  return null;
}

function deriveRecordName(target: string, responseData: Record<string, unknown>): string | null {
  if (target === "partsOrders") return asTrimmedString(responseData.venue_name) || null;
  if (target === "designRequests") {
    const client = asTrimmedString(responseData.client_name);
    const venue = asTrimmedString(responseData.venue_name);
    const deliverable = asTrimmedString(responseData.deliverable_type);
    return [client || venue, deliverable].filter(Boolean).join(" ").trim() || null;
  }
  if (target === "printRequests") {
    const client = asTrimmedString(responseData.client_name);
    const sf = asTrimmedString(responseData.sf_number);
    return [client, sf].filter(Boolean).join(" ").trim() || null;
  }
  if (target === "contentSchedules") {
    return asTrimmedString(responseData.name) || null;
  }
  if (target === "cgDesignRequests") {
    return asTrimmedString(responseData.request_title) || null;
  }
  if (target === "walkthroughLogs") {
    return asTrimmedString(responseData.name) || null;
  }
  return null;
}

async function resolveFieldValue(
  responseData: Record<string, unknown>,
  sourceKey: string,
  entry: CrmFieldMapEntry
): Promise<{ target: string; value: unknown } | null> {
  if (typeof entry === "string") {
    const raw = responseData[sourceKey];
    if (raw == null || raw === "") return null;
    return { target: entry, value: raw };
  }

  const target = entry.target || sourceKey;
  if (!target) return null;

  let rawValue: unknown;
  if (Object.prototype.hasOwnProperty.call(entry, "value")) {
    rawValue = entry.value;
  } else {
    rawValue = responseData[entry.source || sourceKey];
  }

  if (entry.resolver === "venueId") {
    const resolved =
      asTrimmedString(rawValue) ||
      asTrimmedString(responseData[`${entry.source || sourceKey}__id`]);
    const venueId = resolved && /^[0-9a-f-]{36}$/i.test(resolved)
      ? resolved
      : await lookupVenueIdByName(resolved);
    return venueId ? { target, value: venueId } : null;
  }

  if (entry.resolver === "companyId") {
    const companyId = await resolveCompanyId(responseData);
    return companyId ? { target, value: companyId } : null;
  }

  if (entry.resolver === "personId") {
    const raw = asTrimmedString(rawValue);
    const personId = /^[0-9a-f-]{36}$/i.test(raw) ? raw : await lookupPersonIdByName(raw);
    return personId ? { target, value: personId } : null;
  }

  if (entry.resolver === "walkthroughResult") {
    const result = toWalkthroughResult(rawValue);
    return result ? { target, value: result } : null;
  }

  if (rawValue == null || rawValue === "") return null;
  return { target, value: rawValue };
}

async function enrichTwentyPayload(
  target: string,
  payload: Record<string, unknown>,
  responseData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const out = { ...payload };

  if (!out.name) {
    const derived = deriveRecordName(target, responseData);
    if (derived) out.name = derived;
  }

  if (target === "partsOrders") {
    out.status ||= "STATUS_REQUEST_SUBMITTED";
    out.venueId ||= asTrimmedString(responseData.venue_name__id) || await lookupVenueIdByName(asTrimmedString(responseData.venue_name));
  }

  if (target === "designRequests") {
    out.status ||= "STATUS_REQUEST_SUBMITTED";
    out.designClientId ||= await resolveCompanyId(responseData);
  }

  if (target === "printRequests") {
    out.status ||= "STATUS_NEW_JOB";
    out.requesterEmailPrimaryEmail ||= asTrimmedString(responseData.requester_email) || undefined;
    out.printClientId ||= await resolveCompanyId(responseData);
  }

  if (target === "contentSchedules") {
    out.status ||= "STATUS_IN_QUEUE";
    out.scheduleClientId ||= await resolveCompanyId(responseData);
    out.contentTitle ||= asTrimmedString(responseData.name) || undefined;
  }

  if (target === "cgDesignRequests") {
    out.status ||= "STATUS_REQUEST_SUBMITTED";
    out.cgClientId ||= await resolveCompanyId(responseData);
    out.requestTitle ||= asTrimmedString(responseData.request_title) || undefined;
  }

  if (target === "walkthroughLogs") {
    out.walkVenueId ||= asTrimmedString(responseData.venue_name__id) || await lookupVenueIdByName(asTrimmedString(responseData.venue_name));
    out.logTime ||= asTrimmedString(responseData.log_time) || new Date().toISOString().slice(11, 16);
    if (responseData.result && !out.result) {
      out.result = toWalkthroughResult(responseData.result);
    }
  }

  Object.keys(out).forEach((key) => {
    if (out[key] == null || out[key] === "") delete out[key];
  });

  return out;
}

/**
 * Given a form response, a target Twenty object (e.g. "printRequests"),
 * and an optional explicit field mapping, produce the payload to POST.
 *
 * Mapping precedence:
 *   1. Explicit fieldMap entry (formFieldId → twentyFieldName)
 *   2. Auto-mapping via snakeToCamel(formFieldId)
 */
export async function buildTwentyPayload(
  target: string,
  responseData: Record<string, unknown>,
  fieldMap?: Record<string, CrmFieldMapEntry> | null
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  if (fieldMap && Object.keys(fieldMap).length > 0) {
    for (const [sourceKey, entry] of Object.entries(fieldMap)) {
      const resolved = await resolveFieldValue(responseData, sourceKey, entry);
      if (!resolved) continue;
      out[resolved.target] = resolved.value;
    }
    return enrichTwentyPayload(target, out, responseData);
  }

  for (const [formId, rawValue] of Object.entries(responseData)) {
    if (rawValue == null || rawValue === "") continue;
    out[snakeToCamel(formId)] = rawValue;
  }

  return enrichTwentyPayload(target, out, responseData);
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
    const singular = target.endsWith("s") ? target.slice(0, -1) : target;
    const createKey = `create${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;
    const record =
      data?.data?.[createKey] ||
      data?.data?.[singular] ||
      data?.data?.[target] ||
      Object.values(data?.data || {}).find((value: any) => value && typeof value === "object" && "id" in value);
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
