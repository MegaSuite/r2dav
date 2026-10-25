# r2dav

A Cloudflare R2 file manager with WebDAV and signed direct links, built on Cloudflare Pages.

r2dav is an independent project derived from [FlareDrive](https://github.com/longern/FlareDrive). It keeps the original WebDAV endpoint and adds single-file capability links that external clients such as Clash and calendar apps can fetch without Basic Auth.

## Features

- Responsive file manager for desktop, tablet and mobile
- List and grid views, with persistent sorting and view preferences
- Uploads, folder uploads, drag-and-drop, chunked uploads for large files
- Image, video and PDF thumbnails
- WebDAV endpoint for file managers and desktop clients
- Signed direct links for a single file, with permanent or expiring URLs
- Correct MIME types for configs, calendars and other common formats
- Range requests, ETag/304 and CORS on direct links
- Text editor for `.yaml`, `.ics`, `.json`, `.md`, `.toml`, `.conf` and other text files
- Dark mode, keyboard selection and multi-select actions

## Quick start

You need a Cloudflare account, an R2 bucket and a Pages project connected to this repository.

### 1. Create the R2 bucket

Create a bucket in the Cloudflare dashboard, for example `r2dav-files`.

### 2. Create a Pages project

Connect this repository to Cloudflare Pages:

- Framework preset: **None**
- Build command: `npm run build`
- Build output directory: `build`
- Production branch: `main`

### 3. Bind the bucket

In **Pages → your project → Settings → Bindings**, add an R2 bucket binding:

- Variable name: `BUCKET`
- Bucket: the bucket created above

### 4. Configure environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `WEBDAV_USERNAME` | Yes | Username for WebDAV and for creating share links |
| `WEBDAV_PASSWORD` | Yes | Password for WebDAV and for creating share links |
| `SHARE_SECRET` | Recommended | HMAC secret for signed direct links. Generate with `openssl rand -base64 32`. If omitted, a key is derived from `WEBDAV_PASSWORD`; changing the password then invalidates all existing links. |
| `WEBDAV_PUBLIC_READ` | No | Set to `1` to allow unauthenticated `GET`/`HEAD`/`PROPFIND` on the whole `/webdav` endpoint. This makes every file readable, not just shared files. |

After adding or changing variables, redeploy the project.

### 5. Optional: custom domain

Add a custom domain in **Pages → your project → Custom domains**. Direct links use the request origin, so they automatically use the custom domain.

## WebDAV

Use any WebDAV client with:

```text
URL:      https://your-domain.com/webdav
Username: WEBDAV_USERNAME
Password: WEBDAV_PASSWORD
```

The standard WebDAV endpoint is unchanged. Large uploads (≥128MB) may exceed Cloudflare Workers request limits; use the web UI, which supports multipart uploads.

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars   # edit credentials
npm run build
npx wrangler pages dev build --r2 BUCKET
```

The app is then available at `http://localhost:8788`. The local R2 bucket is simulated by Wrangler.

Useful checks:

```bash
npm run typecheck
npm run check:mime
npm run build
```

`npm run gen:mime` regenerates `src/shared/mime-map.ts` and `functions/lib/mime-map.ts` from `mime-db`.

## Limits and notes

- Direct links support single files only; folder sharing/ZIP export is not implemented.
- Signed links are capability URLs; do not post them publicly if the file is sensitive.
- Cloudflare Access must not block `/d/*` if external clients such as Clash or calendar services need to fetch links.
- The internal R2 prefix `_$flaredrive$/` is retained for thumbnail compatibility.
- The UI is currently English-only.

## Security

- Do not commit `.dev.vars` or any secrets.
- Use a long random `SHARE_SECRET` in production.
- `WEBDAV_PUBLIC_READ=1` exposes every file for reading; use it only when that is intended.
- Direct links for active content such as HTML, SVG, XML and JavaScript are served as attachments to reduce same-origin script execution risk.

## Acknowledgments

r2dav is derived from [FlareDrive](https://github.com/longern/FlareDrive) by Siyu Long, and the WebDAV implementation is based on [r2-webdav](https://github.com/abersheeran/r2-webdav) by abersheeran. See [NOTICE](NOTICE).

## License

MIT. See [LICENSE](LICENSE).
