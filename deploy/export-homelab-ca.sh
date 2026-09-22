#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-homelab-ca.crt}"
kubectl get secret homelab-ca-secret -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > "$OUT"
echo "CA cert exported to $OUT"
echo "Linux trust: sudo cp $OUT /usr/local/share/ca-certificates/homelab-ca.crt && sudo update-ca-certificates"
echo "macOS trust: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $OUT"
