# Cloud Gallery — Supabase Complete

Connected to the Supabase project configured in `config.js`.

Features:
- Email/password sign up and login
- Password reset
- Private per-user gallery
- Multiple image upload and drag/drop
- Private signed image URLs
- Search and category filter
- Preview, download and delete
- Responsive editorial/gallery UI

Supabase setup already completed:
1. `public.photos` table + RLS policies
2. Private Storage bucket named exactly `photos`

Never add a Supabase Secret/Service Role key to the browser.

For public production use, add resumable uploads, quotas, rate limiting, monitoring, backup/recovery, privacy/terms, account deletion/export, and image validation. Normal browser uploads are used in this starter and may need TUS/resumable uploads for large or unreliable mobile uploads.

Deploy as a static site on Vercel/Netlify or any static host. No Node server is required for this version.
