import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { responses: { orderBy: { createdAt: "desc" } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(form);
}

/**
 * PATCH — update form config. Mostly used for editing the CRM integration
 * settings (crmTarget, crmFieldMap) after a form is created.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.description !== undefined) allowed.description = body.description;
  if (body.fields !== undefined) allowed.fields = body.fields;
  if (body.published !== undefined) allowed.published = body.published;
  if (body.crmTarget !== undefined) {
    allowed.crmTarget = body.crmTarget === "" ? null : body.crmTarget;
  }
  if (body.crmFieldMap !== undefined) {
    allowed.crmFieldMap = body.crmFieldMap;
  }

  try {
    const form = await prisma.form.update({
      where: { id },
      data: allowed as any,
    });
    return NextResponse.json(form);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.form.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
