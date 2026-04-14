import { NextRequest, NextResponse } from "next/server";
import { searchVenues } from "@/lib/twenty";

/**
 * GET /api/lookups/venues?q=fenway
 *
 * Typeahead source for the "venue" form-field type. Returns up to 10 hits.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const venues = await searchVenues(q);
  return NextResponse.json({ venues });
}
