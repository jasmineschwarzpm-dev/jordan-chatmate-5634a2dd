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

// Track which positive behaviors have been celebrated (first-time only)
export interface CelebratedBehaviors {
  askedFirstQuestion: boolean;
  sharedPersonally: boolean;
  activeListening: boolean;
  gracefulClose: boolean;
  followedSuggestion: boolean;
  foundCommonGround: boolean;
}

interface CoachingContext {
  userText: string;
  history: Turn[];
  triggerKind: string;
  cooldown: boolean;
  jordanEndedConversation: boolean;
  celebratedBehaviors?: CelebratedBehaviors;
}

export interface CoachChatMessage {
  content: string;
  type: "celebration" | "insight";
}

/**
 * Jordan Behavior Insights
 * Explain WHY Jordan does certain things to help users understand social dynamics
 */
const JORDAN_BEHAVIOR_INSIGHTS: Record<string, string> = {
  closing: "Jordan is starting to wrap up — in real life, people often signal they need to go before actually leaving. It's a polite way to give you a chance to say goodbye.",
  askingQuestion: "Notice how Jordan asked a question? That's a common way to show interest and keep conversations balanced.",
  sharingPersonal: "Jordan shared something personal — this is an invitation for you to share too. It builds connection.",
  changingTopic: "Jordan shifted topics — this often happens naturally in conversations when one thread runs its course.",
};

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

/**
 * Generate positive reinforcement for first-time positive behaviors
 * Returns { tip, behaviorKey } if a celebration is warranted
 */
function generatePositiveReinforcement(
  context: CoachingContext
): { tip: string; behaviorKey: keyof CelebratedBehaviors } | undefined {
  const { userText, history, jordanEndedConversation, celebratedBehaviors } = context;
  
  if (!celebratedBehaviors) return undefined;
  
  const userMessages = [...history, { role: "user" as const, content: userText }].filter(h => h.role === "user");
  const userLower = userText.toLowerCase().trim();
  const hasQuestion = /\?/.test(userText);
  
  // 1. User asks their first question
  if (!celebratedBehaviors.askedFirstQuestion && hasQuestion && userMessages.length >= 2) {
    const previousUserAsked = userMessages.slice(0, -1).some(msg => /\?/.test(msg.content));
    if (!previousUserAsked) {
      return {
        tip: "Nice! Asking questions is one of the best ways to connect — people love talking about themselves.",
        behaviorKey: "askedFirstQuestion"
      };
    }
  }
  
  // 2. User shares something personal after Jordan did
  if (!celebratedBehaviors.sharedPersonally && history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant") {
      const jordanShared = /\b(i|i'm|i've|my|i'd)\s+\w+/i.test(lastJordan.content);
      const userShares = /\b(i|i'm|i've|my|i'd)\s+\w+/i.test(userText);
      const wordCount = userText.trim().split(/\s+/).length;
      
      if (jordanShared && userShares && wordCount >= 8) {
        return {
          tip: "That's the vibe — sharing about yourself builds real connection.",
          behaviorKey: "sharedPersonally"
        };
      }
    }
  }
  
  // 3. User demonstrates active listening (references something Jordan said)
  if (!celebratedBehaviors.activeListening && history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant") {
      // Check if user references something Jordan mentioned
      const jordanWords = lastJordan.content.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4)
        .slice(0, 10);
      
      const userReferences = jordanWords.some(word => 
        userLower.includes(word) && 
        !["about", "think", "would", "could", "should", "really", "actually"].includes(word)
      );
      
      // Also check for explicit callbacks
      const hasCallback = /\b(you (said|mentioned|were saying)|that('s| is) (cool|interesting|awesome|neat))\b/i.test(userText);
      
      if (userReferences || hasCallback) {
        return {
          tip: "Great listening — referencing what someone said makes them feel heard.",
          behaviorKey: "activeListening"
        };
      }
    }
  }
  
  // 4. User gracefully closes the conversation
  if (!celebratedBehaviors.gracefulClose && jordanEndedConversation) {
    const gracefulClose = /\b(nice (to |talking|chatting|meeting)|good (talking|chatting|to meet)|take care|see you|catch you|have a good|was (nice|great|fun))\b/i.test(userLower);
    if (gracefulClose) {
      return {
        tip: "Smooth close — ending warmly leaves a good impression.",
        behaviorKey: "gracefulClose"
      };
    }
  }
  
  // 5. User finds common ground with Jordan (shares similar interest/experience)
  if (!celebratedBehaviors.foundCommonGround && history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant") {
      const jordanLower = lastJordan.content.toLowerCase();
      
      // Detect Jordan sharing interests/preferences
      const jordanInterestPatterns = [
        /\b(i (love|like|enjoy|watch|read|play|listen to)|i'm (into|a fan of)|my favorite)\s+(\w+)/i,
        /\b(i've been (watching|reading|playing|listening to))\s+(\w+)/i,
        /\b(big fan of|really into|obsessed with)\s+(\w+)/i
      ];
      
      let jordanMentionedInterest: string | null = null;
      for (const pattern of jordanInterestPatterns) {
        const match = jordanLower.match(pattern);
        if (match) {
          jordanMentionedInterest = match[0];
          break;
        }
      }
      
      if (jordanMentionedInterest) {
        // Check if user responds with similar interest patterns
        const userShowsCommonGround = [
          /\b(me too|same (here)?|i (also|love|like) that|i'm (also )?into)\b/i,
          /\b(oh (yeah|nice|cool)?.{0,20}i (love|like|watch|read|play))\b/i,
          /\b(have you (seen|read|tried|heard)|what('s| is) your favorite)\b/i,
          /\b(i (just )?(saw|watched|read|finished|started))\b/i
        ].some(pattern => pattern.test(userText));
        
        // Also check for topic echoing (user mentions same topic area)
        const interestKeywords = ["movie", "book", "game", "show", "music", "band", "series", "podcast", "anime", "manga", "sci-fi", "horror", "comedy", "fantasy"];
        const jordanMentionedTopic = interestKeywords.find(kw => jordanLower.includes(kw));
        const userEchoesTopic = jordanMentionedTopic && userText.toLowerCase().includes(jordanMentionedTopic);
        
        if (userShowsCommonGround || userEchoesTopic) {
          return {
            tip: "Finding common ground — that's one of the fastest ways to build connection with someone new.",
            behaviorKey: "foundCommonGround"
          };
        }
      }
    }
  }
  
  // 5. User followed a coach suggestion (check if previous tip was acted on)
  if (!celebratedBehaviors.followedSuggestion && history.length >= 2) {
    const recentTips = history.slice(-3).filter(h => h.coachTip);
    if (recentTips.length > 0) {
      const lastTip = recentTips[recentTips.length - 1].coachTip || "";
      
      // Check if user followed common tip patterns
      const followedAskQuestion = lastTip.includes("question") && hasQuestion;
      const followedShareName = lastTip.includes("name") && /\b(i'm|my name|call me)\s+\w+/i.test(userText);
      const followedAcknowledge = lastTip.includes("acknowledge") && ACKNOWLEDGMENT_WORDS.some(w => userLower.includes(w));
      
      if (followedAskQuestion || followedShareName || followedAcknowledge) {
        return {
          tip: "You picked that up fast — that's exactly the kind of move that makes conversations flow.",
          behaviorKey: "followedSuggestion"
        };
      }
    }
  }
  
  return undefined;
}

/**
 * Detect Jordan's behavior and generate insight messages for the chat
 */
export function detectJordanBehavior(history: Turn[]): CoachChatMessage | undefined {
  if (history.length < 2) return undefined;
  
  const lastJordan = history[history.length - 1];
  if (lastJordan?.role !== "assistant") return undefined;
  
  const jordanContent = lastJordan.content;
  
  // Check if Jordan is closing/winding down
  const closingPatterns = [
    /\b(should (get going|head out|take off|grab|run)|gotta (go|run|get going))/i,
    /\b(take care|see you|good luck|catch you later|have a good|nice talking|good chatting)/i,
    /\b(let you (get back|go)|I'll let you)/i
  ];
  
  const isClosing = closingPatterns.some(p => p.test(jordanContent)) && !/\?/.test(jordanContent);
  if (isClosing) {
    return { content: JORDAN_BEHAVIOR_INSIGHTS.closing, type: "insight" };
  }
  
  return undefined;
}

export function generateCoachTip(context: CoachingContext): { 
  tip?: string; 
  celebratedBehavior?: keyof CelebratedBehaviors;
  chatMessage?: CoachChatMessage;
} {
  const { userText, history, triggerKind, cooldown, jordanEndedConversation } = context;
  
  // Cooldown from previous tip
  if (cooldown) return {};
  
  // Rate limiting: Don't show more than 3 tips in a session
  const tipCount = history.filter(h => h.coachTip).length;
  if (tipCount >= 4) {
    // Only allow safety tips after 4 tips shown
    if (triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
      return {};
    }
  }
  
  // Spacing: Require at least 2 exchanges between tips (except safety tips)
  const recentHistory = history.slice(-3);
  const recentTipCount = recentHistory.filter(h => h.coachTip).length;
  if (recentTipCount > 0 && triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
    return {};
  }
  
  // DISTRESS PRE-FILTER: Check emotional context before any coaching
  const currentDistress = detectDistressLevel(userText);
  const hasDistressTrajectory = hasDescendingTrajectory(history, userText);
  
  // If user is showing distress, suppress all non-safety coaching
  if (currentDistress > 0 || hasDistressTrajectory) {
    // Only allow Tier 1 (Safety) tips to pass through
    if (triggerKind !== "PII" && triggerKind !== "CONTROVERSIAL" && triggerKind !== "CRISIS") {
      return {}; // Suppress all skill-building tips
    }
  }
  
  // *** POSITIVE REINFORCEMENT: Check for first-time positive behaviors ***
  // These appear as chat messages (celebrations), not as tips
  const positiveReinforcement = generatePositiveReinforcement(context);
  if (positiveReinforcement) {
    return { 
      celebratedBehavior: positiveReinforcement.behaviorKey,
      chatMessage: { content: positiveReinforcement.tip, type: "celebration" }
    };
  }
  
  const wordCount = userText.trim().split(/\s+/).length;
  const hasQuestion = /\?/.test(userText);
  const userMessages = [...history, { role: "user" as const, content: userText }].filter(h => h.role === "user");
  const lastThreeUserMsgs = userMessages.slice(-3);
  
  const greetingOnlyPattern = /^(hey|hi|hello|yo|sup|what's up|wassup|hiya|howdy)[\s!.]*$/i;
  const isGreetingOnly = greetingOnlyPattern.test(userText.toLowerCase()) && wordCount < 3;
  
  // TIER 1: Safety & Appropriateness (Always show)
  if (triggerKind === "PII") {
    return { tip: "Keep personal info private in casual conversations. Use general details instead of specific contact info." };
  }
  
  if (triggerKind === "CONTROVERSIAL") {
    return { tip: "Topics like politics or religion can derail small talk. Try lighter subjects to build rapport first." };
  }
  
  // Crisis-adjacent topics (should never reach here if properly handled by Index.tsx crisis flow)
  if (triggerKind === "CRISIS") {
    return { tip: "That's a heavy or personal topic for casual small talk. Try pivoting to something lighter like hobbies, the scene, or asking Jordan a question." };
  }
  
  // TIER 2: Critical Conversation Errors (High priority)
  
  // Self-Introduction Check
  if (history.length >= 1 && history.length <= 3) {
    const selfIntroTip = checkSelfIntroduction(userText, history);
    if (selfIntroTip) return { tip: selfIntroTip };
  }
  
  // Not answering Jordan's direct question
  if (history.length >= 2) {
    const lastJordan = history[history.length - 1];
    if (lastJordan?.role === "assistant" && /\?/.test(lastJordan.content)) {
      if (isGreetingOnly) {
        return { tip: "Jordan asked you something — that's a great chance to share a bit about yourself." };
      }
      
      const hasAnswerContent = /\b(i|i'm|i've|my|me|mine|i'd|i'll|yeah|yes|no|nope|definitely|absolutely|sure|totally)\b/i.test(userText);
      const isPurelyQuestion = hasQuestion && wordCount < 6 && !hasAnswerContent;
      
      if (isPurelyQuestion) {
        return { tip: "Tip: answering Jordan's question before asking yours helps the conversation feel balanced." };
      }
    }
  }
  
  // Repeated greeting instead of conversing
  if (isGreetingOnly && history.length > 0) {
    const lastJordan = history.slice(-1).find(h => h.role === "assistant")?.content || "";
    const jordanAskedQuestion = /\?/.test(lastJordan);
    
    if (jordanAskedQuestion) {
      return { tip: "Tip: Jordan asked you something — this is a great opening to share a bit about yourself!" };
    } else {
      return { tip: "Tip: after 'hey', try adding a thought or question to get the conversation rolling." };
    }
  }
  
  // Asking about something Jordan already shared
  if (hasQuestion && history.length >= 3) {
    const tip = checkRepeatedQuestion(userText, history);
    if (tip) return { tip };
  }
  
  // TIER 3: Conversation Flow Issues (Medium priority)
  
  // Active Listening Check
  if (history.length >= 2 && hasQuestion) {
    const activeListeningTip = checkActiveListening(userText, history);
    if (activeListeningTip) return { tip: activeListeningTip };
  }
  
  // Build on the Share Check
  if (history.length >= 2) {
    const buildOnShareTip = checkBuildOnShare(userText, history);
    if (buildOnShareTip) return { tip: buildOnShareTip };
  }
  
  // Deflection Detection
  if (history.length >= 2) {
    const deflectionTip = checkDeflection(userText, history);
    if (deflectionTip) return { tip: deflectionTip };
  }
  
  // Jordan is winding down but user isn't picking up on it
  if (history.length >= 3) {
    const exitTip = checkExitCues(userText, history, jordanEndedConversation);
    if (exitTip) return { tip: exitTip };
  }
  
  // User stuck/uncertain
  if (/\b(i don't know|idk|not sure|no clue|can't think|i'm stuck|don't know what)\b/i.test(userText.toLowerCase())) {
    const lastJordan = history.slice(-1).find(h => h.role === "assistant")?.content || "";
    const jordanAskedQuestion = /\?/.test(lastJordan);
    
    if (jordanAskedQuestion) {
      return { tip: "Feeling stuck? Try: 'Hmm, I haven't thought about that — what about you?' It's okay to redirect." };
    } else {
      return { tip: "Not sure what to say? Ask Jordan to share more: 'How'd you get into that?' shows genuine curiosity." };
    }
  }
  
  // Interview mode - user asking 3+ questions without sharing about themselves or responding to Jordan
  if (userMessages.length >= 3) {
    const lastThreeQuestions = lastThreeUserMsgs.filter(msg => /\?/.test(msg.content));
    if (lastThreeQuestions.length >= 3) {
      // Check if user has shared about themselves (I statements with substance)
      const hasSharedAboutSelf = lastThreeUserMsgs.some(msg => {
        const hasIStatement = /\b(i|i'm|i've|my|i'd|i'll)\s+\w+/i.test(msg.content);
        const wordCount = msg.content.trim().split(/\s+/).length;
        return hasIStatement && wordCount >= 6;
      });
      
      // Check if user has acknowledged/responded to what Jordan said
      const hasAcknowledged = lastThreeUserMsgs.some(msg => {
        const msgLower = msg.content.toLowerCase();
        return ACKNOWLEDGMENT_WORDS.some(w => msgLower.includes(w)) ||
          /\b(that's|that is|sounds|seems|wow|oh|nice|cool|interesting|awesome)\b/i.test(msg.content);
      });
      
      if (!hasSharedAboutSelf && !hasAcknowledged) {
        return { tip: "Asking questions is great — you'll also want to break it up by sharing about yourself or responding to what they said, so it doesn't feel like an interview." };
      }
    }
  }
  
  // No reciprocity - answering without asking back
  if (!jordanEndedConversation && history.length >= 4 && !isGreetingOnly) {
    const recentDistress = lastThreeUserMsgs.some(msg => detectDistressLevel(msg.content) > 0);
    
    if (!recentDistress && lastThreeUserMsgs.every(msg => {
      const msgIsGreeting = greetingOnlyPattern.test(msg.content.toLowerCase()) && msg.content.trim().split(/\s+/).length < 3;
      return !msgIsGreeting && !/\?/.test(msg.content);
    })) {
      return { tip: "Tip: tossing a question back to Jordan — like 'what about you?' — keeps the energy flowing both ways." };
    }
  }
  
  // TIER 4: Skill Development Tips (Lower priority)
  
  // Milestone check-ins
  if (history.length === 3) {
    const userHasAskedQuestion = userMessages.some(msg => /\?/.test(msg.content));
    if (!userHasAskedQuestion && !hasQuestion) {
      return { tip: "Tip: people love being asked about themselves — a simple 'what about you?' can open things up." };
    }
  }
  
  if (history.length === 5) {
    return { tip: "You're getting into a rhythm! Notice how open-ended questions ('What do you think about...?') invite more interesting answers than yes/no questions." };
  }
  
  if (history.length === 8) {
    return { tip: "Conversations often wrap up around now. Watch for exit cues like 'I should get going' — they're invitations to say goodbye gracefully." };
  }
  
  // Length coaching (only when extreme)
  if (wordCount < 3 && !isGreetingOnly && history.length > 2) {
    return { tip: "Tip: adding a quick thought or follow-up question — like 'Nice! What got you into that?' — can help keep the momentum going." };
  }
  
  if (wordCount > 60 && !hasQuestion && history.length > 1) {
    return { tip: "Great detail! End with a question like 'What do you think?' to invite Jordan back into the conversation." };
  }
  
  // First message overshare
  if (history.length === 1 && wordCount > 50) {
    return { tip: "Nice opener! In casual small talk, shorter first responses (2-3 sentences) leave room for back-and-forth to develop naturally." };
  }
  
  return {};
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
