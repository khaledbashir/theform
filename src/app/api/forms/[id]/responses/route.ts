import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildTwentyPayload,
  createTwentyRecord,
  isTwentyConfigured,
} from "@/lib/twenty";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();

  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  // 1. Always save to local responses table (audit / CSV export)
  const response = await prisma.response.create({
    data: { formId: id, data },
  });

  // 2. If the form has a CRM target configured, also create a Twenty record
  const crmTarget = (form as any).crmTarget as string | null;
  const crmFieldMap = (form as any).crmFieldMap as Record<string, string> | null;

  let crmResult: Record<string, unknown> | null = null;

  if (crmTarget && isTwentyConfigured()) {
    const payload = buildTwentyPayload(data, crmFieldMap);
    const result = await createTwentyRecord(crmTarget, payload);
    if (result.ok) {
      crmResult = { ok: true, target: crmTarget, recordId: result.id, name: result.name };
    } else {
      // Don't fail the submission — record is saved locally, CRM can be retried
      crmResult = { ok: false, target: crmTarget, error: result.error };
      console.error(`[forms] CRM write failed for form ${id}:`, result.error);
    }
  }

  return NextResponse.json({ ...response, crm: crmResult });
}
