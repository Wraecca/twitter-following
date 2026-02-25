#!/bin/bash
set -euo pipefail

# Setup environment
export PATH="/usr/local/bin:/opt/homebrew/bin:/Users/shao/.nvm/versions/node/v22.22.0/bin:$PATH"
[ -f "$HOME/.config/op/env" ] && source "$HOME/.config/op/env"
[ -f "$HOME/.config/cron-sync.env" ] && source "$HOME/.config/cron-sync.env"

# Required env: SLACK_CHANNEL, SLACK_TOKEN_REF (1Password reference)
: "${SLACK_CHANNEL:?Set SLACK_CHANNEL in ~/.config/cron-sync.env}"
: "${SLACK_TOKEN_REF:?Set SLACK_TOKEN_REF in ~/.config/cron-sync.env}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Twitter following sync..."

# Run sync.sh and capture output
OUTPUT=$(bash sync.sh 2>&1)
echo "$OUTPUT"

# Parse the summary line: "Sync complete: +N new, -N removed, N bio updates"
if echo "$OUTPUT" | grep -q "Sync complete:"; then
    SUMMARY=$(echo "$OUTPUT" | grep "Sync complete:" | tail -1)
    
    # Extract numbers using sed
    NEW_COUNT=$(echo "$SUMMARY" | sed -n 's/.*+\([0-9]*\) new.*/\1/p')
    REMOVED_COUNT=$(echo "$SUMMARY" | sed -n 's/.*-\([0-9]*\) removed.*/\1/p')
    
    # Default to 0 if empty
    NEW_COUNT=${NEW_COUNT:-0}
    REMOVED_COUNT=${REMOVED_COUNT:-0}
    
    # Send Slack notification if there are new follows or unfollows
    if [ "$NEW_COUNT" -gt 0 ] || [ "$REMOVED_COUNT" -gt 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected: +$NEW_COUNT new, -$REMOVED_COUNT removed. Sending Slack notification..."
        
        TOKEN=$(op-sa read "$SLACK_TOKEN_REF")
        CHANNEL="$SLACK_CHANNEL"
        MESSAGE="Twitter following sync: +${NEW_COUNT} new follows, -${REMOVED_COUNT} unfollows"
        
        RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"channel\":\"$CHANNEL\",\"text\":\"$MESSAGE\"}")
        
        if echo "$RESPONSE" | grep -q '"ok":true'; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Slack notification sent successfully"
        else
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Failed to send Slack notification: $RESPONSE"
        fi
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] No new follows or unfollows, skipping notification"
    fi
fi

# Git commit and push (always runs)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Committing and pushing changes..."
git add -A
if ! git diff --cached --quiet; then
    git commit --no-gpg-sign -m 'sync'
    git push
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes committed and pushed"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to commit"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Twitter following sync complete"
