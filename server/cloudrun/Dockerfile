# Build context = server/ (so captions.py is available). See cloudbuild.yaml.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 HF_HOME=/models
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg fonts-noto-core fontconfig curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Hebrew display fonts (Google Fonts, OFL) — family names: Rubik, Heebo, Secular One
RUN mkdir -p /usr/share/fonts/truetype/katuvit && cd /usr/share/fonts/truetype/katuvit \
    && curl -fsSL -o Rubik-Bold.ttf https://github.com/google/fonts/raw/main/ofl/rubik/static/Rubik-Bold.ttf \
    && curl -fsSL -o Rubik-Black.ttf https://github.com/google/fonts/raw/main/ofl/rubik/static/Rubik-Black.ttf \
    && curl -fsSL -o Heebo-Bold.ttf https://github.com/google/fonts/raw/main/ofl/heebo/static/Heebo-Bold.ttf \
    && curl -fsSL -o Heebo-Black.ttf https://github.com/google/fonts/raw/main/ofl/heebo/static/Heebo-Black.ttf \
    && curl -fsSL -o SecularOne-Regular.ttf https://github.com/google/fonts/raw/main/ofl/secularone/SecularOne-Regular.ttf \
    && fc-cache -f && fc-list | grep -iE "rubik|heebo|secular" | wc -l
WORKDIR /app
COPY cloudrun/requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt
# bake the Hebrew model into the image: no 1.6GB download on cold start
RUN python3 -c "from huggingface_hub import snapshot_download; snapshot_download('ivrit-ai/whisper-large-v3-ct2')"
COPY captions.py cloudrun/main.py ./
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
