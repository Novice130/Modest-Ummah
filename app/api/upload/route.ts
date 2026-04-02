import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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

  const uploadDir = path.join(process.cwd(), 'public', 'images', 'products');
  await mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = path.extname(file.name) || '.jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const uniqueName = `${baseName}-${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    await writeFile(filePath, buffer);
    urls.push(`/images/products/${uniqueName}`);
  }

  return NextResponse.json({ urls });
}
