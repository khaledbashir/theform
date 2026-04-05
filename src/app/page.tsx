"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface Form {
  id: string;
  title: string;
  description: string;
  fields?: FormField[];
  createdAt: string;
  _count: { responses: number };
}

export default function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [preview, setPreview] = useState<Form | null>(null);
  const [tab, setTab] = useState<"create" | "forms">("create");

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
    setPreview(null);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const form = await res.json();
      setPreview(form);
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
    if (preview?.id === id) setPreview(null);
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/f/${id}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">BasheerForms</h1>
        </div>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          <button
            onClick={() => setTab("create")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "create"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            Create
          </button>
          <button
            onClick={() => setTab("forms")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "forms"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            My Forms{forms.length > 0 && ` (${forms.length})`}
          </button>
        </div>
      </header>

      {tab === "create" ? (
        /* Split Screen: Prompt | Preview */
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Prompt */}
          <div className="w-1/2 border-r border-border flex flex-col">
            <div className="p-6 flex-1 flex flex-col">
              <label className="block text-sm font-medium text-muted mb-2">
                Describe your form
              </label>
              <textarea
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted focus:ring-2 focus:ring-accent focus:border-transparent resize-none text-sm leading-relaxed"
                placeholder={`e.g. I need a client intake form for my photography business.\n\nI want to collect:\n- Their name and email\n- What type of event (wedding, portrait, corporate, etc.)\n- The date they need\n- Their budget range\n- How they found us\n- Any special requests or notes`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) createForm();
                }}
              />
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-muted">Ctrl+Enter to create</span>
                <button
                  onClick={createForm}
                  disabled={loading || !prompt.trim()}
                  className="bg-accent text-white px-6 py-2.5 rounded-lg font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    "Generate Form"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="w-1/2 flex flex-col bg-surface/50 overflow-y-auto">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <svg className="animate-spin h-8 w-8 text-accent mx-auto mb-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-muted text-sm">AI is building your form...</p>
                </div>
              </div>
            ) : preview ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-muted">Preview</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(preview.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    >
                      Copy Link
                    </button>
                    <Link
                      href={`/f/${preview.id}`}
                      target="_blank"
                      className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    >
                      Open Full Page
                    </Link>
                  </div>
                </div>
                <div className="bg-surface border border-border rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-1">{preview.title}</h3>
                  {preview.description && (
                    <p className="text-sm text-muted mb-6">{preview.description}</p>
                  )}
                  <div className="space-y-4">
                    {preview.fields?.map((field) => (
                      <div key={field.id} className="form-field">
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          {field.label}
                          {field.required && <span className="text-danger ml-1">*</span>}
                        </label>
                        {field.type === "textarea" ? (
                          <textarea placeholder={field.placeholder} rows={3} readOnly />
                        ) : field.type === "select" ? (
                          <select disabled>
                            <option>Select...</option>
                            {field.options?.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        ) : field.type === "radio" ? (
                          <div className="space-y-1.5">
                            {field.options?.map((o) => (
                              <label key={o} className="flex items-center gap-2 text-sm text-foreground">
                                <input type="radio" name={field.id} disabled className="accent-accent" />
                                {o}
                              </label>
                            ))}
                          </div>
                        ) : field.type === "checkbox" ? (
                          <div className="space-y-1.5">
                            {field.options?.map((o) => (
                              <label key={o} className="flex items-center gap-2 text-sm text-foreground">
                                <input type="checkbox" disabled className="accent-accent" />
                                {o}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <input type={field.type} placeholder={field.placeholder} readOnly />
                        )}
                      </div>
                    ))}
                  </div>
                  <button disabled className="w-full mt-6 bg-accent text-white py-2.5 rounded-lg font-medium opacity-60 text-sm">
                    Submit
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <p className="text-muted text-sm">Describe your form on the left.<br />The preview will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Forms List */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {fetching ? (
              <div className="text-center text-muted py-12">Loading...</div>
            ) : forms.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted mb-4">No forms yet.</p>
                <button
                  onClick={() => setTab("create")}
                  className="text-accent hover:text-accent-hover text-sm"
                >
                  Create your first form
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between hover:border-accent/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-foreground truncate">{form.title}</h3>
                      <p className="text-sm text-muted truncate mt-0.5">{form.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                        <span className={form._count.responses > 0 ? "text-success" : ""}>
                          {form._count.responses} response{form._count.responses !== 1 && "s"}
                        </span>
                        <span>{formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => copyLink(form.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                      >
                        Copy Link
                      </button>
                      <Link
                        href={`/f/${form.id}`}
                        target="_blank"
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/forms/${form.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        Responses
                      </Link>
                      <button
                        onClick={() => deleteForm(form.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-danger/70 hover:text-danger hover:border-danger/30 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
