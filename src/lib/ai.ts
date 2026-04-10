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
  type: "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "number" | "date" | "url" | "file" | "image";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  // For file/image: optional MIME filter, e.g. "image/*" or "application/pdf,image/png"
  accept?: string;
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
- **Use "image" when the form needs the user to upload a photo** — damage shots, venue photos, headshots, screenshots, marketing images, before/after pictures, evidence, etc. Set "accept": "image/*".
- **Use "file" when the form needs the user to upload a non-image document** — PDFs, contracts, signed forms, specs, CADs, supporting docs. Set "accept" to a MIME list like "application/pdf" or "application/pdf,application/msword", or omit "accept" to allow any file.
- Add image/file fields any time the form description mentions photos, attachments, uploads, scans, supporting docs, evidence, proof, before/after, contracts, or signed forms.
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
      "type": "text|email|phone|textarea|select|radio|checkbox|number|date|url|file|image",
      "label": "Field Label",
      "placeholder": "Helpful hint...",
      "required": true,
      "options": ["Option 1", "Option 2"],
      "accept": "image/* — only for file/image fields, optional otherwise"
    }
  ]
}`,
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
