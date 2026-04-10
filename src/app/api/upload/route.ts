import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

// 25 MB upload cap. Larger files should go through a proper object store
// (S3/MinIO/etc.) — this lives on local disk so we keep it modest.
const MAX_BYTES = 25 * 1024 * 1024;

// Files land in /app/public/uploads inside the container, which is bind-mounted
// to /etc/easypanel/projects/abc/formss/uploads on the host so they survive
// container restarts AND get included in the nightly backup script.
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
// Files are served via the dynamic /api/uploads/[filename] route — Next.js
// standalone mode does NOT auto-serve files added to /public at runtime, so
// we can't use a plain /uploads/ static URL.
const PUBLIC_PREFIX = "/api/uploads";

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file in 'file' field" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  // Make sure the upload dir exists. The bind-mount creates the dir on the
  // host, but if someone runs the container without the mount this prevents
  // a hard crash and falls back to the in-container path.
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  // Sanitize the original name and prefix with a UUID so collisions are
  // impossible and the original name is preserved for human readability.
  const originalName = (file as File).name || "upload";
  const ext = extname(originalName).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
  const safeBase = originalName
    .replace(ext, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60) || "file";
  const uniqueName = `${randomUUID()}_${safeBase}${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const targetPath = join(UPLOAD_DIR, uniqueName);
  await writeFile(targetPath, buffer);

  // Return a relative URL — the public form sets this as the field value, the
  // admin viewer renders it as a link, and the Twenty CRM sync sends it as a
  // string value (the receiving custom-object field should be a Text or URL).
  const publicUrl = `${PUBLIC_PREFIX}/${uniqueName}`;
  return NextResponse.json({
    url: publicUrl,
    filename: originalName,
    size: file.size,
    mimeType: file.type,
  });
}
