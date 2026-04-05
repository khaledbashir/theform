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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/f/${form.id}`);
    alert("Link copied!");
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-blue-600 hover:underline mb-1 block">
            &larr; Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
          <p className="text-gray-500 text-sm">{form.responses.length} responses</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Copy Link
          </button>
          <button
            onClick={exportCSV}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setView(view === "table" ? "cards" : "table")}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {view === "table" ? "Card View" : "Table View"}
          </button>
        </div>
      </div>

      {form.responses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-4">No responses yet.</p>
          <p className="text-sm text-gray-400">
            Share this link with clients:{" "}
            <button onClick={copyLink} className="text-blue-600 hover:underline">
              {typeof window !== "undefined" ? `${window.location.origin}/f/${form.id}` : `/f/${form.id}`}
            </button>
          </p>
        </div>
      ) : view === "table" ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">#</th>
                {form.fields.map((f) => (
                  <th key={f.id} className="text-left py-3 px-4 font-medium text-gray-500">
                    {f.label}
                  </th>
                ))}
                <th className="text-left py-3 px-4 font-medium text-gray-500">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {form.responses.map((resp, i) => (
                <tr key={resp.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-400">{i + 1}</td>
                  {form.fields.map((f) => (
                    <td key={f.id} className="py-3 px-4 text-gray-700 max-w-xs truncate">
                      {Array.isArray(resp.data[f.id])
                        ? resp.data[f.id].join(", ")
                        : String(resp.data[f.id] || "—")}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
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
            <div key={resp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-500">Response #{i + 1}</span>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div className="space-y-2">
                {form.fields.map((f) => (
                  <div key={f.id}>
                    <span className="text-xs text-gray-400">{f.label}</span>
                    <p className="text-sm text-gray-800">
                      {Array.isArray(resp.data[f.id])
                        ? resp.data[f.id].join(", ")
                        : String(resp.data[f.id] || "—")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
