import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FormField } from "@/lib/ai";

// POST /api/forms/from-converse
//
// Save a form that was built via the conversational AI flow. Unlike
// POST /api/forms (which calls the AI to generate the form from a prompt),
// this endpoint takes a pre-built form payload directly — the conversation
// already shaped it on the converse endpoint.
//
// Body:
//   {
//     title: string,
//     description: string,
//     fields: FormField[],
//     crmTarget?: string | null,
//     crmFieldMap?: Record<string,string> | null
//   }
//
// Returns the created Prisma Form record.

interface Body {
  title?: unknown;
  description?: unknown;
  fields?: unknown;
  crmTarget?: unknown;
  crmFieldMap?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!Array.isArray(body.fields) || body.fields.length === 0) {
    return NextResponse.json({ error: "fields array required" }, { status: 400 });
  }

  const data: any = {
    title: body.title,
    description: typeof body.description === "string" ? body.description : "",
    fields: body.fields as unknown as FormField[],
  };
  if (typeof body.crmTarget === "string" && body.crmTarget) data.crmTarget = body.crmTarget;
  if (body.crmFieldMap && typeof body.crmFieldMap === "object") data.crmFieldMap = body.crmFieldMap;

  const form = await prisma.form.create({ data });
  return NextResponse.json(form);
}
