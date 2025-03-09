#!/bin/bash

# Create secrets for all sensitive environment variables
echo "Setting up secrets in Cloud Secret Manager..."

# NextAuth
firebase apphosting:secrets:set nextauth-secret

# Firebase Admin
firebase apphosting:secrets:set admin-private-key

# API Keys
firebase apphosting:secrets:set openai-api-key
firebase apphosting:secrets:set llama-parse-api-key
firebase apphosting:secrets:set braintrust-api-key

# Google OAuth
firebase apphosting:secrets:set google-client-secret

echo "All secrets have been set up. Now update apphosting.yaml to use these secrets." 