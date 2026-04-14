import { NextRequest, NextResponse } from "next/server";
import { assetsAtVenue } from "@/lib/twenty";

/**
 * GET /api/lookups/assets-at-venue?venueId=<uuid>
 *
 * Lists all inventoryAsset records at a venue for the "venue_assets"
 * chip-picker field — Alexis taps to select instead of typing.
 */
export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId") || "";
  const assets = await assetsAtVenue(venueId);
  return NextResponse.json({ assets });
}
