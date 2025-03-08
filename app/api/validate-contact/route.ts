import { invoke, wrapTraced } from "braintrust";
import { NextResponse } from 'next/server';
import { logger } from "../logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name } = body;
    const data = await handleRequest(name);
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

const handleRequest = wrapTraced(async function handleRequest(name: string) {
  try {
    // Add a try-catch block to handle potential API key issues
    try {
      const result = await invoke({
        projectName: "messages",
        slug: "validate-name-317c",
        input: {
          name,
        },
        stream: false,
      });
      return result;
    } catch (error) {
      console.error("Error invoking Braintrust:", error);
      // Fallback response if Braintrust is unavailable
      return {
        isValid: true,
        suggestion: name,
        reason: "Validation service unavailable, accepting as-is"
      };
    }
  } catch (error) {
    console.error("Error in handleRequest:", error);
    throw error;
  }
});