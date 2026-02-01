#!/bin/bash
cd "$(dirname "$0")"
source ~/.zshrc 2>/dev/null
node sync.mjs "$@"
