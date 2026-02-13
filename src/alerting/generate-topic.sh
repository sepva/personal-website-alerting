#!/bin/bash

# Generate a unique ntfy topic name with random suffix
# Usage: ./generate-topic.sh

BASE="seppe-website-alerts-2026"

# Generate 16 random alphanumeric characters
RANDOM_SUFFIX=$(openssl rand -hex 8 | tr -d '\n')

# Combine base with random suffix
TOPIC="${BASE}-${RANDOM_SUFFIX}"

echo ""
echo "Generated ntfy topic name:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$TOPIC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Copy this topic name and use it in:"
echo "  1. Your ntfy app (subscribe to this topic)"
echo "  2. wrangler.alerting.jsonc (NTFY_TOPIC variable)"
echo ""
echo "Test it with:"
echo "  curl -d \"Test\" https://ntfy.sh/$TOPIC"
echo ""
