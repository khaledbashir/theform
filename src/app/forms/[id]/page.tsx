"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { detectSubmitter } from "@/lib/submitter";

interface FormField {
  id: string;
  type: string;
  label: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

// Render a single response cell — handles all 17 field types in the system.
// File/image/signature URLs become thumbnails or download links; rating
// values become stars; scale values get a unit suffix; yes/no becomes a
// colored badge; everything else falls back to plain text.
function renderCell(field: FormField, value: any) {
  if (value == null || value === "" || value === 0 && field.type !== "rating" && field.type !== "scale") {
    if (field.type !== "rating" && field.type !== "scale") return "\u2014";
  }
  if (Array.isArray(value)) return value.join(", ");

  // Image / signature → inline thumbnail
  if ((field.type === "image" || field.type === "signature") && typeof value === "string" && /^https?:\/\//.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="inline-block">
        <img src={value} alt={field.label} className="max-h-16 rounded border border-border bg-white" />
      </a>
    );
  }
  // File → 📎 download link
  if (field.type === "file" && typeof value === "string" && /^https?:\/\//.test(value)) {
    const filename = value.split("/").pop()?.split("_").slice(1).join("_") || "file";
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-accent hover:underline">
        📎 {filename}
      </a>
    );
  }
  // Rating → ★★★★☆
  if (field.type === "rating") {
    const v = Number(value) || 0;
    const max = field.max ?? 5;
    return (
      <span className="text-yellow-400 tracking-tight" title={`${v}/${max}`}>
        {"★".repeat(v)}<span className="text-muted/30">{"★".repeat(Math.max(0, max - v))}</span>
      </span>
    );
  }
  // Scale → number + unit, color coded by position in range
  if (field.type === "scale") {
    const v = Number(value);
    if (Number.isNaN(v)) return "\u2014";
    return (
      <span className="font-semibold text-foreground tabular-nums">
        {v}{field.unit && <span className="text-muted text-xs ml-0.5">{field.unit}</span>}
      </span>
    );
  }
  // Yes/No → colored badge
  if (field.type === "yes_no") {
    const isYes = String(value).toLowerCase() === "yes";
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isYes ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>
        {value}
      </span>
    );
  }
  // Likert → highlighted text
  if (field.type === "likert") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">{value}</span>;
  }
  // Datetime / time → formatted
  if (field.type === "datetime" && typeof value === "string") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
  return String(value);
}

interface Response {
  id: string;
  data: Record<string, any>;
  createdAt: string;
}

interface FormData {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  responses: Response[];
  createdAt: string;
  crmTarget?: string | null;
  crmFieldMap?: Record<string, string> | null;
}

const CRM_TARGETS = [
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

export default function FormResponses() {
  const { id } = useParams();
  const [form, setForm] = useState<FormData | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [editingCrm, setEditingCrm] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const [crmTargetDraft, setCrmTargetDraft] = useState("");
  const [crmFieldMapDraft, setCrmFieldMapDraft] = useState("");

  useEffect(() => {
    fetch(`/api/forms/${id}`)
      .then((r) => r.json())
      .then((f) => {
        setForm(f);
        setCrmTargetDraft(f.crmTarget || "");
        setCrmFieldMapDraft(
          f.crmFieldMap ? JSON.stringify(f.crmFieldMap, null, 2) : ""
        );
      });
  }, [id]);

  const saveCrmConfig = async () => {
    setSavingCrm(true);
    try {
      let fieldMap: Record<string, string> | null = null;
      if (crmFieldMapDraft.trim()) {
        try {
          fieldMap = JSON.parse(crmFieldMapDraft);
        } catch {
          alert("Invalid JSON in field mapping");
          setSavingCrm(false);
          return;
        }
      }
      const res = await fetch(`/api/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crmTarget: crmTargetDraft,
          crmFieldMap: fieldMap,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setForm((f) => (f ? { ...f, crmTarget: updated.crmTarget, crmFieldMap: updated.crmFieldMap } : f));
        setEditingCrm(false);
      }
    } finally {
      setSavingCrm(false);
    }
  };

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/f/${form.id}`);
  };

  const exportCSV = () => {
    if (!form.responses.length) return;
    const headers = form.fields.map((f) => f.label);
    const rows = form.responses.map((r) =>
      form.fields.map((f) => {
        const val = r.data[f.id];
        return Array.isArray(val) ? val.join("; ") : String(val || "");
      })
    );
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.title.replace(/\s+/g, "_")}_responses.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-accent hover:text-accent-hover mb-1 block">
              &larr; Back
            </Link>
            <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
            <div className="flex items-center gap-3 text-sm text-muted mt-0.5 flex-wrap">
              <span>
                <span className="text-foreground font-medium">{form.responses.length}</span>{" "}
                response{form.responses.length !== 1 && "s"}
              </span>
              <span className="opacity-50">•</span>
              <span title={new Date(form.createdAt).toLocaleString()}>
                Form created {formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}
              </span>
              {form.crmTarget && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="text-accent">
                    → CRM: {form.crmTarget}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-foreground transition-colors"
            >
              Copy Link
            </button>
            <button
              onClick={exportCSV}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-foreground transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => setView(view === "table" ? "cards" : "table")}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-foreground transition-colors"
            >
              {view === "table" ? "Cards" : "Table"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* CRM Integration Panel */}
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🔗</span>
                <h3 className="text-sm font-semibold text-foreground">CRM Integration</h3>
                {form.crmTarget ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">
                    CONNECTED
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/10 text-muted font-medium">
                    NOT CONNECTED
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {form.crmTarget
                  ? `Every submission creates a new record in Twenty CRM → ${form.crmTarget}`
                  : "Submissions are stored locally only. Connect a Twenty CRM target to auto-create records."}
              </p>
            </div>
            {!editingCrm && (
              <button
                onClick={() => setEditingCrm(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-foreground transition-colors"
              >
                {form.crmTarget ? "Edit" : "Connect"}
              </button>
            )}
          </div>

          {editingCrm && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Twenty CRM target object
                </label>
                <select
                  value={crmTargetDraft}
                  onChange={(e) => setCrmTargetDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  {CRM_TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {crmTargetDraft && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Field mapping (optional — leave empty for auto-mapping)
                  </label>
                  <textarea
                    value={crmFieldMapDraft}
                    onChange={(e) => setCrmFieldMapDraft(e.target.value)}
                    rows={5}
                    placeholder={`{\n  "form_field_id": "twentyFieldName",\n  "submitted_by": "submittedBy"\n}`}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Auto-mapping converts <code className="text-accent">snake_case</code> form
                    IDs to <code className="text-accent">camelCase</code> Twenty field names.
                    Override individual fields here if needed.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveCrmConfig}
                  disabled={savingCrm}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingCrm ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditingCrm(false);
                    setCrmTargetDraft(form.crmTarget || "");
                    setCrmFieldMapDraft(
                      form.crmFieldMap ? JSON.stringify(form.crmFieldMap, null, 2) : ""
                    );
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {form.responses.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs text-muted mb-1">Total Responses</p>
              <p className="text-2xl font-semibold text-foreground">{form.responses.length}</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs text-muted mb-1">Fields</p>
              <p className="text-2xl font-semibold text-foreground">{form.fields.length}</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs text-muted mb-1">First</p>
              <p
                className="text-lg font-semibold text-foreground"
                title={new Date(form.responses[form.responses.length - 1].createdAt).toLocaleString()}
              >
                {formatDistanceToNow(
                  new Date(form.responses[form.responses.length - 1].createdAt),
                  { addSuffix: true }
                )}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs text-muted mb-1">Latest</p>
              <p
                className="text-lg font-semibold text-foreground"
                title={new Date(form.responses[0].createdAt).toLocaleString()}
              >
                {formatDistanceToNow(new Date(form.responses[0].createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        )}

        {form.responses.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <p className="text-muted mb-2">No responses yet.</p>
            <button onClick={copyLink} className="text-sm text-accent hover:text-accent-hover">
              Copy the form link to share it
            </button>
          </div>
        ) : view === "table" ? (
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted">#</th>
                  <th className="text-left py-3 px-4 font-medium text-muted whitespace-nowrap">Submitter</th>
                  {form.fields.map((f) => (
                    <th key={f.id} className="text-left py-3 px-4 font-medium text-muted">
                      {f.label}
                    </th>
                  ))}
                  <th className="text-left py-3 px-4 font-medium text-muted whitespace-nowrap">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {form.responses.map((resp, i) => {
                  const submitter = detectSubmitter(resp.data);
                  return (
                    <tr key={resp.id} className="border-b border-border/50 hover:bg-surface-2/50">
                      <td className="py-3 px-4 text-muted">{i + 1}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            submitter.isAnonymous ? "text-muted italic" : "text-foreground"
                          }`}
                          title={submitter.sourceField ? `from field: ${submitter.sourceField}` : "no submitter field detected"}
                        >
                          {submitter.label}
                        </span>
                      </td>
                      {form.fields.map((f) => (
                        <td key={f.id} className="py-3 px-4 text-foreground max-w-xs truncate">
                          {renderCell(f, resp.data[f.id])}
                        </td>
                      ))}
                      <td
                        className="py-3 px-4 text-muted whitespace-nowrap"
                        title={format(new Date(resp.createdAt), "PPpp")}
                      >
                        {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {form.responses.map((resp, i) => {
              const submitter = detectSubmitter(resp.data);
              return (
                <div key={resp.id} className="bg-surface border border-border rounded-xl p-5">
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-accent">#{i + 1}</span>
                        <span
                          className={`text-sm font-semibold truncate ${
                            submitter.isAnonymous ? "text-muted italic" : "text-foreground"
                          }`}
                        >
                          {submitter.label}
                        </span>
                      </div>
                      <span
                        className="text-xs text-muted block"
                        title={format(new Date(resp.createdAt), "PPpp")}
                      >
                        {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {form.fields.map((f) => (
                      <div key={f.id}>
                        <span className="text-xs text-muted">{f.label}</span>
                        <div className="text-sm text-foreground mt-0.5">
                          {renderCell(f, resp.data[f.id])}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
