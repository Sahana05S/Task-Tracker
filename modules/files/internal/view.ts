import 'server-only';

import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { DriveError, openFile } from './google';
import { isFileBucket } from './rules';

/**
 * GET handler for `/api/files?b=<bucket>&p=<path>`: opens one stored file
 * after `file_access` confirms the signed-in member may see it (migration
 * 100). A file already in the Shared Drive is streamed from Drive; one not
 * moved yet is served from Supabase storage through a one-minute link.
 * PRIVATE (the route calls it through the module's index).
 */
export async function handleFileView(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const bucket = params.get('b') ?? '', path = params.get('p') ?? '';
  if (!isFileBucket(bucket) || !path || path.length > 300) return NextResponse.json({ error: 'Unknown file.' }, { status: 400 });
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return NextResponse.json({ error: 'Sign in to open this file.' }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('file_access', { p_bucket: bucket, p_path: path });
  if (error) {
    if (isMissingFunctionError(error)) return NextResponse.json({ error: 'File storage needs the latest database update (migration 100).' }, { status: 503 });
    if (error.code === '42501') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: 'The file could not be opened. Try again shortly.' }, { status: 503 });
  }
  const access = data as unknown as { fileName: string; mimeType: string; driveFileId: string | null };

  if (!access.driveFileId) {
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (!signed?.signedUrl) return NextResponse.json({ error: 'The file could not be opened. Try again shortly.' }, { status: 503 });
    return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const file = await openFile(access.driveFileId);
    const name = access.fileName.replace(/[\r\n"]/g, ' ');
    return new Response(file.body, {
      headers: {
        'Content-Type': access.mimeType,
        'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
        // Chrome's PDF viewer does not render under a sandbox policy; other types never run scripts.
        ...(access.mimeType === 'application/pdf' ? {} : { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" }),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (cause) {
    console.error('Drive file view failed', cause instanceof DriveError ? cause.message : cause);
    return NextResponse.json({ error: 'Google Drive did not return the file. Try again shortly.' }, { status: 502 });
  }
}
