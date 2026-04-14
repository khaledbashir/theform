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
  // Auto-fill config — optional extras that let a field trigger a lookup
  // when the user finishes interacting with it.
  //
  //   autoFillClientTarget: (on "email" fields) the id of another field that
  //     should receive the matched company name on blur. Silent-fail when no
  //     match — never clobbers a value the user has already typed.
  //
  //   shippingTarget: (on "venue" fields) the id of another field that
  //     should receive the selected venue's street address on pick.
  //
  //   venueFieldId: (on "venue_assets" fields) the id of the venue field
  //     whose selection drives the asset list shown here.
  autoFillClientTarget?: string;
  shippingTarget?: string;
  venueFieldId?: string;
}

type VenueSuggestion = { id: string; name: string; market: string | null };
type AssetOption = {
  id: string;
  name: string;
  displayType: string | null;
  screenLocation: string | null;
  orientation: string | null;
  resolution: string | null;
};

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
  // Auto-fill state
  const [autoFillNote, setAutoFillNote] = useState<Record<string, string>>({});
  const [venueSuggestions, setVenueSuggestions] = useState<Record<string, VenueSuggestion[]>>({});
  const [venueAssets, setVenueAssets] = useState<Record<string, AssetOption[]>>({});

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

  // On email blur, try to auto-fill a target field with the matching client.
  // Fires only if the target field is currently empty.
  const handleEmailAutoFill = async (field: FormField, email: string) => {
    if (!field.autoFillClientTarget || !email || !email.includes("@")) return;
    const targetId = field.autoFillClientTarget;
    if (String(values[targetId] || "").trim()) return;
    try {
      const res = await fetch(`/api/lookups/company-by-email?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data?.match?.name) {
        setValue(targetId, data.match.name);
        setAutoFillNote((p) => ({
          ...p,
          [targetId]: `Auto-filled from ${data.match.domain} — edit if wrong`,
        }));
      }
    } catch { /* silent */ }
  };

  // Venue typeahead
  const handleVenueSearch = async (fieldId: string, q: string) => {
    setValue(fieldId, q);
    // Clear any venueId once the user types again
    setValue(`${fieldId}__id`, "");
    if (q.length < 2) {
      setVenueSuggestions((p) => ({ ...p, [fieldId]: [] }));
      return;
    }
    try {
      const res = await fetch(`/api/lookups/venues?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setVenueSuggestions((p) => ({ ...p, [fieldId]: data.venues || [] }));
    } catch { /* silent */ }
  };

  // When a venue is picked, fill the visible name + hidden id, auto-fill
  // shipping target if configured, and seed asset pickers that reference it.
  const pickVenue = async (field: FormField, v: VenueSuggestion) => {
    setValue(field.id, v.name);
    setValue(`${field.id}__id`, v.id);
    setVenueSuggestions((p) => ({ ...p, [field.id]: [] }));

    // Asset list for any venue_assets field pointing at this venue
    if (form?.fields) {
      const assetFields = form.fields.filter(
        (f) => f.type === "venue_assets" && f.venueFieldId === field.id
      );
      if (assetFields.length > 0) {
        try {
          const res = await fetch(`/api/lookups/assets-at-venue?venueId=${v.id}`);
          const data = await res.json();
          const assets: AssetOption[] = data.assets || [];
          for (const af of assetFields) {
            setVenueAssets((p) => ({ ...p, [af.id]: assets }));
            // Reset selection when venue changes
            setValue(af.id, []);
          }
        } catch { /* silent */ }
      }
    }

    // Shipping auto-fill
    if (field.shippingTarget) {
      try {
        const res = await fetch(`/api/lookups/venue-details?id=${v.id}`);
        const data = await res.json();
        const d = data?.venue;
        if (d) {
          const parts = [d.addressStreet1, d.addressCity, d.addressState, d.addressPostcode].filter(Boolean);
          if (parts.length > 0 && !String(values[field.shippingTarget] || "").trim()) {
            setValue(field.shippingTarget, parts.join(", "));
            setAutoFillNote((p) => ({
              ...p,
              [field.shippingTarget!]: `Auto-filled from ${v.name} — edit if wrong`,
            }));
          }
        }
      } catch { /* silent */ }
    }
  };

  // Asset chip toggle for venue_assets fields
  const toggleAsset = (fieldId: string, assetId: string) => {
    setValues((prev) => {
      const current: string[] = prev[fieldId] || [];
      const next = current.includes(assetId)
        ? current.filter((x) => x !== assetId)
        : [...current, assetId];
      return { ...prev, [fieldId]: next };
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
                ) : field.type === "venue" ? (
                  // Venue typeahead — searches Twenty as the user types.
                  // On pick, optionally fills a shipping-target field and
                  // seeds any venue_assets fields that reference this one.
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={field.placeholder || "Start typing — Fenway, Prudential…"}
                      required={field.required}
                      value={values[field.id] || ""}
                      autoComplete="off"
                      onChange={(e) => handleVenueSearch(field.id, e.target.value)}
                    />
                    {(venueSuggestions[field.id]?.length || 0) > 0 && (
                      <ul className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {venueSuggestions[field.id]!.map((v) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => pickVenue(field, v)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2"
                            >
                              <div className="font-medium text-foreground">{v.name}</div>
                              {v.market && <div className="text-xs text-muted">{v.market}</div>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : field.type === "venue_assets" ? (
                  // Multi-select chip picker populated from Twenty inventory
                  // for the linked venue field. Shows a hint until a venue
                  // is picked.
                  (() => {
                    const options = venueAssets[field.id] || [];
                    const selected: string[] = values[field.id] || [];
                    if (options.length === 0) {
                      return (
                        <div className="text-xs text-muted italic px-3 py-2 bg-surface-2 rounded-md">
                          Pick a venue above — the boards/sections at that venue will appear here.
                        </div>
                      );
                    }
                    return (
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {options.map((a) => {
                            const isSel = selected.includes(a.id);
                            const subtitle = [a.displayType, a.orientation, a.resolution].filter(Boolean).join(" · ");
                            return (
                              <button
                                type="button"
                                key={a.id}
                                onClick={() => toggleAsset(field.id, a.id)}
                                title={subtitle}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                  isSel
                                    ? "bg-accent text-white border-accent"
                                    : "bg-surface text-foreground border-border hover:border-accent/50"
                                }`}
                              >
                                {isSel ? "✓ " : ""}{a.name}
                              </button>
                            );
                          })}
                        </div>
                        {selected.length > 0 && (
                          <div className="text-xs text-muted mt-2">{selected.length} selected</div>
                        )}
                        {field.required && (
                          <input
                            type="text"
                            value={selected.length > 0 ? "ok" : ""}
                            required
                            tabIndex={-1}
                            onChange={() => {}}
                            className="sr-only"
                          />
                        )}
                      </div>
                    );
                  })()
                ) : field.type === "email" && field.autoFillClientTarget ? (
                  // Email field with auto-fill on blur — looks up the
                  // sending domain against Twenty companies and populates
                  // the target client field if it's still empty.
                  <input
                    type="email"
                    placeholder={field.placeholder}
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    onBlur={(e) => handleEmailAutoFill(field, e.target.value)}
                  />
                ) : (
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                  />
                )}
                {autoFillNote[field.id] && (
                  <p className="text-xs text-emerald-500 mt-1">✨ {autoFillNote[field.id]}</p>
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
