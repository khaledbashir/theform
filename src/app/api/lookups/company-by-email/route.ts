import { NextRequest, NextResponse } from "next/server";
import { lookupCompanyByEmail } from "@/lib/twenty";

/**
 * GET /api/lookups/company-by-email?email=matt@mlb.com
 *
 * Public endpoint. Returns the matching Twenty company or null when we
 * don't have a confident match. Form fields (type "email" with
 * autoFillClientTarget) call this on blur.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") || "";
  if (!email) return NextResponse.json({ match: null });
  const match = await lookupCompanyByEmail(email);
  return NextResponse.json({ match });
}
