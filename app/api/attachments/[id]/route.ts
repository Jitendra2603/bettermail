import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Store id in a variable to avoid using params synchronously
  const id = params.id;
  
  try {
    console.log('[AttachmentAPI] Fetching attachment:', id);
    
    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    let doc = null;
    let data = null;
    let userId = null;
    
    // Search for the document in each user's documents collection
    for (const userDoc of usersSnapshot.docs) {
      const docRef = adminDb
        .collection('users')
        .doc(userDoc.id)
        .collection('documents')
        .doc(id);
      
      const docSnapshot = await docRef.get();
      if (docSnapshot.exists) {
        doc = docSnapshot;
        data = docSnapshot.data();
        userId = userDoc.id;
        break;
      }
    }
    
    if (!doc || !data) {
      console.error('[AttachmentAPI] Document not found:', id);
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    
    if (!data.url) {
      console.error('[AttachmentAPI] Document has no URL:', id);
      return NextResponse.json({ error: "Document has no URL" }, { status: 404 });
    }
    
    // Extract filename and content type
    const filename = data.metadata?.title || data.metadata?.originalName || 'attachment';
    const contentType = data.metadata?.contentType || 'application/octet-stream';
    
    console.log('[AttachmentAPI] Document found:', {
      id,
      filename,
      contentType,
      url: data.url
    });
    
    let buffer: Buffer;
    
    // Handle different URL types
    if (data.url.startsWith('/')) {
      // Local file path in Firebase Storage
      try {
        const bucket = adminStorage.bucket();
        const filePath = data.url.replace(/^\//, ''); // Remove leading slash
        console.log('[AttachmentAPI] Fetching from storage path:', filePath);
        
        // Generate a fresh download URL with a long expiration
        const file = bucket.file(filePath);
        const [exists] = await file.exists();
        
        if (!exists) {
          console.error('[AttachmentAPI] File does not exist in storage:', filePath);
          return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
        }
        
        // Download the file directly
        const [fileContent] = await file.download();
        buffer = fileContent;
        
        // Update the document with a fresh URL
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
        });
        
        // Update the document with the fresh URL
        await adminDb
          .collection('users')
          .doc(userId || 'unknown')
          .collection('documents')
          .doc(id)
          .update({
            url: signedUrl,
            'metadata.lastUrlRefresh': new Date()
          });
        
        console.log('[AttachmentAPI] Updated document with fresh URL');
      } catch (error) {
        console.error('[AttachmentAPI] Error downloading from storage:', error);
        return NextResponse.json({ error: "Failed to download file from storage" }, { status: 500 });
      }
    } else if (data.url.startsWith('http')) {
      // Remote URL - might be an expired Firebase Storage URL
      console.log('[AttachmentAPI] URL appears to be a remote URL, checking if it\'s a Firebase Storage URL');
      
      // Check if it's a Firebase Storage URL that might be expired
      const isFirebaseStorageUrl = data.url.includes('firebasestorage.googleapis.com') || 
                                  data.url.includes('storage.googleapis.com');
      
      if (isFirebaseStorageUrl) {
        console.log('[AttachmentAPI] Detected Firebase Storage URL, generating fresh URL');
        
        try {
          // Try to extract the path from the URL
          const urlObj = new URL(data.url);
          const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(?:\?|$)/);
          let storagePath = '';
          
          if (pathMatch && pathMatch[1]) {
            // URL format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH
            storagePath = decodeURIComponent(pathMatch[1]);
          } else {
            // Try alternative format: https://storage.googleapis.com/BUCKET/PATH
            const parts = urlObj.pathname.split('/');
            if (parts.length > 2) {
              storagePath = parts.slice(2).join('/');
            }
          }
          
          if (storagePath) {
            console.log('[AttachmentAPI] Extracted storage path:', storagePath);
            
            const bucket = adminStorage.bucket();
            const file = bucket.file(storagePath);
            const [exists] = await file.exists();
            
            if (exists) {
              // Download the file directly
              const [fileContent] = await file.download();
              buffer = fileContent;
              
              // Generate a fresh URL
              const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
              });
              
              // Update the document with the fresh URL
              await adminDb
                .collection('users')
                .doc(userId || 'unknown')
                .collection('documents')
                .doc(id)
                .update({
                  url: signedUrl,
                  'metadata.lastUrlRefresh': new Date()
                });
              
              console.log('[AttachmentAPI] Updated document with fresh URL');
            } else {
              throw new Error('File not found in storage');
            }
          } else {
            throw new Error('Could not extract storage path from URL');
          }
        } catch (storageError) {
          console.error('[AttachmentAPI] Error refreshing Firebase Storage URL:', storageError);
          
          // Fall back to trying the original URL
          try {
            console.log('[AttachmentAPI] Falling back to original URL:', data.url);
            const response = await fetch(data.url);
            if (!response.ok) {
              console.error('[AttachmentAPI] Failed to fetch from URL:', response.statusText);
              return NextResponse.json({ error: "Failed to fetch file from URL" }, { status: 500 });
            }
            
            buffer = Buffer.from(await response.arrayBuffer());
          } catch (fetchError) {
            console.error('[AttachmentAPI] Error fetching from URL:', fetchError);
            return NextResponse.json({ error: "Failed to fetch file from URL" }, { status: 500 });
          }
        }
      } else {
        // Regular HTTP URL
        try {
          console.log('[AttachmentAPI] Fetching from regular URL:', data.url);
          const response = await fetch(data.url);
          if (!response.ok) {
            console.error('[AttachmentAPI] Failed to fetch from URL:', response.statusText);
            return NextResponse.json({ error: "Failed to fetch file from URL" }, { status: 500 });
          }
          
          buffer = Buffer.from(await response.arrayBuffer());
        } catch (fetchError) {
          console.error('[AttachmentAPI] Error fetching from URL:', fetchError);
          return NextResponse.json({ error: "Failed to fetch file from URL" }, { status: 500 });
        }
      }
    } else {
      console.error('[AttachmentAPI] Unsupported URL format:', data.url);
      return NextResponse.json({ error: "Unsupported URL format" }, { status: 400 });
    }
    
    // Return the file content with appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    
    return new NextResponse(buffer, {
      status: 200,
      headers
    });
    
  } catch (error) {
    console.error('[AttachmentAPI] Error fetching attachment:', error);
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 500 });
  }
} 