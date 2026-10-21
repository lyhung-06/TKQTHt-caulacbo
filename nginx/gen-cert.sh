#!/bin/sh
set -eu

VM_IP="${1:-}"
if [ -z "$VM_IP" ]; then
    echo "Usage: $0 <VM_IP>" >&2
    exit 2
fi

case "$VM_IP" in
    *[!0-9.]* | "" )
        echo "VM_IP must be an IPv4 address." >&2
        exit 2
        ;;
esac

old_ifs=$IFS
IFS=.
set -- $VM_IP
IFS=$old_ifs
if [ "$#" -ne 4 ]; then
    echo "VM_IP must be an IPv4 address." >&2
    exit 2
fi
for octet do
    case "$octet" in
        "" | *[!0-9]*)
            echo "VM_IP must be an IPv4 address." >&2
            exit 2
            ;;
    esac
    if [ "$octet" -gt 255 ]; then
        echo "VM_IP must be an IPv4 address." >&2
        exit 2
    fi
done

CERT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/certs" && pwd)"
mkdir -p "$CERT_DIR"

if [ -e "$CERT_DIR/club.key" ] || [ -e "$CERT_DIR/club.crt" ]; then
    echo "A certificate or key already exists in $CERT_DIR; remove both explicitly before regenerating." >&2
    exit 1
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/club.key" \
    -out "$CERT_DIR/club.crt" \
    -subj "/CN=$VM_IP" \
    -addext "subjectAltName=IP:$VM_IP,DNS:localhost,IP:127.0.0.1"

chgrp 101 "$CERT_DIR/club.key"
chmod 640 "$CERT_DIR/club.key"
chmod 644 "$CERT_DIR/club.crt"
echo "Self-signed certificate created for $VM_IP in $CERT_DIR (private key readable only by root and group 101/nginx)"
