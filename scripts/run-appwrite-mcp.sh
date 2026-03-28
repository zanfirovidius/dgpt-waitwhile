#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

load_appwrite_env_file() {
    file_path=$1

    [ -f "$file_path" ] || return 0

    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            "" | \#*)
                continue
                ;;
            export\ *)
                line=${line#export }
                ;;
        esac

        case "$line" in
            *=*)
                key=${line%%=*}
                value=${line#*=}
                ;;
            *)
                continue
                ;;
        esac

        key=$(printf '%s' "$key" | sed 's/[[:space:]]//g')
        value=$(printf '%s' "$value" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
        value=$(printf '%s' "$value" | sed 's/,[[:space:]]*$//')

        case "$value" in
            \"*\")
                value=${value#\"}
                value=${value%\"}
                ;;
            \'*\')
                value=${value#\'}
                value=${value%\'}
                ;;
        esac

        value=$(printf '%s' "$value" | sed 's/,[[:space:]]*$//')

        case "$key" in
            APPWRITE_PROJECT_ID | APPWRITE_API_KEY | APPWRITE_ENDPOINT)
                export "$key=$value"
                ;;
        esac
    done < "$file_path"
}

# Load project-local Appwrite credentials without storing them in Codex config.
load_appwrite_env_file "$PROJECT_ROOT/.env"
load_appwrite_env_file "$PROJECT_ROOT/.env.local"

: "${APPWRITE_PROJECT_ID:?APPWRITE_PROJECT_ID is required in .env or .env.local}"
: "${APPWRITE_API_KEY:?APPWRITE_API_KEY is required in .env or .env.local}"
: "${APPWRITE_ENDPOINT:?APPWRITE_ENDPOINT is required in .env or .env.local}"

if command -v uvx >/dev/null 2>&1; then
    UVX_BIN=$(command -v uvx)
elif [ -x "$HOME/.local/bin/uvx" ]; then
    UVX_BIN="$HOME/.local/bin/uvx"
else
    echo "uvx is required but was not found in PATH." >&2
    exit 1
fi

exec "$UVX_BIN" mcp-server-appwrite "$@"
