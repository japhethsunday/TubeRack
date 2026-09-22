# Open-source license audit

Verified September 2026 against each project's license file / repository
metadata. Rule applied throughout: nothing is integrated merely because a
GitHub page says "open source" — the license text decides.

| Project | Repository | License | Commercial SaaS compatible | What we use | What we do NOT use | Required attribution / notices | Deployment implications | Decision |
|---|---|---|---|---|---|---|---|---|
| OpenMontage | Netsoro/openmontage (fork of calesthio/OpenMontage) | AGPL-3.0 | **No** — network copyleft would force our backend open | Concepts only: pipeline manifests, scored provider selection, approval gates, budget governance, decision audit trail | No code, no skills, no tools | N/A (no code taken) | None | **Reference only** |
| Vanta | itsjwill/vanta | MIT (+ per-model third-party licenses; Remotion company-license note for 4+ for-profit teams — we do not use Remotion) | Yes for Vanta's own code; each integrated model audited separately | Its vetted integration findings (see below) | The aggregator itself (would duplicate our architecture) | MIT notice if code taken (none taken) | None | **Reference only** |
| Rendiv | thecodacus/rendiv | Apache-2.0 | Yes | Rendering abstraction + HTTP adapter to a self-hosted renderer; composition stays ours | Its Studio/editor/player UI, npm runtime deps | Apache-2.0 + NOTICE handling if code vendored (none vendored) | Self-hosted Node + Chromium + FFmpeg runner; not Vercel-serverless | **Adapter** |
| VideoFlow (ybouane upstream) | ybouane/VideoFlow | Apache-2.0 | Yes | VideoJSON discipline: our composition export stays portable JSON (already true — tracks/clips/canvas) | The framework, renderers, React editor (dual-license) | None taken | None | **Reference only** (createdbyharsh fork: 0 stars, ignored) |
| OpenCut | OpenCut-app/OpenCut | MIT | Yes | Timeline/editor UX patterns as design reference | The application, components, state model | MIT notice if code taken (none taken) | None | **Reference only** |
| FFmpeg | FFmpeg/FFmpeg | LGPL-2.1+/GPL (binary) | Yes via binary use | Shell-out adapter (`ffmpeg`/`ffprobe`); no linked code | No source vendored, no libav* linking | None for binary use | Binary must exist on the runner (`FFMPEG_PATH`); absent on Vercel → disabled state | **Integrate now (adapter)** |
| WhisperX | m-bain/whisperX | BSD-2-Clause | Yes | HTTP service adapter; keep copyright notice in docs | No vendored code | BSD notice + disclaimer reproduced below | GPU docker (`WHISPERX_URL`); CPU possible but slow; off by default | **Adapter** |
| Piper | OHF-Voice/piper1-gpl | GPL-3.0 (engine); voice models carry their own licenses (verify per voice) | Yes **as a separate process** (no linking; aggregate, not derivative) | HTTP sidecar adapter (`PIPER_URL`); CPU-friendly | No vendored/linked code | None for sidecar use; per-voice model licenses must be checked before shipping a voice | Self-hosted binary/docker; CPU OK; off by default. Note: project seeks maintainers | **Adapter** |
| ComfyUI | comfyanonymous/ComfyUI | GPL-3.0 | Yes **as a separate process** (HTTP API, no linking) | Workflow-based image adapter (`COMFYUI_URL`) | No vendored code, no raw graph UI | None for API use; checkpoint/model licenses checked per model | GPU required for practical use; off by default | **Adapter** |
| ACE-Step | ace-step/ACE-Step | Apache-2.0 | Yes | HTTP music adapter (`ACE_STEP_URL`) | No vendored code | Apache-2.0 notices if vendored (none vendored) | GPU required for practical use; off by default | **Adapter** |

## Vanta's vetted findings we adopt (verified via Vanta's own audit notes)

- Transcription: WhisperX (BSD-2), faster-whisper (MIT), whisper.cpp (MIT),
  sherpa-onnx (Apache-2.0) are commercial-safe. Our adapter targets the
  WhisperX-compatible HTTP shape; faster-whisper/whisper.cpp/sherpa-onnx
  can sit behind the same `TranscriptionProvider` contract later.
- TTS/voice cloning: GPT-SoVITS (MIT), VoxCPM (Apache-2.0), Chatterbox
  (MIT), F5-TTS (MIT), kokoro-js (Apache-2.0), OpenVoice (MIT) are
  commercial-safe future `TtsProvider` candidates.
- Image/video diffusion: FramePack (Apache-2.0), Wan 2.x / LTX-Video
  (Apache-2.0) are commercial-safe future `VideoProvider` candidates
  behind GPU infrastructure we do not currently have.
- REJECTED everywhere: SadTalker (abandoned 2024), Wav2Lip
  (non-commercial — README prohibition), V-Express (research-only
  checkpoints). Talking-head/avatar generation is out of scope until a
  commercial-safe, maintained option is deployed.

## BSD-2-Clause notice (WhisperX, Max Bain 2024)

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that: (1) source redistributions
retain the copyright notice, conditions, and disclaimer; (2) binary
redistributions reproduce them in documentation. (No WhisperX code is
vendored; the notice is recorded here for the service-integration case.)

## GPL position (Piper, ComfyUI)

Both are used exclusively as separate processes over HTTP. Our code does
not link, import, or derive from their code, so no copyleft obligations
attach to TubeRack. If either were ever vendored or linked, this decision
must be revisited. ComfyUI checkpoint/diffusion models and Piper voice
models each carry their own licenses — verify per model before use.
