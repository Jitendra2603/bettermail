import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { adminDb } from '@/lib/firebase-admin';

// GET: Retrieve AI instructions for the current user
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user reference
    const userRef = adminDb.collection('users').doc(session.user.id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // User document doesn't exist yet, return empty instructions
      return NextResponse.json({ instructions: '' });
    }

    // Get AI instructions from user document
    const userData = userDoc.data();
    const instructions = userData?.aiInstructions || '';

    return NextResponse.json({ instructions });
  } catch (error) {
    console.error('[API] Error retrieving AI instructions:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve AI instructions' },
      { status: 500 }
    );
  }
}

// POST: Save AI instructions for the current user
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { instructions } = body;

    if (typeof instructions !== 'string') {
      return NextResponse.json(
        { error: 'Invalid instructions format' },
        { status: 400 }
      );
    }

    // Get user reference
    const userRef = adminDb.collection('users').doc(session.user.id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create user document if it doesn't exist
      await userRef.set({
        email: session.user.email || '',
        createdAt: new Date(),
        aiInstructions: instructions,
        usage: {
          totalCost: 0,
          totalTokens: 0
        }
      });
    } else {
      // Update existing user document
      await userRef.update({
        aiInstructions: instructions,
        updatedAt: new Date()
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error saving AI instructions:', error);
    return NextResponse.json(
      { error: 'Failed to save AI instructions' },
      { status: 500 }
    );
  }
} 