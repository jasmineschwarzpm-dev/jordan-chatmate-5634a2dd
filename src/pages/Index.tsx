import React, { useMemo, useState, useEffect, useRef } from "react";
import { DEFAULTS, type Scene } from "./constants";
import { detectTriggers, prioritize, shouldTerminateSession, moderateJordanResponse, detectDistressSignals } from "./guardrails";
import { lovableChat, openaiChat, mockChat, type ChatMessage } from "./llmAdapters";
import { buildSystemPrompt, makeMessages, chatOpts } from "./JordanEngine";
import { generateCoachTip } from "./coachingEngine";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, RotateCcw, X } from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { CoachTip } from "@/components/CoachTip";
import { SessionSummary } from "@/components/SessionSummary";
import { SetupDialog } from "@/components/SetupDialog";
import { CrisisModal } from "@/components/CrisisModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// --- Types ---
interface Turn { role: "user"|"assistant"; content: string; coachTip?: string }
interface Setup { scene: Scene; interlocutor: "he"|"she"|"they"; ageConfirmed: boolean }

type Adapter = "lovable"|"openai"|"mock";

// --- Component ---
export default function App() {
  const { toast } = useToast();
  
  // Setup state
  const [setup, setSetup] = useState<Setup>({ scene: DEFAULTS.scene, interlocutor: "they", ageConfirmed: false });
  const [showSetup, setShowSetup] = useState(true);
  const adapter: Adapter = "lovable"; // Fixed to Lovable

  // Conversation state
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pauseWarning, setPauseWarning] = useState(false);
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);
  const [showCrisisModal, setShowCrisisModal] = useState(false);

  // Session logging state
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionDbId, setSessionDbId] = useState<string | null>(null);
  const [sessionCopied, setSessionCopied] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Auto-focus input when conversation starts
  useEffect(() => {
    if (history.length > 0 && !ended && !busy) {
      inputRef.current?.focus();
    }
  }, [history.length, ended, busy]);

  // Track pause time - show nudge after 2 minutes
  useEffect(() => {
    if (!busy && history.length > 0 && history[history.length - 1]?.role === "assistant" && !ended) {
      setLastResponseTime(Date.now());
      setPauseWarning(false);
      
      const timer = setTimeout(() => {
        setPauseWarning(true);
      }, 120000); // 2 minutes

      return () => clearTimeout(timer);
    }
  }, [history, busy, ended]);

  // Update session in database when history changes
  useEffect(() => {
    if (sessionDbId && history.length > 0) {
      updateSession();
    }
  }, [history, sessionDbId]);

  const summary = useMemo(() => makeSummary(history), [history]);

  function reset() { 
    setHistory([]); 
    setInput(""); 
    setEnded(false); 
    setCooldown(false); 
    setPauseWarning(false);
    setLastResponseTime(null);
    setSessionId("");
    setSessionDbId(null);
    setSessionCopied(false);
    setSessionToken("");
    setShowSetup(true);
    setShowCrisisModal(false);
    localStorage.removeItem("jordan-conversation");
    localStorage.removeItem("jordan-session-token");
  }

  // Generate random 8-character session ID
  function generateSessionId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create new session in database
  async function createSession() {
    const newSessionId = generateSessionId();
    const newSessionToken = crypto.randomUUID(); // Generate secure token
    
    setSessionId(newSessionId);
    setSessionToken(newSessionToken);
    localStorage.setItem("jordan-session-token", newSessionToken);

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        session_id: newSessionId,
        session_token: newSessionToken,
        scene: setup.scene,
        interlocutor: setup.interlocutor,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create session:", error);
      return null;
    }

    // Create metadata record
    await supabase.from("session_metadata").insert({
      session_id: data.id,
      session_token: newSessionToken,
      completion_status: "in_progress",
    });

    setSessionDbId(data.id);
    return data.id;
  }

  // Update session transcript and metadata
  async function updateSession() {
    if (!sessionDbId || !sessionToken) return;

    const transcript = history.map(h => ({
      role: h.role,
      content: h.content,
      coachTip: h.coachTip || null,
    }));

    // Count triggers
    const crisisCount = history.filter(h => h.coachTip?.includes("988")).length;
    const piiCount = history.filter(h => h.coachTip?.includes("contact info")).length;
    const controversialCount = history.filter(h => h.coachTip?.includes("polarizing")).length;
    const coachingCount = history.filter(h => h.coachTip).length;

    const userMessages = history.filter(h => h.role === "user");
    const avgLength = userMessages.length > 0
      ? Math.round(userMessages.reduce((sum, msg) => sum + msg.content.split(/\s+/).length, 0) / userMessages.length)
      : 0;

    await supabase.from("sessions").update({
      transcript,
      total_turns: history.length,
      metadata: { userAgent: navigator.userAgent },
      session_token: sessionToken,
    }).eq("id", sessionDbId).eq("session_token", sessionToken);

    await supabase.from("session_metadata").update({
      crisis_count: crisisCount,
      pii_count: piiCount,
      controversial_count: controversialCount,
      coaching_count: coachingCount,
      avg_user_message_length: avgLength,
      session_token: sessionToken,
    }).eq("session_id", sessionDbId).eq("session_token", sessionToken);
  }

  async function send() {
    if (!input.trim() || busy || ended) return;
    const userText = input.trim();
    setInput("");
    setBusy(true);
    setPauseWarning(false);
    setLastResponseTime(null);

    // 1) Detect triggers on user text
    const triggers = detectTriggers(userText);
    const main = prioritize(triggers);
    
    // Initialize coachTip early (may be set by crisis analysis)
    let coachTip: string | undefined;

    // 2) Crisis: Use LLM to analyze context before showing crisis modal
    // PHASE 1 FIX: Semantic pre-screening - call LLM for ANY distress signal, not just keyword matches
    const hasDistressSignals = detectDistressSignals(userText);
    
    if (shouldTerminateSession(main.kind) || hasDistressSignals) {
      // Build recent conversation context (last 5 messages)
      const recentMessages = history.slice(-5).map(h => ({
        role: h.role,
        content: h.content
      }));
      
      // Add current user message to context
      recentMessages.push({ role: "user", content: userText });
      
      try {
        // Call LLM to analyze crisis context
        const { data: analysis, error } = await supabase.functions.invoke("analyze-crisis-context", {
          body: { 
            recentMessages,
            triggerKeyword: triggers.find(t => t.kind === "CRISIS")?.reason || "crisis"
          }
        });
        
        if (error) {
          console.error("Crisis context analysis error:", error);
          // Fail safe: default to crisis intervention
          analysis.severity = "crisis";
        }
        
        console.log("Crisis analysis result:", analysis);
        
        // Add user message to history
        setHistory(h => [...h, { role: "user", content: userText }]);
        
        if (analysis.severity === "crisis") {
          // Severe or persistent distress detected - show crisis modal immediately
          // Do NOT add user message to history - modal takes over
          setShowCrisisModal(true);
          setEnded(true);
          setBusy(false);
          
          // Update database to mark crisis detected
          if (sessionDbId) {
            await supabase
              .from("sessions")
              .update({ 
                crisis_detected: true,
                ended_at: new Date().toISOString(),
                total_turns: history.length + 1,
                transcript: JSON.parse(JSON.stringify([...history, { role: "user", content: userText }])),
              })
              .eq("id", sessionDbId)
              .eq("session_token", sessionToken);
          }
          
          return; // Stop here - don't show user message, don't continue conversation
        } else if (analysis.severity === "coaching") {
          // First mention or academic discussion - add coaching tip but continue conversation
          coachTip = "That's a heavy or personal topic for casual small talk. Try pivoting to something lighter like hobbies, the scene, or asking Jordan a question.";
        }
        // If "safe", continue normally (no intervention)
        
      } catch (err) {
        console.error("Failed to analyze crisis context:", err);
        // Fail safe: show crisis modal if analysis fails
        setHistory(h => [...h, { role: "user", content: userText }]);
        setShowCrisisModal(true);
        setEnded(true);
        setBusy(false);
        return;
      }
    }

    // 3) Generate coaching tip using refined coaching engine
    // Note: coachTip may already be set by crisis analysis above
    if (!coachTip) {
      // Check if Jordan has ended the conversation (definitive goodbye)
      const jordanEndedConversation = history.slice(-2).some(h => 
        h.role === "assistant" && 
        /\b(bye|goodbye|see you around|take care|catch you later|have a good one|nice talking to you|good chatting)\b/i.test(h.content) &&
        !/\?/.test(h.content)
      );
      
      coachTip = generateCoachTip({
        userText,
        history,
        triggerKind: main.kind,
        cooldown,
        jordanEndedConversation
      });
    }

    // 4) Add user message immediately (show it before Jordan responds)
    setHistory(h => [...h, { role: "user", content: userText, coachTip }]);

    // 5) Build messages for LLM (pass exchange count for phase awareness)
    const exchangeCount = history.length;
    const sys = buildSystemPrompt(setup.scene, setup.interlocutor, exchangeCount);
    const chatHistory = [...history, { role: "user" as const, content: userText }].map(t => ({ role: t.role, content: t.content }));
    const messages: ChatMessage[] = makeMessages(sys, chatHistory);

    // 6) Call adapter
    let reply = "";
    try {
      if (adapter === "lovable") reply = await lovableChat(messages, chatOpts({ useAdapter: "lovable", scene: setup.scene, interlocutor: setup.interlocutor } as any));
      else if (adapter === "openai") reply = await openaiChat(messages, chatOpts({ useAdapter: "openai", scene: setup.scene, interlocutor: setup.interlocutor } as any));
      else reply = await mockChat(messages);
    } catch (e:any) {
      toast({
        title: "Connection issue",
        description: "Jordan is having trouble responding. Please try again.",
        variant: "destructive",
      });
      reply = "(Generator unavailable) Let's keep it simple—what's one thing you've been reading or watching lately?";
    }

    // 7) Moderate Jordan's response before showing to user
    const conversationContext = history.slice(-5).map(h => `${h.role}: ${h.content}`).join("\n");
    const moderation = await moderateJordanResponse(reply, conversationContext, sessionDbId);
    
    if (!moderation.safe) {
      console.warn("Response blocked by moderation:", moderation.reason);
      reply = moderation.finalResponse;
    }

    // 8) Add Jordan's response separately (user message already visible)
    setHistory(h => [...h, { role: "assistant", content: reply }]);
    setBusy(false);
    setCooldown(!!coachTip);
  }

  async function endSession() {
    setEnded(true);
    
    // Mark session as completed in database
    if (sessionDbId && sessionToken) {
      await supabase.from("sessions").update({
        ended_at: new Date().toISOString(),
        session_token: sessionToken,
      }).eq("id", sessionDbId).eq("session_token", sessionToken);

      await supabase.from("session_metadata").update({
        completion_status: "completed",
        session_token: sessionToken,
      }).eq("session_id", sessionDbId).eq("session_token", sessionToken);
    }
  }

  async function handleStartConversation(setupData: Setup) {
    setSetup(setupData);
    setShowSetup(false);
    
    const dbId = await createSession();
    if (dbId) {
      setHistory([{ role: "assistant", content: openingLine(setupData.scene) }]);
    } else {
      toast({
        title: "Session creation failed",
        description: "Could not create session. Continuing without logging.",
        variant: "destructive",
      });
      setHistory([{ role: "assistant", content: openingLine(setupData.scene) }]);
    }
  }

  function copySessionId() {
    navigator.clipboard.writeText(sessionId).then(() => {
      setSessionCopied(true);
      toast({
        title: "Session ID copied!",
        description: "Paste it into the feedback form.",
      });
      setTimeout(() => setSessionCopied(false), 3000);
    }).catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = sessionId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setSessionCopied(true);
      toast({
        title: "Session ID copied!",
        description: "Paste it into the feedback form.",
      });
      setTimeout(() => setSessionCopied(false), 3000);
    });
  }

  async function handleCrisisSelection(choice: "support_needed" | "false_positive" | "restart", zip?: string) {
    // Update database with user's choice
    if (sessionDbId) {
      await supabase
        .from("sessions")
        .update({ 
          crisis_user_selection: choice,
        })
        .eq("id", sessionDbId)
        .eq("session_token", sessionToken);
    }

    // Handle different selections
    if (choice === "support_needed") {
      // User wants resources - they can follow the links in the modal
      // Keep modal open for them to use the resources
      if (zip) {
        toast({
          title: "Local resources",
          description: `Check the modal for resources in ${zip}. You can also call 988 anytime.`,
        });
      }
    } else if (choice === "false_positive" || choice === "restart") {
      // User says it was a mistake or wants to restart - close modal and allow new session
      setShowCrisisModal(false);
      reset();
    }
  }

  return (
    <>
      <SetupDialog open={showSetup} onStartConversation={handleStartConversation} />
      
      {/* Crisis Modal - System-level intervention */}
      {showCrisisModal && <CrisisModal onSelection={handleCrisisSelection} />}
      
      
      {/* Full-Screen Chat Interface - Gen Z Modern Design */}
      <div className="h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
        {/* Minimal Header */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-11 w-11 border-2 border-primary/10 bg-gradient-to-br from-primary/20 to-accent/20">
              <AvatarFallback className="bg-transparent text-primary font-bold text-xl">
                J
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold text-lg text-foreground">Jordan</h2>
              <p className="text-xs text-muted-foreground">
                {setup.scene} • {Math.floor(history.length / 2)} exchanges
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!ended && history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={endSession} className="hover:bg-muted">
                End
              </Button>
            )}
            {history.length > 0 && (
              <Button variant="ghost" size="icon" onClick={reset} className="hover:bg-muted">
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Messages Area - Clean and spacious */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-0">
            {history.map((t, i) => {
              const previousTurn = i > 0 ? history[i - 1] : null;
              const isGrouped = previousTurn?.role === t.role;
              
              return (
                <div key={i} className="animate-slide-in">
                  <MessageBubble 
                    role={t.role} 
                    content={t.content}
                    isGrouped={isGrouped}
                  />
                  {t.coachTip && (
                    <div className="mt-3 mb-5">
                      <CoachTip content={t.coachTip} isCrisis={t.coachTip.includes("988")} />
                    </div>
                  )}
                </div>
              );
            })}
            
            {busy && (
              <div className="mt-4">
                <TypingIndicator />
              </div>
            )}
            
            {pauseWarning && !busy && !ended && (
              <div className="mt-5">
                <CoachTip 
                  content="Taking your time to think is great! In real conversations, a brief pause is natural, but if you're stuck, try commenting on something around you or asking an open question like 'What brings you here today?'" 
                />
              </div>
            )}
            
            {ended && (
              <div className="mt-12 space-y-8 animate-fade-in">
                <SessionSummary
                  summary={{
                    practiced: summary.wentWell,
                    improve: [summary.nextStep],
                    sampleLine: summary.sampleLine || getSampleLine()
                  }}
                  onReset={reset}
                  sessionId={sessionId}
                  sessionCopied={sessionCopied}
                  onCopySessionId={copySessionId}
                />
                
                {sessionId && (
                  <div className="p-8 rounded-3xl border border-border/50 bg-gradient-to-br from-background to-muted/30 clean-shadow">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-4 rounded-2xl bg-primary/10">
                        <span className="text-3xl">💬</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-xl">Share Your Experience</h3>
                        <p className="text-sm text-muted-foreground mt-1">Help us make Jordan better for everyone</p>
                      </div>
                    </div>
                    <a
                      href="https://docs.google.com/forms/d/e/1FAIpQLSd4iiR_gPEfwsK4_ZrGGFzCx-g3xILDQwY47sJ2MA9WAt9brA/viewform?usp=header"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button 
                        className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity rounded-2xl"
                        size="lg"
                      >
                        Give Feedback
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area - Clean, elevated */}
        {!ended && history.length > 0 && (
          <div className="border-t border-border/50 bg-background/95 backdrop-blur-md px-4 md:px-6 py-5 shrink-0 elevated-shadow">
            <div className="max-w-3xl mx-auto flex gap-3">
              <Textarea
                ref={inputRef}
                rows={1}
                className="flex-1 min-h-[56px] max-h-[120px] resize-none bg-muted/40 border-border/50 focus:border-primary/50 focus:bg-background text-base px-5 py-4 rounded-2xl transition-all overflow-y-auto"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { 
                  if (e.key === "Enter" && !e.shiftKey) { 
                    e.preventDefault(); 
                    send(); 
                  }
                }}
                disabled={busy}
              />
              <Button
                onClick={send}
                disabled={busy || !input.trim()}
                size="lg"
                className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent hover:opacity-90 transition-opacity p-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// --- Helpers ---
function openingLine(scene: Scene) {
  switch(scene){
    case "coffee": return "Hey — this line moves fast here. What do you usually order?";
    case "campus": return "Orientation's wild. What are you hoping to check out first?";
    default: return "That stack looks good — anything you'd recommend?";
  }
}

function shouldStallNudge(history: Turn[]) {
  const last4 = history.slice(-4);
  const userOnly = last4.filter(h => h.role === "user").map(h => h.content.trim());
  if (userOnly.length < 2) return false;
  const neutralish = (s:string)=> s.split(" ").length < 8 && !/[?]/.test(s);
  return userOnly.slice(-2).every(neutralish);
}

function makeSummary(history: Turn[]) {
  const userMsgs = history.filter(h => h.role === 'user');
  const jordanMsgs = history.filter(h => h.role === 'assistant');
  const coachTips = history.filter(h => h.role === 'user' && h.coachTip).map(h => h.coachTip);
  
  const userQCount = userMsgs.filter(msg => /\?/.test(msg.content)).length;
  const jordanQCount = jordanMsgs.filter(msg => /\?/.test(msg.content)).length;
  
  // What they practiced (basic completion metrics)
  const practiced = ["small talk practice"];
  if (history.length > 6) practiced.push("multi-turn conversation");
  if (history.length >= 10) practiced.push("sustained engagement");
  
  // What went well - analyze their strengths
  const wentWell = [] as string[];
  const reciprocityScore = userMsgs.length > 0 ? userQCount / userMsgs.length : 0;
  const avgUserMsgLength = userMsgs.reduce((sum, msg) => sum + msg.content.trim().split(/\s+/).length, 0) / (userMsgs.length || 1);
  
  if (userQCount >= 3) wentWell.push("Asked multiple questions to show interest");
  else if (userQCount >= 2) wentWell.push("Asked questions back");
  
  if (avgUserMsgLength >= 10) wentWell.push("Shared thoughtful responses");
  else if (avgUserMsgLength >= 5) wentWell.push("Gave substantive answers");
  
  if (reciprocityScore >= 0.4) wentWell.push("Showed genuine curiosity");
  if (history.length >= 6 && userQCount >= 2) wentWell.push("Maintained conversational flow");
  
  // Identify the LARGEST area for growth based on coaching received
  let largestGrowthArea = "";
  
  // Count coaching themes
  const coachingThemes = {
    reciprocity: coachTips.filter(tip => tip && /ask.*question|reciprocity|what could you ask/i.test(tip)).length,
    shortAnswers: coachTips.filter(tip => tip && /short|brief|elaborate/i.test(tip)).length,
    notListening: coachTips.filter(tip => tip && /already told|not listening|asked you a question/i.test(tip)).length,
    exitCues: coachTips.filter(tip => tip && /winding down|say goodbye|exit/i.test(tip)).length,
    interviewing: coachTips.filter(tip => tip && /interview|commenting on.*answer/i.test(tip)).length
  };
  
  // Find the most common issue
  const maxCoaching = Math.max(...Object.values(coachingThemes));
  
  if (maxCoaching === 0) {
    // No coaching given - analyze behavior directly
    if (userQCount === 0 && userMsgs.length >= 3) {
      largestGrowthArea = "Ask questions to show interest and keep the conversation balanced";
    } else if (jordanQCount > userQCount * 2) {
      largestGrowthArea = "Balance asking and sharing — try asking more questions to show engagement";
    } else if (avgUserMsgLength < 5) {
      largestGrowthArea = "Elaborate more on your answers to give the conversation depth";
    } else {
      largestGrowthArea = "Practice recognizing when it's time to wrap up the conversation";
    }
  } else {
    // Use the most frequent coaching theme
    if (coachingThemes.reciprocity === maxCoaching) {
      largestGrowthArea = "Ask more questions to show interest and create balance in conversations";
    } else if (coachingThemes.shortAnswers === maxCoaching) {
      largestGrowthArea = "Expand your responses with more detail to keep conversations engaging";
    } else if (coachingThemes.notListening === maxCoaching) {
      largestGrowthArea = "Practice active listening — respond to what the other person shares";
    } else if (coachingThemes.exitCues === maxCoaching) {
      largestGrowthArea = "Learn to recognize and respond to conversation wind-down cues";
    } else if (coachingThemes.interviewing === maxCoaching) {
      largestGrowthArea = "Comment on answers before asking follow-up questions to avoid sounding like an interview";
    }
  }
  
  const sampleText = getSampleLine();
  return { 
    practiced, 
    wentWell, 
    nextStep: largestGrowthArea, 
    sampleLine: sampleText 
  };
}

function getSampleLine(){
  return "Mind if I ask what you're reading lately?";
}
