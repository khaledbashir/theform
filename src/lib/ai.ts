import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL || "https://api.minimax.io/v1",
  apiKey: process.env.AI_API_KEY,
});

export interface FormField {
  id: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "number" | "date" | "url";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // for select, radio, checkbox
}

export interface GeneratedForm {
  title: string;
  description: string;
  fields: FormField[];
}

export async function generateForm(prompt: string): Promise<GeneratedForm> {
  const completion = await client.chat.completions.create({
    model: process.env.AI_MODEL || "MiniMax-M2.7",
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are a form builder AI. Based on the user's description, generate a form as JSON.

Return ONLY valid JSON with this structure:
{
  "title": "Form title",
  "description": "Brief description of the form",
  "fields": [
    {
      "id": "unique_field_id",
      "type": "text|email|phone|textarea|select|radio|checkbox|number|date|url",
      "label": "Field label",
      "placeholder": "Placeholder text",
      "required": true/false,
      "options": ["option1", "option2"] // only for select, radio, checkbox types
    }
  ]
}

Make the form professional and comprehensive but not overwhelming. Use appropriate field types.`,
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
