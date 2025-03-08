const admin = require('firebase-admin');

// Check if Firebase Admin is already initialized
let firebaseApp;
try {
  firebaseApp = admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  // Get project ID from environment variables
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 
                    process.env.ADMIN_PROJECT_ID || 
                    'bettermail-cb010'; // Fallback to hardcoded project ID

  console.log(`Initializing Firebase Admin with project ID: ${projectId}`);
  
  try {
    // Check if we have service account credentials
    if (process.env.ADMIN_PRIVATE_KEY) {
      const privateKey = process.env.ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
      const clientEmail = process.env.ADMIN_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@bettermail-cb010.iam.gserviceaccount.com';
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey
        })
      });
    } else {
      // During build time, use a minimal configuration with just the project ID
      console.log('No service account key available, using minimal configuration');
      firebaseApp = admin.initializeApp({
        projectId: projectId
      });
    }
    console.log('Firebase Admin initialized successfully');
  } catch (initError) {
    console.warn('Error initializing Firebase Admin:', initError.message);
    // If all else fails, initialize with just the project ID to avoid build errors
    console.log('Falling back to minimal configuration');
    firebaseApp = admin.initializeApp({
      projectId: projectId
    });
  }
}

module.exports = firebaseApp; 