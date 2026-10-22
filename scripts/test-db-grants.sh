#!/bin/sh
set -eu

: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_MONITOR_USER:?DB_MONITOR_USER is required}"
: "${DB_MONITOR_PASSWORD:?DB_MONITOR_PASSWORD is required}"

case "$DB_NAME" in
    "" | *[!A-Za-z0-9_]*)
        echo "DB_NAME may contain only letters, numbers, and underscores." >&2
        exit 2
        ;;
esac
case "$DB_USER:$DB_MONITOR_USER" in
    *[!A-Za-z0-9_:]*)
        echo "Database usernames may contain only letters, numbers, and underscores." >&2
        exit 2
        ;;
esac

probe_database=club_hardening_probe

exists="$(mysql --batch --skip-column-names --host=db --user=root --password="$DB_ROOT_PASSWORD" \
    --execute="SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$probe_database'")"
if [ "$exists" != "0" ]; then
    echo "Refusing to use existing probe database '$probe_database'." >&2
    exit 1
fi

cleanup() {
    mysql --host=db --user=root --password="$DB_ROOT_PASSWORD" \
        --execute="DROP DATABASE IF EXISTS \`$probe_database\`" >/dev/null
}
trap cleanup EXIT HUP INT TERM

mysql --host=db --user=root --password="$DB_ROOT_PASSWORD" \
    --execute="CREATE DATABASE \`$probe_database\`"

echo "Application grants:"
mysql --batch --skip-column-names --host=db --user=root --password="$DB_ROOT_PASSWORD" \
    --execute="SELECT CONCAT('global:', PRIVILEGE_TYPE) FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = '''$DB_USER''@''%''' UNION SELECT CONCAT(TABLE_SCHEMA, ':', PRIVILEGE_TYPE) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = '''$DB_USER''@''%'''"

if mysql --host=db --user="$DB_USER" --password="$DB_PASSWORD" \
    --execute="DROP DATABASE \`$probe_database\`" >/dev/null 2>&1; then
    echo "FAIL: application account dropped a database outside its schema." >&2
    exit 1
fi
echo "PASS: application account was denied DROP DATABASE outside its schema."

echo "Exporter grants:"
mysql --batch --skip-column-names --host=db --user=root --password="$DB_ROOT_PASSWORD" \
    --execute="SELECT CONCAT('global:', PRIVILEGE_TYPE) FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = '''$DB_MONITOR_USER''@''%''' UNION SELECT CONCAT(TABLE_SCHEMA, ':', PRIVILEGE_TYPE) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = '''$DB_MONITOR_USER''@''%'''"

if mysql --host=db --user="$DB_MONITOR_USER" --password="$DB_MONITOR_PASSWORD" \
    --execute="SELECT * FROM \`$DB_NAME\`.users LIMIT 1" >/dev/null 2>&1; then
    echo "FAIL: exporter account can read application user records." >&2
    exit 1
fi
echo "PASS: exporter account cannot read application user records."
