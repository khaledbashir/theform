import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

// Next.js standalone mode does NOT auto-serve files added to /public at
// runtime — only files that existed at build time. Uploaded files live at
// /app/public/uploads (bind-mounted from the host) but Next won't serve them
// directly. So we serve them via this API route, which reads from disk and
// streams the bytes back with the right content-type.

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

// Minimal MIME map. Anything unknown falls back to application/octet-stream
// which causes browsers to download instead of inline-render — safer default.
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;

  // Hard reject path traversal. The filename comes from a URL segment so
  // Next.js will already have decoded it, but a malicious encoded ../ can
  // still slip in. basename() strips any directory component, so the result
  // can never escape UPLOAD_DIR.
  const safeName = basename(filename);
  if (!safeName || safeName !== filename) {
    return new NextResponse("Bad filename", { status: 400 });
  }

  const filePath = join(UPLOAD_DIR, safeName);

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }
    const buf = await readFile(filePath);
    const ext = extname(safeName).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        // Browser-cache for an hour. Files have UUID names so they're
        // immutable; we could go further but 1h is conservative-safe.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
