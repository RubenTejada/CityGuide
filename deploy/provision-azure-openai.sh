#!/usr/bin/env bash
# Azure OpenAI para el agente CityGuide (Central US, mismo recurso en dev y producción).
# Idempotente; ya ejecutado el 2026-09-01 salvo la asignación de rol (requiere permisos RBAC).
set -euo pipefail

RG=cityguide-rg
LOCATION=centralus
ACCOUNT=cityguide-openai
DEPLOYMENT=gpt-4.1-mini

az group create -n "$RG" -l "$LOCATION" -o none

az cognitiveservices account create -n "$ACCOUNT" -g "$RG" -l "$LOCATION" \
  --kind OpenAI --sku S0 --custom-domain "$ACCOUNT" -o none

az cognitiveservices account deployment create -n "$ACCOUNT" -g "$RG" \
  --deployment-name "$DEPLOYMENT" --model-name gpt-4.1-mini --model-version 2025-04-14 \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 50 -o none

# Auth sin claves (DefaultAzureCredential): el usuario del Azure CLI en desarrollo
# necesita este rol de data-plane sobre la cuenta. PENDIENTE — ejecutar manualmente:
ACCOUNT_ID=$(az cognitiveservices account show -n "$ACCOUNT" -g "$RG" --query id -o tsv)
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Cognitive Services OpenAI User" \
  --scope "$ACCOUNT_ID"

echo "Endpoint: $(az cognitiveservices account show -n "$ACCOUNT" -g "$RG" --query properties.endpoint -o tsv)"
