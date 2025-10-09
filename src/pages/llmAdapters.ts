export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function lovableChat(messages: ChatMessage[], opts: any): Promise<string> {
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/jordan-chat`;
  
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, opts }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      console.error("Lovable chat error:", error);
      throw new Error("Chat failed");
    }

    const data = await resp.json();
    return data.reply || "Let's keep chatting — what's on your mind?";
  } catch (e) {
    console.error("Lovable adapter error:", e);
    throw e;
  }
}

export async function openaiChat(messages: ChatMessage[], opts: any): Promise<string> {
  // Placeholder for OpenAI integration
  throw new Error("OpenAI adapter not configured");
}

export async function mockChat(messages: ChatMessage[]): Promise<string> {
  const responses = [
    "That's cool! What got you into that?",
    "Nice! I've been meaning to check that out.",
    "Sounds interesting — any favorites?",
    "Oh yeah? What do you think so far?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
