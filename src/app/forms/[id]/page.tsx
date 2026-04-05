"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface FormField {
  id: string;
  type: string;
  label: string;
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
}

export default function FormResponses() {
  const { id } = useParams();
  const [form, setForm] = useState<FormData | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");

  useEffect(() => {
    fetch(`/api/forms/${id}`)
      .then((r) => r.json())
      .then(setForm);
  }, [id]);

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
            <p className="text-sm text-muted">
              {form.responses.length} response{form.responses.length !== 1 && "s"}
            </p>
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
                  {form.fields.map((f) => (
                    <th key={f.id} className="text-left py-3 px-4 font-medium text-muted">
                      {f.label}
                    </th>
                  ))}
                  <th className="text-left py-3 px-4 font-medium text-muted">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {form.responses.map((resp, i) => (
                  <tr key={resp.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="py-3 px-4 text-muted">{i + 1}</td>
                    {form.fields.map((f) => (
                      <td key={f.id} className="py-3 px-4 text-foreground max-w-xs truncate">
                        {Array.isArray(resp.data[f.id])
                          ? resp.data[f.id].join(", ")
                          : String(resp.data[f.id] || "\u2014")}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-muted whitespace-nowrap">
                      {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {form.responses.map((resp, i) => (
              <div key={resp.id} className="bg-surface border border-border rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-accent">#{i + 1}</span>
                  <span className="text-xs text-muted">
                    {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="space-y-3">
                  {form.fields.map((f) => (
                    <div key={f.id}>
                      <span className="text-xs text-muted">{f.label}</span>
                      <p className="text-sm text-foreground mt-0.5">
                        {Array.isArray(resp.data[f.id])
                          ? resp.data[f.id].join(", ")
                          : String(resp.data[f.id] || "\u2014")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
