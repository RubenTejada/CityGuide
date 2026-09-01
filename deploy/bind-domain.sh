#!/usr/bin/env bash
# Vincula quehacerrd.com (y www) al frontend, con certificado administrado gratis.
# Ejecutar DESPUÉS de cambiar los nameservers del dominio en GoDaddy a los de
# la zona Azure DNS (az network dns zone show -g cityguide-rg -n quehacerrd.com
# --query nameServers). La validación falla mientras los NS no propaguen.
set -euo pipefail

RG=cityguide-rg
APP=quehacerrd-web

for HOST in quehacerrd.com www.quehacerrd.com; do
  az webapp config hostname add -g "$RG" --webapp-name "$APP" --hostname "$HOST"
  az webapp config ssl create -g "$RG" -n "$APP" --hostname "$HOST"
  THUMB=$(az webapp config ssl list -g "$RG" --query "[?subjectName=='$HOST'].thumbprint | [0]" -o tsv)
  az webapp config ssl bind -g "$RG" -n "$APP" --certificate-thumbprint "$THUMB" --ssl-type SNI
done

echo "Dominio vinculado: https://quehacerrd.com y https://www.quehacerrd.com"
