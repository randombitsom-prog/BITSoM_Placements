#!/bin/bash

# Script to add, commit, and push changes to git
# Usage: ./deploy.sh "commit message"
# Or: ./deploy.sh (will prompt for commit message)

cd /Users/sahil/Desktop/BITSoM_Placements

# Get commit message from argument or prompt
if [ -z "$1" ]; then
    echo "Enter commit message:"
    read -r COMMIT_MSG
else
    COMMIT_MSG="$1"
fi

# Check if there are any changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo "No changes to commit."
    exit 0
fi

# Add all changes
echo "Adding all changes..."
git add .

# Commit with message
echo "Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Push to origin main
echo "Pushing to origin main..."
git push origin main

echo "Done!"

