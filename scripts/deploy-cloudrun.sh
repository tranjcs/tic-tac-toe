#!/usr/bin/env bash
# Builds the image with Cloud Build, pushes it to Artifact Registry and deploys it to Cloud Run.
#
# Usage: PROJECT_ID=my-project [REGION=us-central1] ./scripts/deploy-cloudrun.sh
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project ID}"
REGION="${REGION:-us-central1}"
SERVICE="tic-tac-toe"
REPOSITORY="tic-tac-toe"

cd "$(dirname "$0")/.."

TAG="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  TAG="${TAG}-dirty-$(date +%s)"
fi
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/app:${TAG}"

echo "==> Enabling required APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  --project "$PROJECT_ID"

if ! gcloud artifacts repositories describe "$REPOSITORY" \
    --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  echo "==> Creating Artifact Registry repository ${REPOSITORY}"
  gcloud artifacts repositories create "$REPOSITORY" \
    --project "$PROJECT_ID" --location "$REGION" --repository-format docker \
    --description "Tic-tac-toe images"
fi

echo "==> Building ${IMAGE}"
gcloud builds submit --project "$PROJECT_ID" --region "$REGION" --tag "$IMAGE" .

# All game state is in memory, so exactly one instance must run (--max-instances=1).
# Fractional CPU forces concurrency=1 on Cloud Run, so 1 vCPU is the minimum that works.
echo "==> Deploying ${SERVICE}"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 1000 \
  --timeout 3600

echo "==> Done"
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --format 'value(status.url)'
