/**
 * Refined Coaching Tip System
 * 
 * Design Principles:
 * 1. Actionable - Give specific, usable advice
 * 2. Contextual - Trigger only when genuinely helpful
 * 3. Educational - Explain WHY, not just WHAT
 * 4. Respectful - Assume competence, offer support
 * 5. Progressive - Reduce guidance as user improves
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
  coachTip?: string;
}

interface CoachingContext {
  userText: string;
  history: Turn[];
  triggerKind: string;
  cooldown: boolean;
  jordanEndedConversation: boolean;
}

export function generateCoachTip(context: CoachingContext): string | undefined {
  const { userText, history, triggerKind, cooldown, jordanEndedConversation } = context;
  
  if (cooldown) return undefined;
  
  const wordCount = userText.trim().split(/\s+/).length;
  const hasQuestion = /\?/.test(userText);
  const userMessages = [...history, { role: "user" as const, content: userText }].filter(h => h.role === "user");
  const lastThreeUserMsgs = userMessages.slice(-3);
  const recentJordanMsgs = history.slice(-2).filter(h => h.role === "assistant");
  
  const greetingOnlyPattern = /^(hey|hi|hello|yo|sup|what's up|wassup|hiya|howdy)[\s!.]*$/i;
  const isGreetingOnly = greetingOnlyPattern.test(userText.toLowerCase()) && wordCount < 3;
  
  // TIER 1: Safety & Appropriateness (Always show)
  if (triggerKind === "PII") {
    return "Keep personal info private in casual conversations. Use general details instead of specific contact info.";
  }
  
  if (triggerKind === "CONTROVERSIAL") {
    return "Topics like politics or religion can derail small talk. Try lighter subjects to build rapport first.";
  }
  
  // TIER 2: Critical Conversation Errors (High priority)
  
  // Not answering Jordan's direct question
  if (history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant" && /\?/.test(lastJordan.content)) {
      // Jordan just asked a question - check if user is answering it
      const questionWords = lastJordan.content.toLowerCase().match(/\b(what|where|how|why|which|who|when|do you|are you|have you)\b/g);
      const userLower = userText.toLowerCase();
      
      // Check if user is clearly changing topic (greeting only or unrelated)
      if (isGreetingOnly) {
        return "Jordan just asked you something. Try answering before greeting again.";
      }
      
      // Check if user is asking a new question instead of answering
      if (hasQuestion && wordCount < 15) {
        const isDeflecting = !questionWords?.some(qw => userLower.includes(qw));
        if (isDeflecting) {
          return "You asked a question without answering Jordan's first. In conversations, answering before asking shows you're listening.";
        }
      }
    }
  }
  
  // Repeated greeting instead of conversing
  if (isGreetingOnly && history.length > 0) {
    const lastJordan = history.slice(-1).find(h => h.role === "assistant")?.content || "";
    const jordanAskedQuestion = /\?/.test(lastJordan);
    
    if (jordanAskedQuestion) {
      return "Repeated greetings can stall conversation. Answer Jordan's question to keep things moving.";
    } else {
      return "Add substance after the greeting — share a thought or ask a question to invite dialogue.";
    }
  }
  
  // Asking about something Jordan already shared (shows inattention)
  if (hasQuestion && history.length >= 3) {
    const tip = checkRepeatedQuestion(userText, history);
    if (tip) return tip;
  }
  
  // TIER 3: Conversation Flow Issues (Medium priority)
  
  // Jordan is winding down but user isn't picking up on it
  if (history.length >= 3) {
    const exitTip = checkExitCues(userText, history, jordanEndedConversation);
    if (exitTip) return exitTip;
  }
  
  // User stuck/uncertain - offer specific help
  if (/\b(i don't know|idk|not sure|no clue|can't think|i'm stuck|don't know what)\b/i.test(userText.toLowerCase())) {
    const lastJordan = history.slice(-1).find(h => h.role === "assistant")?.content || "";
    const jordanAskedQuestion = /\?/.test(lastJordan);
    
    if (jordanAskedQuestion) {
      return "Stuck? Try: 'I haven't thought about that — what about you?' or pivot with a related question.";
    } else {
      return "Not sure what to say? Ask Jordan to elaborate: 'How'd you get into that?' or 'What do you like about it?'";
    }
  }
  
  // Interview mode - user asking too many questions without sharing
  if (userMessages.length >= 3) {
    const lastThreeQuestions = lastThreeUserMsgs.filter(msg => /\?/.test(msg.content));
    if (lastThreeQuestions.length >= 3) {
      const hasSharedRecently = lastThreeUserMsgs.some(msg => msg.content.trim().split(/\s+/).length > 15);
      if (!hasSharedRecently) {
        return "Balance is key — share a bit about yourself between questions to avoid feeling like an interview.";
      }
    }
  }
  
  // No reciprocity - answering without asking back
  if (!jordanEndedConversation && history.length >= 4 && !isGreetingOnly) {
    if (lastThreeUserMsgs.every(msg => {
      const msgIsGreeting = greetingOnlyPattern.test(msg.content.toLowerCase()) && msg.content.trim().split(/\s+/).length < 3;
      return !msgIsGreeting && !/\?/.test(msg.content);
    })) {
      return "Conversations flow both ways. After sharing, ask Jordan something to keep the exchange balanced.";
    }
  }
  
  // TIER 4: Skill Development Tips (Lower priority - only show occasionally)
  
  // Milestone check-ins (only at specific conversation lengths)
  if (history.length === 5) {
    return "You're building momentum! Notice how Jordan responds when you ask open-ended questions vs yes/no questions.";
  }
  
  if (history.length === 8) {
    return "Small talk often wraps up around now. Watch for Jordan's exit cues like 'I should get going' or 'Nice talking to you.'";
  }
  
  // Length coaching (only when extreme)
  if (wordCount < 3 && !isGreetingOnly && history.length > 2) {
    return "Very brief responses can signal disinterest. Add a sentence or ask a question to keep energy up.";
  }
  
  if (wordCount > 60 && !hasQuestion && history.length > 1) {
    return "Long answers are great! Balance them by ending with a question to invite Jordan back in.";
  }
  
  // First message overshare
  if (history.length === 1 && wordCount > 50) {
    return "Strong opener! In quick small talk, shorter initial responses (2-3 sentences) feel more natural.";
  }
  
  return undefined;
}

/**
 * Check if user is asking about something Jordan already mentioned
 */
function checkRepeatedQuestion(userText: string, history: Turn[]): string | undefined {
  const jordanMessages = history.filter(h => h.role === "assistant").map(h => h.content.toLowerCase());
  const userQuestion = userText.toLowerCase();
  
  // Extract question topics
  const questionTopics = userQuestion.match(/\b(what|where|how|why|which|who|when)\s+[^?]+/gi);
  
  if (questionTopics && questionTopics.length > 0) {
    const alreadyAnswered = jordanMessages.some(jordanMsg => {
      return questionTopics.some(topic => {
        const topicWords = topic.toLowerCase()
          .replace(/\b(what|where|how|why|which|who|when|do|does|did|is|are|was|were|you|your)\b/g, '')
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 3);
        
        if (topicWords.length > 0) {
          const matchCount = topicWords.filter(word => jordanMsg.includes(word)).length;
          return matchCount >= Math.min(2, topicWords.length);
        }
        return false;
      });
    });
    
    if (alreadyAnswered) {
      return "Jordan mentioned this earlier. Asking again suggests you weren't listening — try a new question instead.";
    }
  }
  
  return undefined;
}

/**
 * Check if user is missing Jordan's exit cues
 */
function checkExitCues(userText: string, history: Turn[], jordanEnded: boolean): string | undefined {
  if (jordanEnded) return undefined; // Already handled elsewhere
  
  const recentJordanMsgs = history.slice(-5).filter(h => h.role === "assistant");
  const windDownPatterns = [
    { pattern: /\b(should (get going|head out|take off|grab|run)|gotta (go|run|get going))/i, type: "leaving" },
    { pattern: /\b(take care|see you|good luck|catch you later|have a good|nice talking|good chatting)/i, type: "farewell" },
    { pattern: /\b(anyway|alright|well,? then)/i, type: "transition" },
    { pattern: /\b(let you (get back|go)|I'll let you)/i, type: "release" }
  ];
  
  let exitCueFound = false;
  let exitType = "";
  
  for (const msg of recentJordanMsgs.slice(-2)) {
    for (const { pattern, type } of windDownPatterns) {
      if (pattern.test(msg.content)) {
        exitCueFound = true;
        exitType = type;
        break;
      }
    }
    if (exitCueFound) break;
  }
  
  // Check if user is reciprocating the exit
  const userWindingDown = /\b(bye|goodbye|see you|take care|thanks|gotta go|have a good|nice talking)/i.test(userText);
  
  if (exitCueFound && !userWindingDown) {
    if (exitType === "leaving" || exitType === "farewell") {
      return "Jordan is signaling they're wrapping up. Respond with a friendly goodbye like 'Nice talking to you!' or 'Take care!'";
    } else {
      return "Jordan's tone is shifting toward an exit. Acknowledge it or start your own goodbye to end naturally.";
    }
  }
  
  return undefined;
}

/**
 * Determine if conversation should show stall nudge
 */
function shouldStallNudge(history: Turn[]): boolean {
  if (history.length < 4) return false;
  
  const lastThreeUser = history.filter(h => h.role === "user").slice(-3);
  const allBriefAndNoQuestions = lastThreeUser.every(msg => {
    const words = msg.content.trim().split(/\s+/).length;
    const hasQuestion = /\?/.test(msg.content);
    return words < 8 && !hasQuestion;
  });
  
  return allBriefAndNoQuestions;
}
