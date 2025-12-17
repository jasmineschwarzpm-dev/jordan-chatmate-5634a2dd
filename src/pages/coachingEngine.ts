/**
 * Refined Coaching Tip System
 * 
 * Design Principles:
 * 1. Actionable - Give specific, usable advice
 * 2. Contextual - Trigger only when genuinely helpful
 * 3. Educational - Explain WHY, not just WHAT
 * 4. Respectful - Assume competence, offer support
 * 5. Progressive - Reduce guidance as user improves
 * 6. Gen Z Focused - Address common small talk gaps for 18-24 year olds
 */

import {
  INTRODUCTION_PATTERNS,
  ACKNOWLEDGMENT_WORDS,
  DEFLECTION_PATTERNS,
  MINIMAL_RESPONSE_PATTERNS,
} from "./constants";

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

/**
 * Distress Detection Helper
 * Returns distress level: 0 = none, 1 = low, 2 = high
 */
function detectDistressLevel(text: string): number {
  const lowerText = text.toLowerCase();
  
  // High distress signals
  const highDistressPatterns = [
    "can't keep going", "can't go on", "give up", "no point", "want to die",
    "kill myself", "end it all", "better off dead", "no way out", "can't take it"
  ];
  
  // Low distress signals
  const lowDistressPatterns = [
    "struggling", "hard time", "feeling down", "stressed out", "overwhelmed",
    "depressed", "anxious", "worried", "can't handle", "falling apart",
    "losing it", "breaking down", "burnt out", "exhausted"
  ];
  
  if (highDistressPatterns.some(pattern => lowerText.includes(pattern))) {
    return 2;
  }
  
  if (lowDistressPatterns.some(pattern => lowerText.includes(pattern))) {
    return 1;
  }
  
  return 0;
}

/**
 * Check recent conversation for distress trajectory
 * Returns true if conversation has shifted toward emotional heaviness
 */
function hasDescendingTrajectory(history: Turn[], currentText: string): boolean {
  const recentMessages = [...history.slice(-5), { role: "user" as const, content: currentText }];
  let distressCount = 0;
  
  for (const msg of recentMessages) {
    if (msg.role === "user" && detectDistressLevel(msg.content) > 0) {
      distressCount++;
    }
  }
  
  // If 2+ distress signals in last 5 messages, trajectory is descending
  return distressCount >= 2;
}

export function generateCoachTip(context: CoachingContext): string | undefined {
  const { userText, history, triggerKind, cooldown, jordanEndedConversation } = context;
  
  // Cooldown from previous tip
  if (cooldown) return undefined;
  
  // Rate limiting: Don't show more than 3 tips in a session
  const tipCount = history.filter(h => h.coachTip).length;
  if (tipCount >= 4) {
    // Only allow safety tips after 4 tips shown
    if (triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
      return undefined;
    }
  }
  
  // Spacing: Require at least 2 exchanges between tips (except safety tips)
  const recentHistory = history.slice(-3);
  const recentTipCount = recentHistory.filter(h => h.coachTip).length;
  if (recentTipCount > 0 && triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
    return undefined;
  }
  
  // DISTRESS PRE-FILTER: Check emotional context before any coaching
  const currentDistress = detectDistressLevel(userText);
  const hasDistressTrajectory = hasDescendingTrajectory(history, userText);
  
  // If user is showing distress, suppress all non-safety coaching
  if (currentDistress > 0 || hasDistressTrajectory) {
    // Only allow Tier 1 (Safety) tips to pass through
    if (triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
      return undefined; // Suppress all skill-building tips
    }
  }
  
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
  
  // Crisis-adjacent topics (should never reach here if properly handled by Index.tsx crisis flow)
  // This is a fallback just in case
  if (triggerKind === "CRISIS") {
    return "That's a heavy or personal topic for casual small talk. Try pivoting to something lighter like hobbies, the scene, or asking Jordan a question.";
  }
  
  // TIER 2: Critical Conversation Errors (High priority)
  
  // *** NEW: Self-Introduction Check ***
  // If Jordan introduced themselves and user hasn't shared their name
  if (history.length >= 1 && history.length <= 3) {
    const selfIntroTip = checkSelfIntroduction(userText, history);
    if (selfIntroTip) return selfIntroTip;
  }
  
  // Not answering Jordan's direct question
  if (history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant" && /\?/.test(lastJordan.content)) {
      // Check if user is clearly changing topic (greeting only or unrelated)
      if (isGreetingOnly) {
        return "Jordan asked you something — that's a great chance to share a bit about yourself.";
      }
      
      // Only flag if user's response is PURELY a question with no answer content
      // Look for answer indicators: first-person statements, substantive content
      const hasAnswerContent = /\b(i|i'm|i've|my|me|mine|i'd|i'll|yeah|yes|no|nope|definitely|absolutely|sure|totally)\b/i.test(userText);
      const isPurelyQuestion = hasQuestion && wordCount < 6 && !hasAnswerContent;
      
      if (isPurelyQuestion) {
        return "Tip: answering Jordan's question before asking yours helps the conversation feel balanced.";
      }
    }
  }
  
  // Repeated greeting instead of conversing
  if (isGreetingOnly && history.length > 0) {
    const lastJordan = history.slice(-1).find(h => h.role === "assistant")?.content || "";
    const jordanAskedQuestion = /\?/.test(lastJordan);
    
    if (jordanAskedQuestion) {
      return "Tip: Jordan asked you something — this is a great opening to share a bit about yourself!";
    } else {
      return "Tip: after 'hey', try adding a thought or question to get the conversation rolling.";
    }
  }
  
  // Asking about something Jordan already shared (shows inattention)
  if (hasQuestion && history.length >= 3) {
    const tip = checkRepeatedQuestion(userText, history);
    if (tip) return tip;
  }
  
  // TIER 3: Conversation Flow Issues (Medium priority)
  
  // *** NEW: Active Listening Check ***
  // User asked a question without acknowledging what Jordan said
  if (history.length >= 2 && hasQuestion) {
    const activeListeningTip = checkActiveListening(userText, history);
    if (activeListeningTip) return activeListeningTip;
  }
  
  // *** NEW: Build on the Share Check ***
  // Jordan shared something personal and user gave minimal response
  if (history.length >= 2) {
    const buildOnShareTip = checkBuildOnShare(userText, history);
    if (buildOnShareTip) return buildOnShareTip;
  }
  
  // *** NEW: Improved Deflection Detection ***
  // User deflecting with minimal "you?" type responses
  if (history.length >= 2) {
    const deflectionTip = checkDeflection(userText, history);
    if (deflectionTip) return deflectionTip;
  }
  
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
      return "Feeling stuck? Try: 'Hmm, I haven't thought about that — what about you?' It's okay to redirect.";
    } else {
      return "Not sure what to say? Ask Jordan to share more: 'How'd you get into that?' shows genuine curiosity.";
    }
  }
  
  // Interview mode - user asking too many questions without sharing
  if (userMessages.length >= 3) {
    const lastThreeQuestions = lastThreeUserMsgs.filter(msg => /\?/.test(msg.content));
    if (lastThreeQuestions.length >= 3) {
      const hasSharedRecently = lastThreeUserMsgs.some(msg => msg.content.trim().split(/\s+/).length > 15);
      if (!hasSharedRecently) {
        return "Nice — you're curious! Mixing in something about yourself can make it feel more like a two-way chat.";
      }
    }
  }
  
  // No reciprocity - answering without asking back
  if (!jordanEndedConversation && history.length >= 4 && !isGreetingOnly) {
    // Check for distress in recent messages before suggesting skill tips
    const recentDistress = lastThreeUserMsgs.some(msg => detectDistressLevel(msg.content) > 0);
    
    if (!recentDistress && lastThreeUserMsgs.every(msg => {
      const msgIsGreeting = greetingOnlyPattern.test(msg.content.toLowerCase()) && msg.content.trim().split(/\s+/).length < 3;
      return !msgIsGreeting && !/\?/.test(msg.content);
    })) {
      return "Tip: tossing a question back to Jordan — like 'what about you?' — keeps the energy flowing both ways.";
    }
  }
  
  // TIER 4: Skill Development Tips (Lower priority - only show occasionally)
  
  // Milestone check-ins (pattern-aware, not just exchange count)
  if (history.length === 3) {
    // Early milestone: Check if user has asked Jordan anything yet
    const userHasAskedQuestion = userMessages.some(msg => /\?/.test(msg.content));
    if (!userHasAskedQuestion && !hasQuestion) {
      return "Tip: people love being asked about themselves — a simple 'what about you?' can open things up.";
    }
  }
  
  if (history.length === 5) {
    return "You're getting into a rhythm! Notice how open-ended questions ('What do you think about...?') invite more interesting answers than yes/no questions.";
  }
  
  if (history.length === 8) {
    return "Conversations often wrap up around now. Watch for exit cues like 'I should get going' — they're invitations to say goodbye gracefully.";
  }
  
  // Length coaching (only when extreme)
  if (wordCount < 3 && !isGreetingOnly && history.length > 2) {
    return "Tip: adding a quick thought or follow-up question — like 'Nice! What got you into that?' — can help keep the momentum going.";
  }
  
  if (wordCount > 60 && !hasQuestion && history.length > 1) {
    return "Great detail! End with a question like 'What do you think?' to invite Jordan back into the conversation.";
  }
  
  // First message overshare
  if (history.length === 1 && wordCount > 50) {
    return "Nice opener! In casual small talk, shorter first responses (2-3 sentences) leave room for back-and-forth to develop naturally.";
  }
  
  return undefined;
}

/**
 * NEW: Check if user should introduce themselves after Jordan did
 */
function checkSelfIntroduction(userText: string, history: Turn[]): string | undefined {
  // Only check in first few exchanges
  if (history.length === 0 || history.length > 3) return undefined;
  
  // Check if Jordan's first message introduced themselves
  const jordanFirstMsg = history.find(h => h.role === "assistant")?.content || "";
  const jordanIntroduced = INTRODUCTION_PATTERNS.jordanIntro.test(jordanFirstMsg);
  
  if (!jordanIntroduced) return undefined;
  
  // Check if user has shared their name in any of their messages
  const allUserMessages = history.filter(h => h.role === "user").map(h => h.content);
  allUserMessages.push(userText);
  
  const userIntroduced = allUserMessages.some(msg => 
    INTRODUCTION_PATTERNS.userIntro.test(msg) || 
    INTRODUCTION_PATTERNS.casualNameShare.test(msg)
  );
  
  if (!userIntroduced && history.length >= 1) {
    return "Tip: Jordan shared their name — dropping yours in ('I'm [name]') is an easy way to make the chat feel more personal.";
  }
  
  return undefined;
}

/**
 * NEW: Check if user is asking without acknowledging what Jordan said
 */
function checkActiveListening(userText: string, history: Turn[]): string | undefined {
  if (history.length < 2) return undefined;
  
  const lastJordan = history[history.length - 1];
  if (lastJordan?.role !== "assistant") return undefined;
  
  // If Jordan asked a question, user asking back is expected
  if (/\?/.test(lastJordan.content)) return undefined;
  
  // Jordan made a statement (no question) - user should acknowledge before asking new question
  const userAsksWithoutAcknowledging = /\?/.test(userText);
  if (!userAsksWithoutAcknowledging) return undefined;
  
  const userLower = userText.toLowerCase().trim();
  
  // Check if user acknowledged Jordan's statement
  const hasAcknowledgment = ACKNOWLEDGMENT_WORDS.some(word => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    return pattern.test(userLower);
  });
  
  // If they acknowledged AND asked, that's great - no tip needed
  if (hasAcknowledgment) return undefined;
  
  // User jumped straight to a question without acknowledging
  const wordCount = userText.trim().split(/\s+/).length;
  if (wordCount < 10) { // Short question with no acknowledgment
    return "Tip: a quick 'oh cool!' or 'nice!' before your question can make the conversation feel warmer.";
  }
  
  return undefined;
}

/**
 * NEW: Check if user gave minimal response to Jordan's personal share
 */
function checkBuildOnShare(userText: string, history: Turn[]): string | undefined {
  if (history.length < 2) return undefined;
  
  const lastJordan = history[history.length - 1];
  if (lastJordan?.role !== "assistant") return undefined;
  
  const jordanContent = lastJordan.content.toLowerCase();
  
  // Check if Jordan shared something personal (uses first person)
  const jordanSharedPersonal = /\b(i|i'm|i've|my|i'd|i'll)\s+\w+/i.test(jordanContent);
  if (!jordanSharedPersonal) return undefined;
  
  // Check if user's response is minimal
  const userLower = userText.toLowerCase().trim();
  const isMinimalResponse = MINIMAL_RESPONSE_PATTERNS.some(pattern => pattern.test(userLower));
  
  // Also check word count
  const wordCount = userText.trim().split(/\s+/).length;
  const hasQuestion = /\?/.test(userText);
  
  if ((isMinimalResponse || wordCount <= 3) && !hasQuestion) {
    return "Tip: Jordan just shared something — a follow-up like 'how'd you get into that?' keeps the convo going.";
  }
  
  return undefined;
}

/**
 * NEW: Check for low-effort deflection responses
 */
function checkDeflection(userText: string, history: Turn[]): string | undefined {
  if (history.length < 2) return undefined;
  
  const lastJordan = history[history.length - 1];
  if (lastJordan?.role !== "assistant") return undefined;
  
  // Check if Jordan asked a question
  if (!/\?/.test(lastJordan.content)) return undefined;
  
  const userLower = userText.toLowerCase().trim();
  
  // Check if user is deflecting with minimal question-back
  const isDeflecting = DEFLECTION_PATTERNS.some(pattern => pattern.test(userLower));
  
  if (isDeflecting) {
    return "Good instinct to ask back! Try adding your own thought first — 'I usually go with X. You?' makes it more of an exchange.";
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
      return "Tip: Jordan touched on this earlier — try building on what they said, like 'you mentioned X — tell me more about that!'";
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
      return "Tip: sounds like Jordan's wrapping up — a friendly 'nice talking to you!' or 'take care!' lands well here.";
    } else {
      return "Tip: Jordan's winding down — matching their energy with a casual goodbye wraps things up nicely.";
    }
  }
  
  return undefined;
}

/**
 * Determine if conversation should show stall nudge
 * Context-aware: checks for distress before suggesting pause
 */
export function shouldStallNudge(history: Turn[], pauseContext?: string): boolean {
  if (history.length < 4) return false;
  
  const lastThreeUser = history.filter(h => h.role === "user").slice(-3);
  
  // Check if recent messages contain distress
  const hasDistress = lastThreeUser.some(msg => detectDistressLevel(msg.content) > 0);
  
  // If distress is present, suppress stall nudge entirely
  // (User may need time to process emotions, not coaching about pausing)
  if (hasDistress) return false;
  
  const allBriefAndNoQuestions = lastThreeUser.every(msg => {
    const words = msg.content.trim().split(/\s+/).length;
    const hasQuestion = /\?/.test(msg.content);
    return words < 8 && !hasQuestion;
  });
  
  return allBriefAndNoQuestions;
}
