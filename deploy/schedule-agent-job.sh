#!/usr/bin/env bash
# Programa el agente CityGuide como Azure Container Apps Job con cron diario.
# Ejecutar CUANDO el CMS esté publicado en Azure (el agente necesita alcanzar
# la Management API de Umbraco). Requiere: az containerapp extension, un ACR.
set -euo pipefail

RG=cityguide-rg
LOCATION=centralus
ACR=${ACR:?"export ACR=<nombre-registro>.azurecr.io"}
UMBRACO_URL=${UMBRACO_URL:?"export UMBRACO_URL=https://<cms>.azurewebsites.net"}
UMBRACO_CLIENT_SECRET=${UMBRACO_CLIENT_SECRET:?"export UMBRACO_CLIENT_SECRET=<secreto-api-user>"}
GOOGLE_API_KEY=${GOOGLE_API_KEY:-""}
ENV_NAME=cityguide-env
JOB_NAME=cityguide-agent

# 1. Imagen
az acr build -r "${ACR%%.*}" -t cityguide-agent:latest -f CityGuide.Agent/Dockerfile .

# 2. Entorno de Container Apps (una vez)
az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" -o none || true

# 3. Job diario. Cron en UTC: 10:00 UTC = 6:00 AM en Santo Domingo (AST, UTC-4).
az containerapp job create -n "$JOB_NAME" -g "$RG" --environment "$ENV_NAME" \
  --trigger-type Schedule --cron-expression "0 10 * * *" \
  --replica-timeout 3600 --replica-retry-limit 1 --parallelism 1 \
  --image "$ACR/cityguide-agent:latest" --cpu 0.5 --memory 1Gi \
  --registry-server "$ACR" --registry-identity system \
  --mi-system-assigned \
  --secrets umbraco-secret="$UMBRACO_CLIENT_SECRET" google-key="$GOOGLE_API_KEY" \
  --env-vars \
    "Umbraco__BaseUrl=$UMBRACO_URL" \
    "Umbraco__ClientSecret=secretref:umbraco-secret" \
    "Google__ApiKey=secretref:google-key" \
    "AzureOpenAI__Endpoint=https://cityguide-openai.openai.azure.com/" \
    "AzureOpenAI__Deployment=gpt-4.1-mini" \
  -o none

# 4. La identidad administrada del job necesita acceso data-plane al modelo.
PRINCIPAL=$(az containerapp job show -n "$JOB_NAME" -g "$RG" --query identity.principalId -o tsv)
OPENAI_ID=$(az cognitiveservices account show -n cityguide-openai -g "$RG" --query id -o tsv)
az role assignment create --assignee "$PRINCIPAL" \
  --role "Cognitive Services OpenAI User" --scope "$OPENAI_ID" -o none

echo "Job '$JOB_NAME' programado: diario 10:00 UTC (6:00 AM AST)."
echo "Ejecución manual de prueba: az containerapp job start -n $JOB_NAME -g $RG"
