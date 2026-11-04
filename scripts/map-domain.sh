#!/usr/bin/env bash
# Points a custom domain at the Cloud Run service, with a Google-managed HTTPS certificate.
# Safe to rerun: it prints the DNS records and the certificate status each time.
#
# Usage: PROJECT_ID=my-project [REGION=us-central1] [DOMAIN=ttt.code-brew.app] ./scripts/map-domain.sh
#
# The domain (or its parent, e.g. code-brew.app) must first be verified by the account gcloud
# is logged in as: run `gcloud domains verify code-brew.app` and follow the steps.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project ID}"
REGION="${REGION:-us-central1}"
DOMAIN="${DOMAIN:-ttt.code-brew.app}"
SERVICE="tic-tac-toe"

# Verified domains look like "code-brew.app"; a subdomain is covered by its verified parent.
verified="$(gcloud domains list-user-verified --format 'value(id)' 2>/dev/null || true)"
covered=""
for d in $verified; do
  if [[ "$DOMAIN" == "$d" || "$DOMAIN" == *".$d" ]]; then covered="$d"; fi
done
if [[ -z "$covered" ]]; then
  parent="${DOMAIN#*.}"
  echo "The account $(gcloud config get-value account 2>/dev/null) has not verified ${DOMAIN} or ${parent}." >&2
  echo "Run: gcloud domains verify ${parent}" >&2
  echo "Add the TXT record it gives you at your DNS provider, finish verifying, then rerun this script." >&2
  exit 1
fi
echo "==> ${DOMAIN} is covered by verified domain ${covered}"

if gcloud beta run domain-mappings describe --domain "$DOMAIN" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Domain mapping for ${DOMAIN} already exists"
else
  echo "==> Mapping ${DOMAIN} to ${SERVICE}"
  gcloud beta run domain-mappings create --service "$SERVICE" --domain "$DOMAIN" \
    --project "$PROJECT_ID" --region "$REGION" --quiet >/dev/null
fi

echo
echo "==> Add these DNS records at your DNS provider for ${DOMAIN}:"
gcloud beta run domain-mappings describe --domain "$DOMAIN" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format 'table[box](status.resourceRecords.name,status.resourceRecords.type,status.resourceRecords.rrdata)'

echo
echo "==> Certificate status (it can take 15 minutes to a few hours after DNS is in place):"
gcloud beta run domain-mappings describe --domain "$DOMAIN" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format 'table(status.conditions.type,status.conditions.status,status.conditions.message)'
