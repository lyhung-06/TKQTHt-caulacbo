#!/bin/sh
set -eu

: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

case "$DB_NAME" in
    "" | *[!A-Za-z0-9_]*)
        echo "DB_NAME may contain only letters, numbers, and underscores." >&2
        exit 2
        ;;
esac
case "$DB_USER" in
    "" | *[!A-Za-z0-9_]*)
        echo "DB_USER may contain only letters, numbers, and underscores." >&2
        exit 2
        ;;
esac
if [ "$DB_USER" = root ]; then
    echo "DB_USER must not be root." >&2
    exit 2
fi
case "$DB_PASSWORD" in
    *[!A-Za-z0-9_-]*)
        echo "DB_PASSWORD may contain only letters, numbers, underscores, and hyphens." >&2
        exit 2
        ;;
esac
if [ "${#DB_PASSWORD}" -lt 32 ]; then
    echo "DB_PASSWORD must be at least 32 characters." >&2
    exit 2
fi

attempt=0
until mysqladmin ping --host=db --user=root --password="$DB_ROOT_PASSWORD" --silent; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        echo "MySQL did not become available for application-user setup." >&2
        exit 1
    fi
    sleep 2
done

mysql --host=db --user=root --password="$DB_ROOT_PASSWORD" --execute="
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$DB_USER'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
"
