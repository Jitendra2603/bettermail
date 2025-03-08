const admin = require('firebase-admin');

let firebaseApp;

try {
  // Check if Firebase Admin is already initialized
  firebaseApp = admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  try {
    // Initialize with project ID if available
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.ADMIN_PROJECT_ID;
    
    if (projectId) {
      console.log(`Initializing Firebase Admin with project ID: ${projectId}`);
      
      // Check if we have service account credentials
      if (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY) {
        const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY).replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.ADMIN_CLIENT_EMAIL;
        
        if (projectId && clientEmail && privateKey) {
          console.log(`Using service account credentials for ${clientEmail}`);
          firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
              projectId: projectId,
              clientEmail: clientEmail,
              privateKey: privateKey
            })
          });
        } else {
          console.log('Missing required service account fields, using default initialization');
          firebaseApp = admin.initializeApp();
        }
      } else {
        // Fall back to application default credentials
        console.log('Using application default credentials');
        firebaseApp = admin.initializeApp({
          projectId: projectId,
          credential: admin.credential.applicationDefault()
        });
      }
    } else {
      // Auto-initialize with default credentials
      console.log('Initializing Firebase Admin with default credentials');
      firebaseApp = admin.initializeApp();
    }
    
    console.log('Firebase Admin initialized successfully');
  } catch (initError) {
    console.warn('Error initializing Firebase Admin:', initError.message);
    // Try to get the default app if it exists
    try {
      firebaseApp = admin.app();
      console.log('Using existing Firebase Admin app');
    } catch (appError) {
      console.error('Failed to get Firebase Admin app:', appError.message);
      // Create a minimal app with just the project ID to avoid build errors
      if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        console.log('Creating minimal Firebase Admin app for build process');
        firebaseApp = admin.initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        });
      }
    }
  }
}

module.exports = firebaseApp; 