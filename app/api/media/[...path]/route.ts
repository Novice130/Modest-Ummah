import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { getUploadDir } from '@/app/api/upload/route';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

// Uploaded files get random UUID names; they are immutable once written, so
// this is safe. Seeded legacy images keep living under /images/products/ and
// never hit this route.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const uploadDir = path.resolve(getUploadDir());
  const relative = segments.join('/');
  const filePath = path.resolve(uploadDir, relative);

  // Reject any path that escapes the upload dir (../, absolute segments,
  // symlinks resolved away from it are covered by the prefix check).
  if (filePath !== uploadDir && !filePath.startsWith(uploadDir + path.sep)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!fileStats.isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = await readFile(filePath);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileStats.size),
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
