import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      baseURL: process.env.AI_BASE_URL || "https://api.minimax.io/v1",
      apiKey: process.env.AI_API_KEY,
    });
  }
  return _client;
}

export interface FormField {
  id: string;
  type:
    | "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox"
    | "number" | "date" | "url" | "file" | "image"
    | "scale" | "rating" | "signature" | "time" | "datetime" | "yes_no" | "likert";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  // For file/image/signature: MIME filter (e.g. "image/*", "application/pdf")
  accept?: string;
  // For scale/rating: numeric bounds + step. Defaults: scale 0-100 step 1, rating 1-5 step 1.
  min?: number;
  max?: number;
  step?: number;
  // For scale: optional unit suffix shown next to the value (e.g. "%", "/10")
  unit?: string;
}

export interface GeneratedForm {
  title: string;
  description: string;
  fields: FormField[];
}

export async function generateForm(prompt: string): Promise<GeneratedForm> {
  const completion = await getClient().chat.completions.create({
    model: process.env.AI_MODEL || "MiniMax-M2.7",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a professional form builder. Generate a complete, well-structured form based on the user's description.

IMPORTANT RULES:
- Generate between 5-15 fields depending on complexity
- Always include basic contact fields (name, email) unless explicitly not needed
- Use the most appropriate field type for each piece of data
- Use "select" for lists of 3-7 options, "radio" for 2-4 options
- Use "checkbox" when multiple selections are allowed
- Use "textarea" for open-ended responses
- Use specific types: "email" for emails, "phone" for phones, "date" for dates, "number" for numbers, "url" for websites
- **Use "image"** when the form needs the user to upload a photo — damage shots, venue photos, headshots, screenshots, marketing images, before/after pictures, evidence. Set "accept": "image/*".
- **Use "file"** when the form needs the user to upload a non-image document — PDFs, contracts, signed forms, specs, CADs. Set "accept" to a MIME list (e.g. "application/pdf") or omit to allow any file.
- **Use "scale"** for any 1-N severity, urgency, satisfaction, or "how much" question. Set min, max, step (e.g. min:1, max:10, step:1) and an optional "unit" (e.g. "%" or "/10"). Examples: severity 1-10, percent complete 0-100, satisfaction 1-5.
- **Use "rating"** for star-rated quality questions (service quality, support, satisfaction). Defaults to 1-5 stars; pass max:10 for ten-star.
- **Use "signature"** when the form needs a handwritten signature — inspector sign-offs, walkthrough approvals, delivery acceptance, contract sign-offs. The user draws on a canvas; the result is uploaded as a PNG.
- **Use "time"** for time-of-day input (e.g. "what time did this happen") — HH:MM. Pair with a "date" field if you need both.
- **Use "datetime"** when a single field should capture date AND time together (e.g. event start, deployment time).
- **Use "yes_no"** for a single yes/no question (cleaner than a one-option checkbox). Examples: "is this a rush?", "approved?", "site visit complete?".
- **Use "likert"** for survey-style agreement questions ("how much do you agree with..."). Renders as a 5-button scale: Strongly disagree → Strongly agree.
- Add image/file fields any time the form description mentions photos, attachments, uploads, scans, supporting docs, evidence, proof, before/after, contracts, or signed forms.
- Add a signature field any time the form mentions sign-off, signed, approve, accept, acknowledge, or "by signing".
- Make fields required when they're essential info, optional for nice-to-haves
- Write clear, professional labels and helpful placeholders
- Generate unique lowercase snake_case IDs for each field

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "Professional form title",
  "description": "One line explaining the form's purpose",
  "fields": [
    {
      "id": "field_id",
      "type": "text|email|phone|textarea|select|radio|checkbox|number|date|url|file|image|scale|rating|signature|time|datetime|yes_no|likert",
      "label": "Field Label",
      "placeholder": "Helpful hint...",
      "required": true,
      "options": ["Option 1", "Option 2"],
      "accept": "image/* (file/image/signature only, optional)",
      "min": 1,
      "max": 10,
      "step": 1,
      "unit": "%"
    }
  ]
}

Only include "options" for select/radio/checkbox/likert.
Only include "accept" for file/image/signature.
Only include "min"/"max"/"step"/"unit" for scale/rating.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate form");
  return JSON.parse(jsonMatch[0]);
}

// ────────────────────────────────────────────────────────────────────────────
// Conversational mode — multi-turn form building
// ────────────────────────────────────────────────────────────────────────────
//
// The user picks the "Custom" preset and the AI guides them through creation
// instead of one-shotting from a single prompt. Each turn the AI either asks
// a clarifying question or returns a complete form. If a draft form already
// exists, the AI can iterate on it (move/edit/remove/add fields) on user
// command. Iterations always return a COMPLETE updated form, not a diff —
// makes the frontend trivial.

export type ConverseMessage = { role: "user" | "assistant"; content: string };

export type ConverseResponse =
  | { type: "question"; message: string }
  | { type: "form"; title: string; description: string; fields: FormField[] };

const FIELD_TYPE_RULES = `
- Use "select" for lists of 3-7 options, "radio" for 2-4 options
- Use "checkbox" for multi-select
- Use "textarea" for open-ended responses
- Use "email", "phone", "date", "number", "url" for specific data
- Use "image" for photo uploads, "file" for documents (set "accept" appropriately)
- Use "scale" for severity/urgency/percent (1-10, 0-100, etc) — set min, max, step, optional unit
- Use "rating" for star ratings (default 1-5; pass max for ten-star)
- Use "signature" when the form needs a handwritten sign-off
- Use "time" for HH:MM, "datetime" for date+time together
- Use "yes_no" for single boolean questions
- Use "likert" for survey-style agreement scales (5 buttons)
`;

export async function converseAboutForm(
  messages: ConverseMessage[],
  currentForm: GeneratedForm | null
): Promise<ConverseResponse> {
  const systemContent = `You are an interactive form-building assistant for ANC Sports operations. Your job is to help the user create or refine the perfect form for their workflow.

You have TWO response modes — pick one per turn:

1. ASK A QUESTION when you don't have enough information to build a complete form yet, OR when the user is ambiguous about a refinement. Output:
   {"type": "question", "message": "your one-line question"}

2. GENERATE OR UPDATE THE FORM when you have enough info, or when the user explicitly says "go", "build it", "create", "that's enough", "looks good", etc., or when they're refining an existing draft. Output:
   {"type": "form", "title": "...", "description": "...", "fields": [...]}

RULES:
- Output VALID JSON only. No markdown, no code fences, no extra text.
- Ask ONE focused question at a time. Be brief, conversational, and direct.
- Never ask more than one question in a row without progressing — if the user gave you something useful, move forward.
- When iterating on an existing form, return the COMPLETE updated form (preserve unchanged fields exactly, apply the user's change).
- Field IDs must be lowercase snake_case and stable across iterations (don't rename fields unless asked).
- Always include basic contact fields (name + email) unless the user explicitly says no.
- Aim for 5-12 fields unless the user wants more or fewer.

FIELD TYPES AVAILABLE:
${FIELD_TYPE_RULES}

ITERATION COMMANDS to recognize:
- "move X to top/bottom" → reorder fields
- "remove X" / "delete X" → drop a field
- "add a Y for Z" → append a new field
- "make X required/optional" → toggle required
- "change X to a Y" → change a field's type
- "rename X to Y" → change a field's label

${currentForm ? `CURRENT DRAFT FORM (the user is iterating on this):
${JSON.stringify(currentForm, null, 2)}

Apply their refinement and return the complete updated form.` : "No draft form exists yet — you're starting fresh."}`;

  const completion = await getClient().chat.completions.create({
    model: process.env.AI_MODEL || "MiniMax-M2.7",
    max_tokens: 4096,
    messages: [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const text = completion.choices[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // If the model breaks the contract and returns prose, treat it as a
    // question so the conversation can continue rather than crashing.
    return { type: "question", message: text || "Could you tell me a bit more about what the form should do?" };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { type: "question", message: "Sorry, I got confused there. Can you describe it again?" };
  }
  if (parsed.type === "question" && typeof parsed.message === "string") {
    return { type: "question", message: parsed.message };
  }
  if (parsed.type === "form" && Array.isArray(parsed.fields)) {
    return {
      type: "form",
      title: String(parsed.title || "Untitled"),
      description: String(parsed.description || ""),
      fields: parsed.fields,
    };
  }
  // Unrecognised shape — bounce back to a question
  return { type: "question", message: "Hmm, I need a bit more detail. What's the form for?" };
}
