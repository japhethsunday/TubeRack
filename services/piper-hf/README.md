---
title: TubeRack Voice
emoji: 🎙️
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# TubeRack voice server (Piper)

Free, self-hosted text-to-speech for TubeRack — the last voice backup when
the cloud voices are out of quota.

- `GET /health` → voices available
- `POST /synthesize` with `Authorization: Bearer <PIPER_TOKEN>` and
  `{"text": "...", "voice": "en_US-ryan-high"}` → `audio/wav`

Set `PIPER_TOKEN` under **Settings → Variables and secrets → New secret**.
Voices: `en_US-ryan-high` (default, male), `en_US-amy-medium` (female),
`en_GB-alan-medium` (British male).
