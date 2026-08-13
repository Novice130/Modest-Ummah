import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

// Sniffs the actual MIME type from magic bytes. The client-supplied
// Content-Type / file.type header is never trusted for the extension.
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(buf.subarray(8, 12).toString('ascii'))
  ) {
    return 'image/avif';
  }
  return null;
}

/**
 * Uploads live outside public/ so a redeploy never wipes them and the image
 * build cannot shadow them. In production the Dokploy volume mounts at
 * /app/uploads; locally the files land in ./uploads (gitignored).
 * The local path is statically scoped to the uploads subfolder so
 * Turbopack does not trace the whole project.
 */
export function getUploadDir(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  if (process.env.NODE_ENV === 'production') return '/app/uploads';
  return path.join(process.cwd(), 'uploads');
}

export async function POST(request: NextRequest) {
  // Admin-only endpoint
  const auth = await getAuthFromRequest(request, true);
  if (!auth || auth.type !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files. Maximum is ${MAX_FILES} per request.` },
      { status: 400 }
    );
  }

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds the 5 MB limit.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extension derived from sniffed magic bytes, never from the
    // user-supplied filename or the untrusted file.type header.
    const sniffed = sniffImageType(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { error: `Unsupported file type for "${file.name}". Allowed: jpg, png, webp, avif.` },
        { status: 400 }
      );
    }
    const ext = ALLOWED_TYPES[sniffed];

    // Random filename — Date.now() collides on multi-file uploads in the
    // same millisecond.
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, uniqueName);

    await writeFile(filePath, buffer);
    // Served by app/api/media/[...path]/route.ts — outside public/.
    urls.push(`/api/media/${uniqueName}`);
  }

  return NextResponse.json({ urls });
}
