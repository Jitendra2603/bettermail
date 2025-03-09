import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Analytics, getAnalytics } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';

// Hardcoded Firebase config as a fallback
// This ensures the client always has valid values even if environment variables fail
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCOttqMVTqbbulUrSzw6zmcxjgykfbtQGE",
  authDomain: "bettermail-cb010.firebaseapp.com",
  projectId: "bettermail-cb010",
  storageBucket: "bettermail-cb010.firebasestorage.app",
  messagingSenderId: "299168470266",
  appId: "1:299168470266:web:c63587cb766fda31962543",
  measurementId: "G-ZBQMRZ5D97",
};

// Log Firebase config for debugging (without sensitive values)
console.log('Firebase config environment variables:', {
  apiKeyExists: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomainExists: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucketExists: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementIdExists: !!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
});

// Use environment variables if available, otherwise use hardcoded values
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || FIREBASE_CONFIG.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || FIREBASE_CONFIG.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || FIREBASE_CONFIG.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_CONFIG.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || FIREBASE_CONFIG.appId,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || FIREBASE_CONFIG.measurementId,
};

console.log('Using Firebase config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '(API key exists)' : '(missing)',
});

// Initialize Firebase for client-side
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  
  // If initialization fails with the environment variables, try with hardcoded values
  try {
    console.log('Retrying with hardcoded Firebase config');
    app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    console.log('Firebase initialized successfully with hardcoded config');
  } catch (fallbackError) {
    console.error('Fatal error initializing Firebase with fallback:', fallbackError);
    throw fallbackError;
  }
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export let analytics: Analytics | undefined;

// Only initialize analytics on the client side
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
    console.log('Firebase Analytics initialized');
  } catch (error) {
    console.warn('Failed to initialize Firebase Analytics:', error);
  }
}

// Export the Firebase app instance
export default app; 