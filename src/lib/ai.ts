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
