import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateForm } from "@/lib/ai";

export async function GET() {
  const forms = await prisma.form.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });
  return NextResponse.json(forms);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, crmTarget, crmFieldMap } = body;

  const generated = await generateForm(prompt);

  const form = await prisma.form.create({
    data: {
      title: generated.title,
      description: generated.description,
      fields: generated.fields as any,
      // Optional: presets pass a Twenty CRM target so submissions auto-route
      ...(crmTarget ? { crmTarget } : {}),
      ...(crmFieldMap ? { crmFieldMap } : {}),
    } as any,
  });

  return NextResponse.json(form);
}
