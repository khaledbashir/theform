"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Toast, useToast } from "@/components/Toast";

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

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  form?: Form;
}

const PRESETS = [
  { icon: "👤", label: "Client Intake", prompt: "A client intake form — collect name, email, phone, company, what service they need, budget range, timeline, and how they found us" },
  { icon: "📋", label: "Feedback Survey", prompt: "A customer feedback survey — overall satisfaction rating, what they liked most, what could be improved, would they recommend us, any additional comments" },
  { icon: "📅", label: "Event Registration", prompt: "An event registration form — attendee name, email, phone, organization, dietary restrictions, session preferences, accessibility needs, how they heard about the event" },
  { icon: "💼", label: "Job Application", prompt: "A job application form — full name, email, phone, LinkedIn URL, years of experience, desired role, salary expectations, earliest start date, cover letter" },
  { icon: "🏠", label: "Property Inquiry", prompt: "A real estate property inquiry — name, email, phone, property type interested in, budget range, preferred locations, number of bedrooms, move-in timeline, pre-approved for mortgage" },
  { icon: "🎨", label: "Project Brief", prompt: "A creative project brief form — client name, company, email, project type, project description, target audience, preferred style/tone, examples they like, deadline, budget" },
  { icon: "🏥", label: "Patient Intake", prompt: "A patient intake form — full name, date of birth, email, phone, emergency contact, insurance provider, current medications, allergies, reason for visit, medical history notes" },
  { icon: "📦", label: "Order Request", prompt: "A product order request form — customer name, email, shipping address, product selection, quantity, preferred delivery date, special instructions, payment method" },
];

export default function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [preview, setPreview] = useState<Form | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tab, setTab] = useState<"create" | "forms">("create");
  const { toast, showToast, hideToast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => r.json())
      .then((data) => {
        setForms(data);
        setFetching(false);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const createForm = async (overridePrompt?: string) => {
    const text = overridePrompt || prompt.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPrompt("");
    setLoading(true);
    setPreview(null);

    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const form = await res.json();
      setPreview(form);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `Created "${form.title}" with ${form.fields?.length || 0} fields.`,
          form,
        },
      ]);
      setForms((prev) => [{ ...form, _count: { responses: 0 } }, ...prev]);
      showToast("Form created");
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Failed to create form. Check your API key." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const deleteForm = async (id: string) => {
    if (!confirm("Delete this form and all its responses?")) return;
    await fetch(`/api/forms/${id}`, { method: "DELETE" });
    setForms((prev) => prev.filter((f) => f.id !== id));
    if (preview?.id === id) setPreview(null);
    showToast("Form deleted");
  };

  const copyLink = useCallback(
    (id: string) => {
      const url = `${window.location.origin}/f/${id}`;
      navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    },
    [showToast]
  );

  const totalResponses = forms.reduce((sum, f) => sum + f._count.responses, 0);
  const hasHistory = messages.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">BasheerForms</h1>
          {!fetching && forms.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 ml-4 pl-4 border-l border-border">
              <span className="text-xs text-muted">
                {forms.length} form{forms.length !== 1 && "s"}
              </span>
              <span className="text-xs text-muted">
                {totalResponses} response{totalResponses !== 1 && "s"}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          <button
            onClick={() => setTab("create")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "create" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Create
          </button>
          <button
            onClick={() => setTab("forms")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "forms" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            My Forms
          </button>
        </div>
      </header>

      {tab === "create" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat-style prompt */}
          <div className="w-1/2 border-r border-border flex flex-col">
            {/* Chat messages area */}
            <div className="flex-1 overflow-y-auto">
              {!hasHistory ? (
                /* Empty state with presets */
                <div className="p-6 h-full flex flex-col">
                  <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                    <h2 className="text-xl font-semibold text-foreground mb-1">What form do you need?</h2>
                    <p className="text-sm text-muted mb-6">
                      Describe it in your own words, or start from a preset.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => createForm(p.prompt)}
                          disabled={loading}
                          className="text-left p-3 rounded-xl bg-surface border border-border hover:border-accent/40 hover:bg-accent/5 transition-all group disabled:opacity-50"
                        >
                          <span className="text-lg mb-1 block">{p.icon}</span>
                          <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                            {p.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Chat history */
                <div className="p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-accent text-white rounded-br-md"
                            : "bg-surface border border-border text-foreground rounded-bl-md"
                        }`}
                      >
                        <p>{msg.content}</p>
                        {msg.form && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-white/10">
                            <button
                              onClick={() => copyLink(msg.form!.id)}
                              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                                msg.role === "user"
                                  ? "bg-white/10 hover:bg-white/20 text-white/90"
                                  : "bg-accent/10 text-accent hover:bg-accent/20"
                              }`}
                            >
                              Copy Link
                            </button>
                            <Link
                              href={`/f/${msg.form.id}`}
                              target="_blank"
                              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                                msg.role === "user"
                                  ? "bg-white/10 hover:bg-white/20 text-white/90"
                                  : "bg-accent/10 text-accent hover:bg-accent/20"
                              }`}
                            >
                              Open Form
                            </Link>
                            <button
                              onClick={() => setPreview(msg.form!)}
                              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                                msg.role === "user"
                                  ? "bg-white/10 hover:bg-white/20 text-white/90"
                                  : "bg-accent/10 text-accent hover:bg-accent/20"
                              }`}
                            >
                              Preview
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="p-4 border-t border-border">
              {hasHistory && (
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  {PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setPrompt(p.prompt)}
                      disabled={loading}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-surface border border-border text-muted hover:text-foreground hover:border-accent/30 transition-colors disabled:opacity-50"
                    >
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted focus:ring-2 focus:ring-accent focus:border-transparent resize-none text-sm"
                  rows={2}
                  placeholder={hasHistory ? "Describe another form..." : "Describe what you need..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      createForm();
                    }
                  }}
                />
                <button
                  onClick={() => createForm()}
                  disabled={loading || !prompt.trim()}
                  className="self-end bg-accent text-white p-3 rounded-xl hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="w-1/2 flex flex-col bg-surface/50 overflow-y-auto">
            {loading && !preview ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="relative w-12 h-12 mx-auto mb-4">
                    <div className="absolute inset-0 border-2 border-accent/20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="text-foreground text-sm font-medium mb-1">Building your form...</p>
                  <p className="text-muted text-xs">This usually takes a few seconds</p>
                </div>
              </div>
            ) : preview ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <h2 className="text-sm font-medium text-foreground">Form Ready</h2>
                    <span className="text-xs text-muted">{preview.fields?.length || 0} fields</span>
                  </div>
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
                      className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                    >
                      Open Form
                    </Link>
                  </div>
                </div>
                <div className="bg-surface border border-border rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-1">{preview.title}</h3>
                  {preview.description && <p className="text-sm text-muted mb-6">{preview.description}</p>}
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
                            {field.options?.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : field.type === "radio" ? (
                          <div className="space-y-2">
                            {field.options?.map((o) => (
                              <label key={o} className="radio-option">
                                <input type="radio" name={field.id} disabled />
                                {o}
                              </label>
                            ))}
                          </div>
                        ) : field.type === "checkbox" ? (
                          <div className="space-y-2">
                            {field.options?.map((o) => (
                              <label key={o} className="checkbox-option">
                                <input type="checkbox" disabled />
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
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </div>
                  <p className="text-foreground text-sm font-medium mb-1">Live Preview</p>
                  <p className="text-muted text-xs">Your form will appear here as soon as it's generated</p>
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
              <div className="text-center text-muted py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : forms.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <p className="text-foreground font-medium mb-1">No forms yet</p>
                <p className="text-muted text-sm mb-6">Create your first form with AI</p>
                <button
                  onClick={() => setTab("create")}
                  className="bg-accent text-white px-5 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors"
                >
                  Create Form
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className="bg-surface border border-border rounded-xl p-4 hover:border-accent/30 transition-colors group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground truncate">{form.title}</h3>
                          {form._count.responses > 0 && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
                              {form._count.responses}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted truncate mt-0.5">{form.description}</p>
                        <span className="text-xs text-muted mt-1.5 block">
                          {formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast.message} show={toast.show} onHide={hideToast} />
    </div>
  );
}
