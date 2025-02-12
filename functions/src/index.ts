import { onMessagePublished } from "firebase-functions/v2/pubsub";
import * as admin from "firebase-admin";

admin.initializeApp();

interface PushData {
  emailAddress?: string;
  historyId?: string;
}

export const handleGmailPush = onMessagePublished("gmail-notifications", async (event) => {
  try {
    const data: PushData = event.data.message.data
      ? JSON.parse(Buffer.from(event.data.message.data, "base64").toString())
      : {};

    if (!data?.emailAddress) {
      console.error("Invalid push notification data:", data);
      return null;
    }

    // Find the user by email
    const usersSnapshot = await admin
      .firestore()
      .collection("users")
      .where("email", "==", data.emailAddress)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.error("No user found for email:", data.emailAddress);
      return null;
    }

    const user = usersSnapshot.docs[0];

    // Trigger a sync for this user
    await admin
      .firestore()
      .collection("users")
      .doc(user.id)
      .update({
        lastSyncTrigger: admin.firestore.FieldValue.serverTimestamp(),
        syncReason: "gmail_push",
      });

    console.log("Successfully processed Gmail push notification for user:", user.id);
    return null;
  } catch (error) {
    console.error("Error processing Gmail push notification:", error);
    return null;
  }
}); 