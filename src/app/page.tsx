"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Toast, useToast } from "@/components/Toast";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

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

interface Form {
  id: string;
  title: string;
  description: string;
  fields?: FormField[];
  createdAt: string;
  _count: { responses: number };
  // Added by GET /api/forms — null if no responses yet
  lastResponseAt?: string | null;
  // Twenty CRM custom-object name (e.g. "designRequests"), null if not connected
  crmTarget?: string | null;
}

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  form?: Form;
}

// Lightweight in-memory draft used during a Custom (conversational) session.
// It mirrors the GeneratedForm shape from the API but lives only in this
// component until the user is happy and the draft gets saved.
interface DraftForm {
  id?: string; // Set after the first save → subsequent iterations PATCH it
  title: string;
  description: string;
  fields: FormField[];
  crmTarget?: string | null;
}

// ANC-specific presets — these auto-configure a Twenty CRM target so every
// submission creates a record in the matching custom object. Field IDs in the
// prompt use snake_case matching the Twenty field names (auto-mapped via
// snakeToCamel in lib/twenty.ts).
const PRESETS = [
  {
    icon: "🎨",
    label: "Design Request",
    crmTarget: "designRequests",
    prompt: "An ANC Sports design request intake form. Use these EXACT field IDs (snake_case) in this order: requester_name, requester_email, client_name, venue_name, client_tri_code, deliverable_type (select: Ribbon graphic/Center-hung/Scoreboard/LED wall/Tunnel/Courtside/Dasherboard/Animation/Static graphic/Other), sport (select: NFL/NBA/MLB/NHL/MLS/WNBA/NCAA/Other), due_date (date), rush_request (checkbox), description (textarea, required), reference_notes (text), reference_image (image, optional, accept image/*). Title: 'ANC Design Request'. Description: 'Submit a design job to the ANC creative team'.",
  },
  {
    icon: "🖨️",
    label: "Print Request (Britten)",
    crmTarget: "printRequests",
    prompt: "An ANC Sports Britten print request form. Use these EXACT field IDs (snake_case): submitted_by, requester_email, client_name, sf_number, due_date (date), reprint (checkbox), rush_request (checkbox), baselines (number), home_plate (number), small_home_plate (number), other_qty (number), shipping_address (text), notes (textarea), design_file (file, optional, accept application/pdf,image/png,image/jpeg,application/postscript,application/illustrator). Title: 'ANC Print Request'. Description: 'Britten-fabricated signage — baselines, home plate, courtside'.",
  },
  {
    icon: "📦",
    label: "Parts Order",
    crmTarget: "partsOrders",
    prompt: "An ANC internal parts ordering form. Use these EXACT field IDs: requestor_name, requestor_email, venue_name (text, required), parts_needed (textarea, required — list brand/model/spec), quantity (number), urgency (select: Normal/Rush/Emergency), shipping_address (text, required), notes (textarea), part_photo (image, optional, accept image/* — photo of the broken or needed part). Title: 'ANC Parts Order'. Description: 'Internal parts ordering — cables, modules, replacements'.",
  },
  {
    icon: "📺",
    label: "Content Schedule",
    crmTarget: "contentSchedules",
    prompt: "An ANC operator content scheduling form. Use these EXACT field IDs: name (text, required — content title), scheduleClient (text — client name), operator (text), start_date (date, required), end_date (date, required), ftp_location (text), proof_link (url), project_location (text), client_tri_code (text), notes (textarea). Title: 'ANC Content Schedule'. Description: 'Schedule operator content to launch — places scheduling workflow'.",
  },
  {
    icon: "🖼️",
    label: "CG Design Request",
    crmTarget: "cgDesignRequests",
    prompt: "An ANC CG design request form for team/venue graphics. Use these EXACT field IDs: request_title (text, required), requester_email, cg_client (text — team name), sport (select: NFL/NBA/MLB/NHL/MLS/WNBA/NCAA), team_name (text), due_date (date), client_tri_code (text), description (textarea, required), reference_image (image, optional, accept image/* — example/inspiration shot). Title: 'ANC CG Design Request'. Description: 'Computer graphics for team/venue content'.",
  },
  {
    icon: "📋",
    label: "Walkthrough Log",
    crmTarget: "walkthroughLogs",
    prompt: "An ANC technician walkthrough log for venue inspection. Use these EXACT field IDs: name (text, required — 'Venue walkthrough'), venue_name (text, required), walkthrough_date (date, required), result (select: Good/Partial/Problem Detected), tech_name (text, required), items_checked (textarea — list what was inspected), issues_found (textarea — any problems), photo_url (image, optional, accept image/* — upload a photo of the venue or any issue found; the field type MUST be 'image' so the tech uploads a photo directly instead of pasting a URL). Title: 'Walkthrough Log'. Description: 'Log a venue walkthrough with any issues found'.",
  },
  {
    icon: "🎫",
    label: "Service Ticket",
    crmTarget: "serviceTickets",
    prompt: "An ANC service ticket intake for hardware or software issues. Use these EXACT field IDs: name (text, required — ticket subject), reporter_name (text, required), reporter_email (email, required), venue_name (text, required), category (select: Hardware/Software/General/Network/Display), priority (select: Low/Medium/High), description (textarea, required), photo_url (image, optional, accept image/* — upload a photo of the issue; the field type MUST be 'image' so the reporter uploads a photo directly instead of pasting a URL). Title: 'Service Ticket'. Description: 'Report an issue at any ANC venue'.",
  },
  {
    icon: "🏟️",
    label: "Venue Intake",
    crmTarget: "",
    prompt: "A new venue onboarding form for ANC Sports. Use these EXACT field IDs: venue_name (text, required), market (text), contact_name (text), contact_email (email, required), contact_phone (phone), venue_type (select: Stadium/Arena/Convention Center/University/Transit/Corporate/Retail), capacity (number), notes (textarea), venue_photo (image, optional, accept image/* — exterior or interior shot of the venue), venue_layout (file, optional, accept application/pdf,image/png,image/jpeg — floor plan or layout document). Title: 'New Venue Intake'. Description: 'Add a new venue to the ANC network'.",
  },
  {
    icon: "🪄",
    label: "Custom (chat with AI)",
    crmTarget: "",
    prompt: "", // empty prompt = conversational mode — AI asks clarifying questions first
    converse: true,
  },
];

// All field types the AI can generate, shown as small chips under the input
// so users can see what's available without reading docs.
const AVAILABLE_TYPES: Array<{ type: string; icon: string; label: string }> = [
  { type: "text",      icon: "Aa",  label: "Text" },
  { type: "email",     icon: "@",   label: "Email" },
  { type: "phone",     icon: "☎",   label: "Phone" },
  { type: "textarea",  icon: "¶",   label: "Long text" },
  { type: "number",    icon: "#",   label: "Number" },
  { type: "select",    icon: "▾",   label: "Dropdown" },
  { type: "radio",     icon: "◉",   label: "Radio" },
  { type: "checkbox",  icon: "☑",   label: "Checkbox" },
  { type: "date",      icon: "📅",  label: "Date" },
  { type: "time",      icon: "⏰",  label: "Time" },
  { type: "datetime",  icon: "📆",  label: "Date+Time" },
  { type: "url",       icon: "🔗",  label: "URL" },
  { type: "image",     icon: "🖼",   label: "Image" },
  { type: "file",      icon: "📎",  label: "File" },
  { type: "signature", icon: "✍",   label: "Signature" },
  { type: "scale",     icon: "▰",   label: "Scale slider" },
  { type: "rating",    icon: "★",   label: "Star rating" },
  { type: "yes_no",    icon: "✓✗",  label: "Yes/No" },
  { type: "likert",    icon: "▬",   label: "Likert scale" },
];

const DEFAULT_OPTIONS = {
  select: ["Option 1", "Option 2"],
  radio: ["Option 1", "Option 2"],
  checkbox: ["Option 1", "Option 2"],
  likert: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
};

function slugifyFieldId(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42);
  return `${slug || "field"}_${Date.now().toString(36)}`;
}

function fieldDefaults(type: string): FormField {
  const meta = AVAILABLE_TYPES.find((t) => t.type === type);
  const label = meta?.label || "New field";
  const base: FormField = {
    id: slugifyFieldId(label),
    type,
    label,
    placeholder: type === "textarea" ? "Enter details..." : `Enter ${label.toLowerCase()}...`,
    required: false,
  };

  if (type in DEFAULT_OPTIONS) {
    base.options = DEFAULT_OPTIONS[type as keyof typeof DEFAULT_OPTIONS];
  }
  if (type === "scale") {
    base.min = 0;
    base.max = 10;
    base.step = 1;
  }
  if (type === "rating") {
    base.max = 5;
  }
  if (type === "image") {
    base.accept = "image/*";
  }
  return base;
}

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
  // Conversational mode state — set when the user picks the Custom preset
  // and turns the chat into a multi-turn conversation with the AI.
  const [conversing, setConversing] = useState(false);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!preview?.fields?.length) {
      setSelectedFieldId(null);
      return;
    }
    if (!selectedFieldId || !preview.fields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(preview.fields[0].id);
    }
  }, [preview, selectedFieldId]);

  // Reset chat + draft + conversational mode (e.g. when switching presets)
  const resetSession = () => {
    setMessages([]);
    setPreview(null);
    setDraft(null);
    setConversing(false);
  };

  // Start a Custom (conversational) session — opens a fresh chat with an
  // AI greeting and waits for the user to describe what they need.
  const startCustomConversation = () => {
    resetSession();
    setConversing(true);
    setMessages([
      {
        role: "ai",
        content:
          "Sure — what kind of form do you need? Tell me what it's for, who's filling it out, and what info you want to collect. I'll ask follow-ups if I need them.",
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Conversational mode handler — runs every user message after Custom is
  // picked. Hits /api/forms/converse with the running history + the current
  // draft. AI either asks more questions or returns an updated form.
  const sendConversationTurn = async (userText: string) => {
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setPrompt("");
    setLoading(true);
    try {
      // Build the conversation history the AI sees. Convert local "ai" role
      // to "assistant" which is what OpenAI-compatible APIs expect.
      const history = [
        ...messages,
        { role: "user" as const, content: userText },
      ].map((m) => ({
        role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      const res = await fetch("/api/forms/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          currentForm: draft
            ? { title: draft.title, description: draft.description, fields: draft.fields }
            : null,
        }),
      });
      const result = await res.json();

      if (result.type === "question") {
        setMessages((prev) => [...prev, { role: "ai", content: result.message }]);
        return;
      }

      if (result.type === "form") {
        // Save (or update) the draft in the database.
        let saved: Form;
        if (draft?.id) {
          // PATCH the existing draft
          const patchRes = await fetch(`/api/forms/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: result.title,
              description: result.description,
              fields: result.fields,
            }),
          });
          saved = await patchRes.json();
          setForms((prev) => prev.map((f) => (f.id === saved.id ? { ...f, ...saved } : f)));
        } else {
          // First-time save — POST a new form. We do NOT pass a prompt so the
          // server creates a row directly from the conversational result.
          // To stay compatible with the existing POST /api/forms (which calls
          // generateForm internally), we do a minimal POST of a stringified
          // hint and let the AI honor what we already shaped via the converse
          // endpoint. Cleaner: a new POST endpoint that takes a pre-built form.
          // Implementing the cleaner path inline here:
          const createRes = await fetch("/api/forms/from-converse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: result.title,
              description: result.description,
              fields: result.fields,
            }),
          });
          saved = await createRes.json();
          setForms((prev) => [{ ...saved, _count: { responses: 0 } }, ...prev]);
        }

        setDraft({
          id: saved.id,
          title: result.title,
          description: result.description,
          fields: result.fields,
        });
        setPreview(saved);
        setSelectedFieldId(result.fields[0]?.id || null);
        setDirty(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: draft?.id
              ? `Updated. ${result.fields.length} field${result.fields.length !== 1 ? "s" : ""}. Tell me what to change next, or grab the link from the right.`
              : `Built "${result.title}" with ${result.fields.length} field${result.fields.length !== 1 ? "s" : ""}. Tell me what to change, or grab the link from the right when you're happy.`,
            form: saved,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Sorry, that didn't work. Try rephrasing?" },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const createForm = async (overridePrompt?: string, crmTarget?: string) => {
    const text = overridePrompt || prompt.trim();
    if (!text) return;

    // If we're in conversational mode, route through the converse handler
    // instead of single-shot generation.
    if (conversing) {
      return sendConversationTurn(text);
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPrompt("");
    setLoading(true);
    setPreview(null);

    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, crmTarget: crmTarget || undefined }),
      });
      const form = await res.json();
      setPreview(form);
      setSelectedFieldId(form.fields?.[0]?.id || null);
      setDirty(false);
      const crmNote = form.crmTarget
        ? ` Connected to CRM → ${form.crmTarget}`
        : "";
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `Created "${form.title}" with ${form.fields?.length || 0} fields.${crmNote}`,
          form,
        },
      ]);
      setForms((prev) => [{ ...form, _count: { responses: 0 } }, ...prev]);
      showToast(crmTarget ? "Form created + connected to CRM" : "Form created");
    } catch {
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
    if (preview?.id === id) {
      setPreview(null);
      setSelectedFieldId(null);
      setDirty(false);
    }
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

  const patchPreview = useCallback((updater: (form: Form) => Form) => {
    setDirty(true);
    setPreview((current) => {
      if (!current) return current;
      return updater(current);
    });
  }, []);

  const updatePreviewMeta = (patch: Partial<Pick<Form, "title" | "description">>) => {
    patchPreview((form) => ({ ...form, ...patch }));
  };

  const updatePreviewField = (fieldId: string, patch: Partial<FormField>) => {
    patchPreview((form) => ({
      ...form,
      fields: (form.fields || []).map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field
      ),
    }));
  };

  const addPreviewField = (type: string, index?: number) => {
    const field = fieldDefaults(type);
    patchPreview((form) => {
      const fields = [...(form.fields || [])];
      const insertAt = index === undefined ? fields.length : index;
      fields.splice(insertAt, 0, field);
      return { ...form, fields };
    });
    setSelectedFieldId(field.id);
  };

  const duplicatePreviewField = (field: FormField) => {
    const clone = {
      ...field,
      id: slugifyFieldId(field.label),
      label: `${field.label} copy`,
      options: field.options ? [...field.options] : undefined,
    };
    patchPreview((form) => {
      const fields = [...(form.fields || [])];
      const index = fields.findIndex((candidate) => candidate.id === field.id);
      fields.splice(index >= 0 ? index + 1 : fields.length, 0, clone);
      return { ...form, fields };
    });
    setSelectedFieldId(clone.id);
  };

  const removePreviewField = (fieldId: string) => {
    patchPreview((form) => {
      const fields = (form.fields || []).filter((field) => field.id !== fieldId);
      return { ...form, fields };
    });
    setSelectedFieldId((current) => (current === fieldId ? null : current));
  };

  const movePreviewField = (fieldId: string, direction: -1 | 1) => {
    patchPreview((form) => {
      const fields = [...(form.fields || [])];
      const index = fields.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= fields.length) return form;
      const [field] = fields.splice(index, 1);
      fields.splice(nextIndex, 0, field);
      return { ...form, fields };
    });
  };

  const updateOptions = (field: FormField, value: string) => {
    updatePreviewField(field.id, {
      options: value
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean),
    });
  };

  const startBlankBuilder = async () => {
    resetSession();
    setLoading(true);
    try {
      const initial = {
        title: "Untitled ANC Form",
        description: "Collect the details your team needs.",
        fields: [fieldDefaults("text")],
      };
      const res = await fetch("/api/forms/from-converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initial),
      });
      const form = await res.json();
      setForms((prev) => [{ ...form, _count: { responses: 0 } }, ...prev]);
      setPreview(form);
      setSelectedFieldId(form.fields?.[0]?.id || null);
      setDirty(false);
      showToast("Blank builder started");
    } catch {
      showToast("Could not start builder");
    } finally {
      setLoading(false);
    }
  };

  const savePreview = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/forms/${preview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: preview.title,
          description: preview.description,
          fields: preview.fields || [],
        }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Save failed");
      setForms((prev) =>
        prev.map((form) =>
          form.id === saved.id
            ? {
                ...form,
                title: saved.title,
                description: saved.description,
                fields: saved.fields,
              }
            : form
        )
      );
      setPreview((current) => (current ? { ...current, ...saved } : current));
      setDirty(false);
      showToast("Builder changes saved");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const totalResponses = forms.reduce((sum, f) => sum + f._count.responses, 0);
  const hasHistory = messages.length > 0;
  const selectedField = preview?.fields?.find((field) => field.id === selectedFieldId) || null;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/anc-logo.png"
            alt="ANC Sports"
            width={128}
            height={28}
            className="h-7 w-auto"
            style={{ width: "auto" }}
          />
          <span className="h-5 w-px bg-border" />
          <h1 className="text-lg font-semibold text-foreground">Forms</h1>
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
        <div className="flex-1 flex overflow-hidden bg-background">
          <aside className="w-[310px] shrink-0 border-r border-border bg-surface flex flex-col">
            <div className="p-4 border-b border-border">
              <button
                onClick={startBlankBuilder}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {loading && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Blank builder
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">AI starter</h2>
                <div className="grid grid-cols-1 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() =>
                        p.converse ? startCustomConversation() : createForm(p.prompt, p.crmTarget)
                      }
                      disabled={loading}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                        p.converse
                          ? "border-accent/40 bg-accent/5 hover:border-accent"
                          : "border-border bg-surface hover:border-accent/40 hover:bg-accent/5"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          <span className="mr-2">{p.icon}</span>
                          {p.label}
                        </span>
                        {p.converse ? (
                          <MessageSquare className="h-3.5 w-3.5 text-accent" />
                        ) : p.crmTarget ? (
                          <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                            CRM
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Field palette</h2>
                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_TYPES.map((fieldType) => (
                    <button
                      key={fieldType.type}
                      onClick={() => addPreviewField(fieldType.type)}
                      disabled={!preview}
                      className="min-h-9 rounded-md border border-border bg-surface-2 px-2 text-left text-[11px] text-muted hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      title={preview ? `Add ${fieldType.label}` : "Start or generate a form first"}
                    >
                      <span className="mr-1 font-semibold text-foreground/70">{fieldType.icon}</span>
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </section>

              {hasHistory && (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Chat</h2>
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-white"
                            : "border border-border bg-surface-2 text-foreground"
                        }`}
                      >
                        {msg.content}
                        {msg.form && (
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => copyLink(msg.form!.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1"
                              title="Copy public form link"
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                            <button
                              onClick={() => {
                                setPreview(msg.form!);
                                setDirty(false);
                              }}
                              className="rounded-md bg-white/10 px-2 py-1"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {loading && (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        Building
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </section>
              )}
            </div>

            <div className="border-t border-border bg-surface p-4">
              {conversing && (
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-accent">Custom chat active</span>
                  <button onClick={resetSession} className="text-muted hover:text-foreground">
                    Exit
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  className="min-h-20 flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-subtle"
                  placeholder={conversing ? "Reply to the AI..." : "Ask AI to build or revise a form..."}
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
                  className="self-end rounded-lg bg-accent p-2.5 text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  title="Send to AI"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquare className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-6">
              {loading && !preview ? (
                <div className="flex min-h-[70vh] items-center justify-center text-center">
                  <div>
                    <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-accent" />
                    <p className="mb-1 text-sm font-medium text-foreground">Building your form</p>
                    <p className="text-xs text-muted">The builder opens as soon as the form is ready.</p>
                  </div>
                </div>
              ) : preview ? (
                <div>
                  <div className="sticky top-0 z-10 -mx-8 mb-5 border-b border-border bg-background/95 px-8 py-3 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${dirty ? "bg-danger" : "bg-success"}`} />
                        <span className="truncate text-sm font-medium text-foreground">
                          {dirty ? "Unsaved edits" : "Saved"}
                        </span>
                        <span className="text-xs text-muted">{preview.fields?.length || 0} fields</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => copyLink(preview.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </button>
                        <Link
                          href={`/f/${preview.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </Link>
                        <button
                          onClick={savePreview}
                          disabled={saving || !dirty}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
                    <input
                      value={preview.title}
                      onChange={(e) => updatePreviewMeta({ title: e.target.value })}
                      className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-2xl font-semibold text-foreground outline-none hover:border-border focus:border-accent focus:bg-surface-2"
                      placeholder="Form title"
                    />
                    <textarea
                      value={preview.description || ""}
                      onChange={(e) => updatePreviewMeta({ description: e.target.value })}
                      className="mt-1 min-h-11 w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-muted outline-none hover:border-border focus:border-accent focus:bg-surface-2"
                      placeholder="Short description"
                    />

                    <div className="mt-5 space-y-3">
                      {(preview.fields || []).map((field, index) => (
                        <div
                          key={field.id}
                          onClick={() => setSelectedFieldId(field.id)}
                          className={`group rounded-lg border p-4 transition-colors ${
                            selectedFieldId === field.id
                              ? "border-accent bg-accent/5"
                              : "border-border bg-surface hover:border-accent/40"
                          }`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <input
                                value={field.label}
                                onChange={(e) => updatePreviewField(field.id, { label: e.target.value })}
                                className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground outline-none hover:border-border focus:border-accent focus:bg-surface"
                              />
                              {field.required && <span className="ml-1 text-danger">*</span>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePreviewField(field.id, -1);
                                }}
                                disabled={index === 0}
                                className="rounded-md border border-border bg-surface p-1 text-muted hover:text-foreground disabled:opacity-35"
                                title="Move up"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePreviewField(field.id, 1);
                                }}
                                disabled={index === (preview.fields?.length || 0) - 1}
                                className="rounded-md border border-border bg-surface p-1 text-muted hover:text-foreground disabled:opacity-35"
                                title="Move down"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicatePreviewField(field);
                                }}
                                className="rounded-md border border-border bg-surface p-1 text-muted hover:text-foreground"
                                title="Duplicate"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePreviewField(field.id);
                                }}
                                className="rounded-md border border-border bg-surface p-1 text-danger/70 hover:text-danger"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="form-field pointer-events-none">
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
                            ) : field.type === "scale" ? (
                              <div className="space-y-1 opacity-70">
                                <div className="flex justify-between text-xs text-muted">
                                  <span>{field.min ?? 0}</span>
                                  <span className="font-semibold text-foreground">
                                    {Math.round(((field.min ?? 0) + (field.max ?? 100)) / 2)}
                                  </span>
                                  <span>{field.max ?? 100}</span>
                                </div>
                                <input type="range" disabled className="w-full accent-accent" />
                              </div>
                            ) : field.type === "rating" ? (
                              <div className="flex gap-1 opacity-70">
                                {Array.from({ length: field.max ?? 5 }).map((_, i) => (
                                  <span key={i} className="text-2xl text-muted/30">★</span>
                                ))}
                              </div>
                            ) : field.type === "signature" ? (
                              <div className="flex h-[100px] items-center justify-center rounded-md border border-border bg-white text-xs text-muted opacity-70">
                                Signature pad
                              </div>
                            ) : field.type === "time" || field.type === "datetime" ? (
                              <input type={field.type === "datetime" ? "datetime-local" : "time"} readOnly />
                            ) : field.type === "yes_no" ? (
                              <div className="flex gap-2 opacity-70">
                                <span className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-muted">Yes</span>
                                <span className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-muted">No</span>
                              </div>
                            ) : field.type === "likert" ? (
                              <div className="grid grid-cols-5 gap-1 opacity-70">
                                {(field.options && field.options.length === 5
                                  ? field.options
                                  : DEFAULT_OPTIONS.likert
                                ).map((o) => (
                                  <span key={o} className="rounded-md border border-border bg-surface px-1 py-2 text-center text-[10px] font-medium leading-tight text-muted">
                                    {o}
                                  </span>
                                ))}
                              </div>
                            ) : field.type === "file" || field.type === "image" ? (
                              <input
                                type="file"
                                disabled
                                accept={field.accept || (field.type === "image" ? "image/*" : undefined)}
                                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-medium file:text-muted opacity-60"
                              />
                            ) : (
                              <input
                                type={field.type === "phone" ? "tel" : field.type}
                                placeholder={field.placeholder}
                                readOnly
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => addPreviewField("text")}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted hover:border-accent/40 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      Add field
                    </button>
                    <button disabled className="mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white opacity-60">
                      Submit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[70vh] items-center justify-center text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-surface">
                      <Plus className="h-7 w-7 text-muted" />
                    </div>
                    <p className="mb-1 text-sm font-medium text-foreground">Start with a blank form or an AI preset</p>
                    <p className="text-xs text-muted">Once a form exists, every field becomes editable right on the canvas.</p>
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="w-[330px] shrink-0 overflow-y-auto border-l border-border bg-surface">
            <div className="sticky top-0 border-b border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-foreground">Inspector</h2>
              <p className="mt-1 text-xs text-muted">
                {selectedField ? "Fine-tune the selected field." : "Select a field on the canvas."}
              </p>
            </div>

            {selectedField ? (
              <div className="space-y-4 p-4">
                <label className="block text-xs font-medium text-muted">
                  Label
                  <input
                    value={selectedField.label}
                    onChange={(e) => updatePreviewField(selectedField.id, { label: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Field ID
                  <input
                    value={selectedField.id}
                    onChange={(e) => updatePreviewField(selectedField.id, { id: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent"
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Type
                  <select
                    value={selectedField.type}
                    onChange={(e) => {
                      const next = fieldDefaults(e.target.value);
                      updatePreviewField(selectedField.id, {
                        type: e.target.value,
                        options: next.options,
                        min: next.min,
                        max: next.max,
                        step: next.step,
                        accept: next.accept,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  >
                    {AVAILABLE_TYPES.map((type) => (
                      <option key={type.type} value={type.type}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Placeholder
                  <input
                    value={selectedField.placeholder || ""}
                    onChange={(e) => updatePreviewField(selectedField.id, { placeholder: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedField.required}
                    onChange={(e) => updatePreviewField(selectedField.id, { required: e.target.checked })}
                    className="h-4 w-4 accent-accent"
                  />
                  Required
                </label>

                {["select", "radio", "checkbox", "likert"].includes(selectedField.type) && (
                  <label className="block text-xs font-medium text-muted">
                    Options
                    <textarea
                      value={(selectedField.options || []).join("\n")}
                      onChange={(e) => updateOptions(selectedField, e.target.value)}
                      rows={6}
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                    />
                  </label>
                )}

                {["scale", "rating"].includes(selectedField.type) && (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedField.type === "scale" && (
                      <label className="block text-xs font-medium text-muted">
                        Min
                        <input
                          type="number"
                          value={selectedField.min ?? 0}
                          onChange={(e) => updatePreviewField(selectedField.id, { min: Number(e.target.value) })}
                          className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                        />
                      </label>
                    )}
                    <label className="block text-xs font-medium text-muted">
                      Max
                      <input
                        type="number"
                        value={selectedField.max ?? (selectedField.type === "rating" ? 5 : 10)}
                        onChange={(e) => updatePreviewField(selectedField.id, { max: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                      />
                    </label>
                    {selectedField.type === "scale" && (
                      <label className="block text-xs font-medium text-muted">
                        Unit
                        <input
                          value={selectedField.unit || ""}
                          onChange={(e) => updatePreviewField(selectedField.id, { unit: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                        />
                      </label>
                    )}
                  </div>
                )}

                {(selectedField.type === "file" || selectedField.type === "image") && (
                  <label className="block text-xs font-medium text-muted">
                    Accept
                    <input
                      value={selectedField.accept || ""}
                      onChange={(e) => updatePreviewField(selectedField.id, { accept: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                      placeholder="image/*, application/pdf"
                    />
                  </label>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => duplicatePreviewField(selectedField)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-muted hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => removePreviewField(selectedField.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs font-medium text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-muted">No field selected.</div>
            )}
          </aside>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-foreground truncate">{form.title}</h3>
                          {/* Big response count pill — always shown so 0-response forms are visible too */}
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                              form._count.responses > 0
                                ? "bg-success/15 text-success"
                                : "bg-surface-2 text-muted border border-border"
                            }`}
                          >
                            {form._count.responses}
                            <span className="font-normal opacity-80">
                              {form._count.responses === 1 ? "response" : "responses"}
                            </span>
                          </span>
                          {form.crmTarget && (
                            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                              → {form.crmTarget}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted truncate mt-1">{form.description}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                          <span title={new Date(form.createdAt).toLocaleString()}>
                            Created {formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}
                          </span>
                          {form.lastResponseAt && (
                            <>
                              <span className="opacity-50">•</span>
                              <span
                                className="text-success/80"
                                title={new Date(form.lastResponseAt).toLocaleString()}
                              >
                                Last submitted {formatDistanceToNow(new Date(form.lastResponseAt), { addSuffix: true })}
                              </span>
                            </>
                          )}
                        </div>
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
