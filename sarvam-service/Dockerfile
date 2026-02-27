# Sarvam AI Speech-to-Text Service
# Lightweight wrapper around Sarvam's cloud API — no local ML models required

FROM python:3.11-slim

WORKDIR /app

# curl is only needed for the Docker healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 48002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:48002/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "48002"]
