"""
TubeRack video server on Modal: open-source LTX-Video (Lightricks) on a
rented GPU that only runs while a clip is being made.

  POST /generate  {prompt, image?, width?, height?, seconds?}  -> {id}
  GET  /result?id=...                                          -> 202 while working, video/mp4 when done
  GET  /health

Every call needs "Authorization: Bearer $VIDEO_TOKEN" (Modal secret "tuberack-video").
Deploy: modal deploy services/video-modal/app.py
"""
import base64
import io
import os

import modal

MODEL = "Lightricks/LTX-Video-0.9.7-distilled"
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.5.1",
        "diffusers==0.33.1",
        "transformers==4.51.3",
        "accelerate==1.6.0",
        "sentencepiece",
        "imageio[ffmpeg]",
        "pillow",
        "fastapi[standard]",
    )
    .env({"HF_HOME": "/models"})
)
app = modal.App("tuberack-video", image=image)
weights = modal.Volume.from_name("tuberack-video-weights", create_if_missing=True)
secret = modal.Secret.from_name("tuberack-video")

NEGATIVE = "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text"


@app.cls(gpu="L4", volumes={"/models": weights}, timeout=600, scaledown_window=60, max_containers=2)
class Generator:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import LTXConditionPipeline

        self.pipe = LTXConditionPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to("cuda")
        weights.commit()

    @modal.method()
    def run(self, prompt: str, image_b64: str | None, width: int, height: int, seconds: float) -> bytes:
        import tempfile

        from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
        from diffusers.utils import export_to_video
        from PIL import Image

        # LTX wants sizes divisible by 32 and 8k+1 frames at 24 fps.
        width, height = (max(256, min(1216, width)) // 32) * 32, (max(256, min(1216, height)) // 32) * 32
        frames = int(max(1.0, min(8.0, seconds)) * 24) // 8 * 8 + 1
        kwargs = {}
        if image_b64:
            img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB").resize((width, height))
            kwargs["conditions"] = [LTXVideoCondition(image=img, frame_index=0)]
        video = self.pipe(
            prompt=prompt,
            negative_prompt=NEGATIVE,
            width=width,
            height=height,
            num_frames=frames,
            num_inference_steps=8,
            guidance_scale=1.0,
            decode_timestep=0.05,
            decode_noise_scale=0.025,
            **kwargs,
        ).frames[0]
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            export_to_video(video, f.name, fps=24)
            return open(f.name, "rb").read()


@app.function(secrets=[secret], image=image)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Header, HTTPException, Request, Response

    web = FastAPI()

    def check(auth: str | None):
        token = os.environ.get("VIDEO_TOKEN", "")
        if not token or auth != f"Bearer {token}":
            raise HTTPException(401, "unauthorized")

    @web.get("/health")
    def health():
        return {"ok": True, "model": MODEL}

    @web.post("/generate")
    async def generate(req: Request, authorization: str | None = Header(None)):
        check(authorization)
        body = await req.json()
        prompt = str(body.get("prompt", "")).strip()[:1500]
        if len(prompt) < 3:
            raise HTTPException(400, "prompt required")
        image_b64 = body.get("image")
        if isinstance(image_b64, str) and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        if image_b64 and len(image_b64) > 12_000_000:
            raise HTTPException(413, "image too large")
        call = Generator().run.spawn(
            prompt, image_b64 or None, int(body.get("width", 768)), int(body.get("height", 512)), float(body.get("seconds", 5))
        )
        return {"id": call.object_id}

    @web.get("/result")
    def result(id: str, authorization: str | None = Header(None)):
        check(authorization)
        try:
            call = modal.FunctionCall.from_id(id)
            data = call.get(timeout=0)
        except TimeoutError:
            return Response(status_code=202)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"generation failed: {str(e)[:200]}")
        return Response(content=data, media_type="video/mp4")

    return web
