#!/usr/bin/env bash
# Katuvit worker on Cloud Run GPU — idempotent. Prereqs: gcloud auth login; billing enabled on the project.
set -euo pipefail
PROJECT="${PROJECT:-katuvit-6bb08}"
REGION="${REGION:-europe-west1}"          # must be a Cloud Run GPU region
SERVICE="${SERVICE:-katuvit-worker}"
BUCKET="${BUCKET:-katuvit-media-$PROJECT}"
REPO="katuvit"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/worker:latest"
SA_NAME="katuvit-worker"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${KATUVIT_API_KEY:?export KATUVIT_API_KEY first (same key the app uses)}"

gcloud config set project "$PROJECT" >/dev/null
echo "▸ enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  storage.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com >/dev/null

echo "▸ bucket gs://$BUCKET (private, 1-day lifecycle)"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$HERE/lifecycle.json" >/dev/null

echo "▸ artifact registry"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" >/dev/null

echo "▸ build service account (compute default) + roles"
gcloud services enable compute.googleapis.com >/dev/null
PN="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
CSA="$PN-compute@developer.gserviceaccount.com"
for r in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$CSA" --role="$r" --condition=None >/dev/null
done

echo "▸ service account + roles"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="Katuvit worker" >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
# signed URLs without a key file: the SA must be allowed to sign as itself
gcloud iam service-accounts add-iam-policy-binding "$SA" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator >/dev/null

echo "▸ secret"
if gcloud secrets describe katuvit-api-key >/dev/null 2>&1; then
  printf '%s' "$KATUVIT_API_KEY" | gcloud secrets versions add katuvit-api-key --data-file=- >/dev/null
else
  printf '%s' "$KATUVIT_API_KEY" | gcloud secrets create katuvit-api-key --data-file=- >/dev/null
fi
gcloud secrets add-iam-policy-binding katuvit-api-key --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null

if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "▸ SKIP_BUILD=1 — reusing $IMAGE"
else
  echo "▸ building image (Cloud Build, ~10-15 min first time)"
  # global builds: regional Cloud Build needs extra setup on a fresh project
  gcloud builds submit "$HERE/.." --config="$HERE/../cloudbuild.yaml" --substitutions=_IMAGE="$IMAGE"
fi

echo "▸ deploying $SERVICE (L4 GPU)"
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" --region="$REGION" --platform=managed \
  --gpu=1 --gpu-type=nvidia-l4 --no-gpu-zonal-redundancy \
  --cpu=4 --memory=16Gi --concurrency=1 --min-instances=0 --max-instances=1 \
  --timeout=900 --no-cpu-throttling --allow-unauthenticated \
  --service-account="$SA" \
  --set-env-vars="MEDIA_BUCKET=$BUCKET" \
  --set-secrets="KATUVIT_API_KEY=katuvit-api-key:latest"

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo "▸ live at $URL"
curl -s "$URL/health"; echo
