"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SignaturePad } from "@/components/SignaturePad";

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  accept?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

interface UploadedFile {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

interface FormData {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
}

export default function PublicForm() {
  const { id } = useParams();
  const [form, setForm] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Per-field upload state for file/image fields
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadInfo, setUploadInfo] = useState<Record<string, UploadedFile | null>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/forms/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setForm(data);
        const initial: Record<string, any> = {};
        data.fields?.forEach((f: FormField) => {
          if (f.type === "checkbox") {
            initial[f.id] = [];
          } else if (f.type === "scale") {
            // Default the slider to its midpoint so it shows something useful
            // before the user touches it.
            const mn = f.min ?? 0;
            const mx = f.max ?? 100;
            initial[f.id] = Math.round((mn + mx) / 2);
          } else if (f.type === "rating") {
            // Ratings start at 0 (unrated) so requiredness can be enforced.
            initial[f.id] = 0;
          } else {
            initial[f.id] = "";
          }
        });
        setValues(initial);
      })
      .catch(() => setError("Form not found"));
  }, [id]);

  const setValue = (fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleCheckbox = (fieldId: string, option: string) => {
    setValues((prev) => {
      const current = prev[fieldId] || [];
      return {
        ...prev,
        [fieldId]: current.includes(option)
          ? current.filter((o: string) => o !== option)
          : [...current, option],
      };
    });
  };

  const handleSignatureChange = async (fieldId: string, dataUrl: string | null) => {
    if (!dataUrl) {
      setValue(fieldId, "");
      setUploadInfo((prev) => ({ ...prev, [fieldId]: null }));
      return;
    }
    setUploading((prev) => ({ ...prev, [fieldId]: true }));
    try {
      // Convert the canvas data URL → Blob → File so we can reuse the
      // existing /api/upload pipeline (and the existing bind-mounted disk).
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `signature-${fieldId}.png`, { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Signature upload failed");
      const data: UploadedFile = await res.json();
      const absoluteUrl = data.url.startsWith("http")
        ? data.url
        : `${window.location.origin}${data.url}`;
      setValue(fieldId, absoluteUrl);
      setUploadInfo((prev) => ({ ...prev, [fieldId]: { ...data, url: absoluteUrl } }));
    } catch (e: any) {
      setUploadError((prev) => ({ ...prev, [fieldId]: e.message || "Signature upload failed" }));
    } finally {
      setUploading((prev) => ({ ...prev, [fieldId]: false }));
    }
  };

  const handleFileChange = async (fieldId: string, file: File | null) => {
    if (!file) {
      setValue(fieldId, "");
      setUploadInfo((prev) => ({ ...prev, [fieldId]: null }));
      setUploadError((prev) => ({ ...prev, [fieldId]: "" }));
      return;
    }
    setUploading((prev) => ({ ...prev, [fieldId]: true }));
    setUploadError((prev) => ({ ...prev, [fieldId]: "" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data: UploadedFile = await res.json();
      // Store an absolute URL so the response JSON + Twenty CRM payload
      // contain a fully-qualified link.
      const absoluteUrl = data.url.startsWith("http")
        ? data.url
        : `${window.location.origin}${data.url}`;
      setValue(fieldId, absoluteUrl);
      setUploadInfo((prev) => ({ ...prev, [fieldId]: { ...data, url: absoluteUrl } }));
    } catch (e: any) {
      setUploadError((prev) => ({ ...prev, [fieldId]: e.message || "Upload failed" }));
      setValue(fieldId, "");
      setUploadInfo((prev) => ({ ...prev, [fieldId]: null }));
    } finally {
      setUploading((prev) => ({ ...prev, [fieldId]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`/api/forms/${id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSubmitted(true);
    } catch {
      alert("Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">Thank you!</h2>
          <p className="text-muted">Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface border border-border rounded-2xl p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">{form.title}</h1>
            {form.description && (
              <p className="text-sm text-muted mt-1">{form.description}</p>
            )}
          </div>

          {/* Progress */}
          {form.fields.length > 3 && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>Progress</span>
                <span>{Object.values(values).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== "")).length} / {form.fields.length}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(Object.values(values).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== "")).length / form.fields.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {form.fields.map((field) => (
              <div key={field.id} className="form-field">
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {field.label}
                  {field.required && <span className="text-danger ml-1">*</span>}
                </label>

                {field.type === "textarea" ? (
                  <textarea
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={4}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  />
                ) : field.type === "select" ? (
                  <select
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === "radio" ? (
                  <div className="space-y-2">
                    {field.options?.map((opt) => (
                      <label key={opt} className="radio-option">
                        <input
                          type="radio"
                          name={field.id}
                          value={opt}
                          required={field.required}
                          checked={values[field.id] === opt}
                          onChange={() => setValue(field.id, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === "checkbox" ? (
                  <div className="space-y-2">
                    {field.options?.map((opt) => (
                      <label key={opt} className="checkbox-option">
                        <input
                          type="checkbox"
                          checked={(values[field.id] || []).includes(opt)}
                          onChange={() => toggleCheckbox(field.id, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === "scale" ? (
                  // Range slider with live value display + min/max labels
                  (() => {
                    const mn = field.min ?? 0;
                    const mx = field.max ?? 100;
                    const stp = field.step ?? 1;
                    const v = Number(values[field.id] ?? Math.round((mn + mx) / 2));
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted">{mn}{field.unit || ""}</span>
                          <span className="text-2xl font-semibold text-accent tabular-nums">
                            {v}
                            {field.unit && <span className="text-base text-muted ml-1">{field.unit}</span>}
                          </span>
                          <span className="text-xs text-muted">{mx}{field.unit || ""}</span>
                        </div>
                        <input
                          type="range"
                          min={mn}
                          max={mx}
                          step={stp}
                          value={v}
                          required={field.required}
                          onChange={(e) => setValue(field.id, Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    );
                  })()
                ) : field.type === "rating" ? (
                  // Star rating — clickable buttons. Default 1-5 stars, override via field.max.
                  (() => {
                    const mx = field.max ?? 5;
                    const v = Number(values[field.id] || 0);
                    return (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: mx }).map((_, i) => {
                          const star = i + 1;
                          const filled = v >= star;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setValue(field.id, star)}
                              className={`text-2xl leading-none transition-colors ${
                                filled ? "text-yellow-400" : "text-muted/30 hover:text-yellow-400/60"
                              }`}
                              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                            >
                              ★
                            </button>
                          );
                        })}
                        {v > 0 && (
                          <span className="ml-2 text-xs text-muted">{v} / {mx}</span>
                        )}
                        {/* Hidden field to enforce required validation natively */}
                        {field.required && (
                          <input
                            type="number"
                            value={v || ""}
                            required
                            min={1}
                            tabIndex={-1}
                            onChange={() => {}}
                            className="sr-only"
                          />
                        )}
                      </div>
                    );
                  })()
                ) : field.type === "signature" ? (
                  <div className="space-y-2">
                    <SignaturePad
                      required={field.required}
                      disabled={uploading[field.id]}
                      onChange={(url) => handleSignatureChange(field.id, url)}
                    />
                    {uploading[field.id] && <p className="text-xs text-muted">Saving signature…</p>}
                    {uploadError[field.id] && (
                      <p className="text-xs text-danger">{uploadError[field.id]}</p>
                    )}
                  </div>
                ) : field.type === "time" ? (
                  <input
                    type="time"
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  />
                ) : field.type === "datetime" ? (
                  <input
                    type="datetime-local"
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  />
                ) : field.type === "yes_no" ? (
                  <div className="flex gap-2">
                    {["Yes", "No"].map((opt) => {
                      const selected = values[field.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setValue(field.id, opt)}
                          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            selected
                              ? opt === "Yes"
                                ? "bg-success/15 border-success/40 text-success"
                                : "bg-danger/10 border-danger/40 text-danger"
                              : "bg-surface border-border text-muted hover:text-foreground hover:border-accent/30"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    {/* Hidden required guard */}
                    {field.required && (
                      <input
                        type="text"
                        value={values[field.id] || ""}
                        required
                        tabIndex={-1}
                        onChange={() => {}}
                        className="sr-only"
                      />
                    )}
                  </div>
                ) : field.type === "likert" ? (
                  // 5-button agreement scale. If options provided, use them;
                  // otherwise default to standard Likert labels.
                  (() => {
                    const labels = field.options && field.options.length === 5
                      ? field.options
                      : ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-1">
                          {labels.map((opt) => {
                            const selected = values[field.id] === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setValue(field.id, opt)}
                                className={`px-1 py-2 rounded-md text-[10px] leading-tight font-medium border transition-colors text-center ${
                                  selected
                                    ? "bg-accent/15 border-accent/50 text-accent"
                                    : "bg-surface border-border text-muted hover:text-foreground hover:border-accent/30"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {field.required && (
                          <input
                            type="text"
                            value={values[field.id] || ""}
                            required
                            tabIndex={-1}
                            onChange={() => {}}
                            className="sr-only"
                          />
                        )}
                      </div>
                    );
                  })()
                ) : field.type === "file" || field.type === "image" ? (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept={field.accept || (field.type === "image" ? "image/*" : undefined)}
                      required={field.required && !values[field.id]}
                      disabled={uploading[field.id]}
                      onChange={(e) => handleFileChange(field.id, e.target.files?.[0] || null)}
                      className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-surface-2 file:text-foreground file:font-medium file:cursor-pointer hover:file:bg-surface-2/80 disabled:opacity-50"
                    />
                    {uploading[field.id] && (
                      <p className="text-xs text-muted">Uploading…</p>
                    )}
                    {uploadError[field.id] && (
                      <p className="text-xs text-danger">{uploadError[field.id]}</p>
                    )}
                    {uploadInfo[field.id] && !uploading[field.id] && (
                      <div className="text-xs text-muted">
                        {field.type === "image" && uploadInfo[field.id]?.mimeType?.startsWith("image/") ? (
                          <img
                            src={uploadInfo[field.id]!.url}
                            alt={uploadInfo[field.id]!.filename}
                            className="max-h-32 rounded-md border border-border mt-1"
                          />
                        ) : (
                          <a
                            href={uploadInfo[field.id]!.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            ✓ {uploadInfo[field.id]!.filename}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-white py-3 rounded-xl font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors text-sm mt-2"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted/50 mt-4">Powered by ANC</p>
      </div>
    </div>
  );
}
