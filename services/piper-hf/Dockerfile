FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir piper-tts==1.3.0

# Hugging Face Spaces run as user 1000.
RUN useradd -m -u 1000 user
WORKDIR /app

# Voices (baked in so the server starts instantly). Add more from
# https://huggingface.co/rhasspy/piper-voices — the .onnx and .onnx.json.
ARG HF=https://huggingface.co/rhasspy/piper-voices/resolve/main
RUN mkdir -p /app/voices && cd /app/voices \
    && curl -fsSLO $HF/en/en_US/ryan/high/en_US-ryan-high.onnx \
    && curl -fsSLO $HF/en/en_US/ryan/high/en_US-ryan-high.onnx.json \
    && curl -fsSLO $HF/en/en_US/amy/medium/en_US-amy-medium.onnx \
    && curl -fsSLO $HF/en/en_US/amy/medium/en_US-amy-medium.onnx.json \
    && curl -fsSLO $HF/en/en_GB/alan/medium/en_GB-alan-medium.onnx \
    && curl -fsSLO $HF/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json

COPY app.py /app/app.py
RUN chown -R user:user /app
USER user

ENV PORT=7860
EXPOSE 7860
CMD ["python", "/app/app.py"]
