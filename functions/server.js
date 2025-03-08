const next = require('next');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
require('./firebase-admin');

// Set default NODE_ENV to 'production' if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Try to load next.config.js from parent directory
let nextConfig = {};
try {
  nextConfig = require('./next.config.js');
  console.log('Loaded Next.js config successfully');
} catch (error) {
  console.warn('Failed to load Next.js config:', error.message);
}

// Create a Next.js app instance
const app = next({
  dev: process.env.NODE_ENV !== 'production',
  conf: nextConfig,
});

// Prepare the Next.js app
const handle = app.getRequestHandler();

// Initialize the app only once
let appInitialized = false;
const initializeApp = async () => {
  if (!appInitialized) {
    try {
      await app.prepare();
      appInitialized = true;
      console.log('Next.js app initialized successfully');
    } catch (error) {
      console.error('Error initializing Next.js app:', error);
      throw error;
    }
  }
};

// Export the Next.js server handler
exports.nextjsServer = async (req, res) => {
  try {
    await initializeApp();
    console.log(`Next.js request: ${req.method} ${req.url}`);
    return handle(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).send('Internal Server Error');
  }
}; 