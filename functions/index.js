const { onRequest } = require('firebase-functions/v2/https');
const server = require('./server');

// Export the Next.js server function
exports.nextjsServer = onRequest({
  memory: '1GiB',
  timeoutSeconds: 60,
}, server.nextjsServer); 