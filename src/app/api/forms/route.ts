import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateForm } from "@/lib/ai";

export async function GET() {
  // Pull each form with its response count + the most recent response's
  // timestamp so the dashboard can show "last submitted Xh ago" without
  // a second round-trip.
  const forms = await prisma.form.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { responses: true } },
      responses: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      },
    },
  });

  // Flatten the responses array into a single lastResponseAt field. Strip
  // the array itself so we don't ship a one-element list across the wire.
  const shaped = forms.map((f: any) => ({
    ...f,
    lastResponseAt: f.responses[0]?.createdAt ?? null,
    responses: undefined,
  }));

  return NextResponse.json(shaped);
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
