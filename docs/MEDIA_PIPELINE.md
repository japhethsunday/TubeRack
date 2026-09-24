# Media pipeline

```
Script → Gemini narration → stored WAV → Gemini transcription → timed captions → Timeline
Prompt → Gemini image → stored PNG → Asset → Scene → Timeline
Uploads → signed upload URL → private bucket → Asset
Timeline → live browser preview; render request saved with exact settings
```

- Storage: private Supabase bucket `media`; keys built server-side under
  `<workspaceId>/generated/…` and `<workspaceId>/uploads/…`; browsers get
  app URLs that check the session and redirect to 1-hour signed URLs.
- Generated and uploaded files are media assets with source
  `provider-output`, so library, approvals, scenes, preview, and sync treat
  them like any other asset.
- Captions: `/api/v1/ai/transcribe` reads the voice file from the caller's
  own workspace only (≤ 18 MB), Gemini returns timed segments, and
  `captionsFromSegments()` places them at the clip's position.
- Music and SFX: on-device synthesized beds, or uploaded licensed tracks.
- Final MP4 rendering: not available (no hosted rendering API is wired);
  the Video Studio saves the exact render request and the live preview
  plays the full composition.
