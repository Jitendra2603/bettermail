const { https } = require('firebase-functions');
const { default: next } = require('next');
const path = require('path');

const isDev = process.env.NODE_ENV !== 'production';
const nextConfig = require(path.join(process.cwd(), '../next.config.js'));

// Initialize the Next.js app only once (outside the function handler)
const app = next({
  dev: isDev,
  conf: {
    ...nextConfig,
    distDir: '.next',
  },
});
const handle = app.getRequestHandler();

// Initialize the app once
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await app.prepare();
    initialized = true;
  }
}

// This is the Cloud Function that will be triggered by Firebase Hosting
exports.nextjsServer = https.onRequest(async (req, res) => {
  try {
    await ensureInitialized();
    return handle(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).send('Internal Server Error');
  }
}); 