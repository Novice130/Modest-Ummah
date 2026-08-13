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

    // Extension is derived from the sniffed MIME type, never from the
    // user-supplied filename.
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}" for "${file.name}". Allowed: jpg, png, webp, avif.` },
        { status: 400 }
      );
    }

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
