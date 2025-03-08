const functions = require('firebase-functions');
const next = require('next');

const isDev = process.env.NODE_ENV !== 'production';
const app = next({
  dev: isDev,
  conf: {
    distDir: '.next',
  },
});
const handle = app.getRequestHandler();

// This is the Cloud Function that will be triggered by Firebase Hosting
exports.nextjsServer = functions.https.onRequest((req, res) => {
  return app.prepare().then(() => handle(req, res));
}); 