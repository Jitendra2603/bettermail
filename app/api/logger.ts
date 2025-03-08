import { initLogger } from "braintrust";

// Initialize logger with a conditional check for build time
let logger;

try {
  logger = initLogger({
    projectName: "messages",
    apiKey: process.env.BRAINTRUST_API_KEY || 'dummy-key-for-build-time',
  });
} catch (error) {
  console.warn('Error initializing Braintrust logger:', error);
  // Provide a dummy logger for build time
  logger = {
    log: () => {},
    startSpan: () => ({ end: () => {} }),
    startTracing: () => ({ end: () => {} }),
  };
}

export { logger };