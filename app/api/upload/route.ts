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

  const uploadDir = path.join(process.cwd(), 'public', 'images', 'products');
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
    const filePath = path.join(uploadDir, uniqueName);

    await writeFile(filePath, buffer);
    urls.push(`/images/products/${uniqueName}`);
  }

  return NextResponse.json({ urls });
}
