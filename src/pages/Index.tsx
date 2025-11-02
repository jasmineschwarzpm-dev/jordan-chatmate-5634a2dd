import React, { useMemo, useState, useEffect, useRef } from "react";
import { DEFAULTS, type Scene } from "./constants";
import { detectTriggers, prioritize, crisisBanner, moderateJordanResponse } from "./guardrails";
import { lovableChat, openaiChat, mockChat, type ChatMessage } from "./llmAdapters";
import { buildSystemPrompt, makeMessages, chatOpts } from "./JordanEngine";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RotateCcw, X } from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { CoachTip } from "@/components/CoachTip";
import { SessionSummary } from "@/components/SessionSummary";
import { SetupDialog } from "@/components/SetupDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// --- Types ---
interface Turn { role: "user"|"assistant"; content: string; coachTip?: string }
interface Setup { scene: Scene; interlocutor: "he"|"she"|"they"|"neutral"; zip?: string; ageConfirmed: boolean }

type Adapter = "lovable"|"openai"|"mock";

// --- Component ---
export default function App() {
  const { toast } = useToast();
  
  // Setup state
  const [setup, setSetup] = useState<Setup>({ scene: DEFAULTS.scene, interlocutor: "neutral", ageConfirmed: false });
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

  // Session logging state
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionDbId, setSessionDbId] = useState<string | null>(null);
  const [sessionCopied, setSessionCopied] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setPauseWarning(false); // Clear pause warning on send

    // 1) Detect triggers on user text
    const triggers = detectTriggers(userText);
    const main = prioritize(triggers);

    // 2) Crisis: deterministic response + banner; do not call LLM
    if (main.kind === "CRISIS") {
      const banner = await crisisBanner(setup.zip);
      const coachTip = "I'm just for everyday small talk practice. Please reach out to 988 if you're in crisis.";
      setHistory(h => [...h, { role: "user", content: userText, coachTip }, { role: "assistant", content: `I'm here only to practice everyday conversation. ${banner} Would you like to talk about books or coffee?` }]);
      setBusy(false);
      setCooldown(true);
      return;
    }

    // 3) Determine coach tip BEFORE calling LLM (attach to user message)
    let coachTip: string | undefined;
    if (!cooldown) {
      if (main.kind === "PII") {
        coachTip = `Your message contained personal contact info (${main.reason}). Avoid sharing emails, phone numbers, or addresses with strangers. Keep details general.`;
      } else if (main.kind === "CONTROVERSIAL") {
        const topic = triggers.find(t => t.kind === "CONTROVERSIAL")?.reason || "topic";
        coachTip = `"${topic}" can be polarizing for casual small talk. Try a more neutral topic like hobbies, books, or local spots.`;
      } else if (shouldStallNudge(history)) {
        coachTip = "Your last few messages were brief and didn't ask questions. Try adding an open-ended question to keep the conversation flowing.";
      } else {
        const wordCount = userText.trim().split(/\s+/).length;
        const hasQuestion = /\?/.test(userText);
        
        // Only warn about length if it's problematic for conversation flow
        if (wordCount < 5 && !hasQuestion) {
          coachTip = "Your message was very brief. Try elaborating a bit and asking a question to keep the conversation going.";
        } else if (wordCount > 40 && !hasQuestion) {
          coachTip = "That's quite long without a question. In small talk, keep it concise and include a question to invite response.";
        }
      }
    }

    // 4) Build messages for LLM
    const sys = buildSystemPrompt(setup.scene, setup.interlocutor);
    const chatHistory = [...history, { role: "user" as const, content: userText }].map(t => ({ role: t.role, content: t.content }));
    const messages: ChatMessage[] = makeMessages(sys, chatHistory);

    // 5) Call adapter
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

    // 6) Moderate Jordan's response before showing to user
    const conversationContext = history.slice(-5).map(h => `${h.role}: ${h.content}`).join("\n");
    const moderation = await moderateJordanResponse(reply, conversationContext, sessionDbId);
    
    if (!moderation.safe) {
      console.warn("Response blocked by moderation:", moderation.reason);
      reply = moderation.finalResponse;
    }

    // 7) Commit (coach tip attached to user message, appears before Jordan's reply)
    setHistory(h => [...h, { role: "user", content: userText, coachTip }, { role: "assistant", content: reply }]);
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

  return (
    <>
      <SetupDialog open={showSetup} onStartConversation={handleStartConversation} />
      
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
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
            {history.map((t, i) => (
              <div key={i} className="space-y-4 animate-slide-in">
                <MessageBubble role={t.role} content={t.content} />
                {t.coachTip && (
                  <CoachTip content={t.coachTip} isCrisis={t.coachTip.includes("988")} />
                )}
              </div>
            ))}
            
            {busy && <TypingIndicator />}
            
            {pauseWarning && !busy && !ended && (
              <CoachTip 
                content="Taking your time to think is great! In real conversations, a brief pause is natural, but if you're stuck, try commenting on something around you or asking an open question like 'What brings you here today?'" 
              />
            )}
            
            {ended && (
              <div className="mt-12 space-y-8 animate-fade-in">
                <SessionSummary
                  summary={{
                    practiced: summary.practiced,
                    improve: summary.wentWell,
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
              <Input
                ref={inputRef}
                className="flex-1 h-14 bg-muted/40 border-border/50 focus:border-primary/50 focus:bg-background text-base px-5 rounded-2xl transition-all"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
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
  const qCount = history.filter(h=>h.role==='user' && /\?/.test(h.content)).length;
  const practiced = ["opener","small talk"]; if (history.length>6) practiced.push("exit");
  const wentWell = [] as string[];
  if (qCount>=2) wentWell.push("asked open questions");
  if (history.length>=6) wentWell.push("kept momentum");
  const nextStep = qCount>=2?"try ending politely by turn 8":"add an open question by turn 3";
  const sampleText = getSampleLine();
  return { practiced, wentWell, nextStep, sampleLine: sampleText };
}

function getSampleLine(){
  return "Mind if I ask what you're reading lately?";
}
