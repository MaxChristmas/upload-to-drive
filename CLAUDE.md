# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Run with --watch (auto-restart on file changes)
node server.js   # Run without watch
```

## Architecture

Single-file Express app (`server.js`) — no build step, no tests, ESM (`"type": "module"`).

**Request flow:**
1. `GET /` → renders the HTML form (`renderForm()`)
2. `POST /upload` → rate-limit middleware → multer file parsing → Cloudinary upload → thank-you page (`renderThankYou()`)

**Key details:**
- HTML is generated inline as template literals in `renderForm()` and `renderThankYou()` — there are no template files
- Rate limiting is in-memory (`dailyCounts` Map, keyed by `IP:date`), resets on server restart
- Images are uploaded to Cloudinary via streaming (`upload_stream`), never written to disk (multer uses `memoryStorage`)
- The `safe()` helper sanitizes user input for use in Cloudinary `public_id` (alphanumeric, hyphens, underscores, spaces→underscores, max 60 chars)
- `CLOUDINARY_FOLDER` and `PORT` are the only env vars (plus Cloudinary SDK auto-reads `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`)
