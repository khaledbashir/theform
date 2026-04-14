import { NextRequest, NextResponse } from "next/server";
import { lookupVenueDetails } from "@/lib/twenty";

/**
 * GET /api/lookups/venue-details?id=<uuid>
 *
 * Returns a venue's address + contact info for auto-filling shipping fields
 * once the user picks a venue from the typeahead.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ venue: null });
  const venue = await lookupVenueDetails(id);
  return NextResponse.json({ venue });
}
