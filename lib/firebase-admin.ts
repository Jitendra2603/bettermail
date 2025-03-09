import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin
const apps = getApps();

if (!apps.length) {
  try {
    // Get project ID from environment variables or use fallback
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 
                      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 
                      'bettermail-cb010'; // Fallback to hardcoded project ID
    
    console.log(`Initializing Firebase Admin with project ID: ${projectId}`);
    
    // Check if we're in a Vercel environment
    const isVercel = process.env.VERCEL === '1';
    console.log(`Running in Vercel environment: ${isVercel}`);
    
    // Create service account from environment variables
    const serviceAccount: any = {
      type: "service_account",
      project_id: projectId,
    };
    
    // Add credentials if available
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      // Ensure the private key is properly formatted
      let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      
      // Handle different formats of the private key
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      // In some environments, the key might be JSON stringified
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = JSON.parse(privateKey);
      }
      
      serviceAccount.private_key = privateKey;
      serviceAccount.client_email = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || 
                                   'firebase-adminsdk-fbsvc@bettermail-cb010.iam.gserviceaccount.com';
      
      console.log('Using service account credentials');
      console.log('Client email:', serviceAccount.client_email);
      console.log('Private key available:', !!serviceAccount.private_key);
      
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
    console.error('Error initializing Firebase Admin:', error);
    
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