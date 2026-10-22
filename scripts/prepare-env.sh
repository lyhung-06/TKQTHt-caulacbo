#!/bin/sh
set -eu

if [ ! -f .env ]; then
    umask 077
    cp .env.example .env
    echo "Created .env from .env.example. Replace every placeholder before starting services."
fi

chmod 600 .env
echo "Applied mode 600 to .env. Placeholder values were not inspected or printed."
