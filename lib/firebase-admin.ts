import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin
const apps = getApps();

if (!apps.length) {
  try {
    // Get project ID from environment variables or use fallback
    const projectId = process.env.ADMIN_PROJECT_ID || 
                      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 
                      'bettermail-cb010'; // Fallback to hardcoded project ID
    
    console.log(`Initializing Firebase Admin with project ID: ${projectId}`);
    
    // Create service account from environment variables
    const serviceAccount: any = {
      type: "service_account",
      project_id: projectId,
    };
    
    // Add credentials if available
    if (process.env.ADMIN_PRIVATE_KEY) {
      serviceAccount.private_key = process.env.ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
      serviceAccount.client_email = process.env.ADMIN_CLIENT_EMAIL || 
                                   'firebase-adminsdk-fbsvc@bettermail-cb010.iam.gserviceaccount.com';
      
      console.log('Using service account credentials');
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // During build time, use a minimal configuration
      console.log('No service account key available, using minimal configuration');
      initializeApp({
        projectId: projectId,
      });
    }
    
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.warn('Error initializing Firebase Admin:', error);
    
    // If all else fails, initialize with just the project ID
    console.log('Falling back to minimal configuration');
    initializeApp({
      projectId: 'bettermail-cb010',
    });
  }
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
export const adminStorage = getStorage(); 