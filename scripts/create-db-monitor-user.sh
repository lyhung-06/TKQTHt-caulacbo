#!/bin/sh
set -eu

: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"
: "${DB_MONITOR_USER:?DB_MONITOR_USER is required}"
: "${DB_MONITOR_PASSWORD:?DB_MONITOR_PASSWORD is required}"
: "${DB_USER:?DB_USER is required}"

case "$DB_MONITOR_USER" in
    "" | *[!A-Za-z0-9_]*)
        echo "DB_MONITOR_USER may contain only letters, numbers, and underscores." >&2
        exit 2
        ;;
esac
if [ "$DB_MONITOR_USER" = root ] || [ "$DB_MONITOR_USER" = "$DB_USER" ]; then
    echo "DB_MONITOR_USER must be distinct from root and the application user." >&2
    exit 2
fi
case "$DB_MONITOR_PASSWORD" in
    *[!A-Za-z0-9_-]*)
        echo "DB_MONITOR_PASSWORD may contain only letters, numbers, underscores, and hyphens." >&2
        exit 2
        ;;
esac
if [ "${#DB_MONITOR_PASSWORD}" -lt 24 ]; then
    echo "DB_MONITOR_PASSWORD must be at least 24 characters." >&2
    exit 2
fi

attempt=0
until mysqladmin ping --host=db --user=root --password="$DB_ROOT_PASSWORD" --silent; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        echo "MySQL did not become available for monitor-user setup." >&2
        exit 1
    fi
    sleep 2
done

mysql --host=db --user=root --password="$DB_ROOT_PASSWORD" --execute="
CREATE USER IF NOT EXISTS '$DB_MONITOR_USER'@'%' IDENTIFIED BY '$DB_MONITOR_PASSWORD';
ALTER USER '$DB_MONITOR_USER'@'%' IDENTIFIED BY '$DB_MONITOR_PASSWORD';
GRANT PROCESS, REPLICATION CLIENT ON *.* TO '$DB_MONITOR_USER'@'%';
GRANT SELECT ON performance_schema.* TO '$DB_MONITOR_USER'@'%';
"
