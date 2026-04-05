"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface Form {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  _count: { responses: number };
}

export default function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => r.json())
      .then((data) => {
        setForms(data);
        setFetching(false);
      });
  }, []);

  const createForm = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const form = await res.json();
      setForms((prev) => [{ ...form, _count: { responses: 0 } }, ...prev]);
      setPrompt("");
    } catch (e) {
      alert("Failed to create form. Check your API key.");
    } finally {
      setLoading(false);
    }
  };

  const deleteForm = async (id: string) => {
    if (!confirm("Delete this form and all its responses?")) return;
    await fetch(`/api/forms/${id}`, { method: "DELETE" });
    setForms((prev) => prev.filter((f) => f.id !== id));
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/f/${id}`;
    navigator.clipboard.writeText(url);
    alert("Link copied!");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">FormAI</h1>
        <p className="text-gray-500">Describe what you need, AI builds the form.</p>
      </div>

      {/* AI Form Creator */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What kind of form do you need?
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          placeholder='e.g. A client intake form for a photography business — name, email, event date, type of event, budget range, how they heard about us...'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) createForm();
          }}
        />
        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-gray-400">Ctrl+Enter to create</span>
          <button
            onClick={createForm}
            disabled={loading || !prompt.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </span>
            ) : (
              "Create Form"
            )}
          </button>
        </div>
      </div>

      {/* Forms List */}
      {fetching ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : forms.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No forms yet. Describe what you need above and AI will create one.
        </div>
      ) : (
        <div className="grid gap-4">
          {forms.map((form) => (
            <div
              key={form.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-900 truncate">{form.title}</h3>
                <p className="text-sm text-gray-500 truncate">{form.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>
                    {form._count.responses} response{form._count.responses !== 1 && "s"}
                  </span>
                  <span>{formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button
                  onClick={() => copyLink(form.id)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Copy Link
                </button>
                <Link
                  href={`/f/${form.id}`}
                  target="_blank"
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Preview
                </Link>
                <Link
                  href={`/forms/${form.id}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  Responses
                </Link>
                <button
                  onClick={() => deleteForm(form.id)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
