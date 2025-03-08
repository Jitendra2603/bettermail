const functions = require('firebase-functions');
const next = require('next');

// Initialize the Next.js app only once (outside the function handler)
const app = next({
  dev: false,
  conf: {
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
exports.nextjsServer = functions.https.onRequest(async (req, res) => {
  await ensureInitialized();
  return handle(req, res);
}); 