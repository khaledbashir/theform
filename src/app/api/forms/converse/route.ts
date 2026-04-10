import { NextResponse } from "next/server";
import { converseAboutForm, type ConverseMessage, type GeneratedForm } from "@/lib/ai";

// POST /api/forms/converse
//
// Body:
//   {
//     messages: [{role: "user"|"assistant", content: string}, ...],
//     currentForm?: { title, description, fields: [...] }
//   }
//
// Response (one of):
//   {type: "question", message: "..."}
//   {type: "form", title, description, fields}
//
// This is the multi-turn conversational flow used by the "Custom" preset
// (and any subsequent refinement). The frontend keeps the conversation
// history client-side and passes the current draft form on each request.
// The AI either asks one more question or returns a complete updated form.
// The frontend never has to merge — every form response is the full state.

export async function POST(req: Request) {
  let body: { messages?: ConverseMessage[]; currentForm?: GeneratedForm | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  // Validate message shape so a malformed client doesn't blow up the AI call
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return NextResponse.json({ error: "each message must be {role: user|assistant, content: string}" }, { status: 400 });
    }
  }

  try {
    const result = await converseAboutForm(messages, body.currentForm ?? null);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[forms/converse] AI call failed:", e);
    return NextResponse.json({ error: e?.message || "AI call failed" }, { status: 500 });
  }
}
