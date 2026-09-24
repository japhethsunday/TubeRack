FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Voices are downloaded at build time (each voice model has its own license; verify before shipping).
ARG PIPER_VOICES="en_US-lessac-medium en_US-ryan-medium en_GB-alba-medium"
RUN mkdir -p /voices && python -m piper.download_voices --download-dir /voices $PIPER_VOICES
COPY app.py .
ENV PIPER_VOICES_DIR=/voices
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
