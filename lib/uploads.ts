/**
 * Where uploaded files live.
 *
 * Uploads sit outside public/ so a redeploy never wipes them and the image
 * build cannot shadow them. In production the Dokploy volume mounts at
 * /app/uploads; locally the files land in ./uploads (gitignored).
 *
 * This used to be exported from app/api/upload/route.ts. It moved here because
 * three call sites now need it — the upload route, the media route, and the
 * image-meta resolver — and importing a route module for a plain helper drags
 * the route's handlers along with it.
 */
import path from 'path';

export function getUploadDir(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  if (process.env.NODE_ENV === 'production') return '/app/uploads';
  return path.join(process.cwd(), 'uploads');
}

/**
 * Maps a `/api/media/<name>` URL back to a file inside the upload dir.
 *
 * Returns null for anything else: an absolute http(s) URL, a legacy
 * /images/products/… path, or a traversal attempt. The prefix check mirrors
 * the one in app/api/media/[...path]/route.ts — a stored image URL is not
 * user input today, but it is the sort of value that becomes user input.
 */
export function resolveUploadPath(url: string): string | null {
  const prefix = '/api/media/';
  if (!url.startsWith(prefix)) return null;

  const relative = url.slice(prefix.length);
  if (!relative) return null;

  const uploadDir = path.resolve(getUploadDir());
  const filePath = path.resolve(uploadDir, relative);
  if (!filePath.startsWith(uploadDir + path.sep)) return null;

  return filePath;
}
