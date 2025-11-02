import React, { useMemo, useState, useEffect, useRef } from "react";
import { DEFAULTS, SCENES, type Scene } from "./constants";
import { detectTriggers, prioritize, coachMessageFor, crisisBanner, moderateJordanResponse } from "./guardrails";
import { lovableChat, openaiChat, mockChat, type ChatMessage } from "./llmAdapters";
import { buildSystemPrompt, makeMessages, chatOpts } from "./JordanEngine";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, RotateCcw } from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { CoachTip } from "@/components/CoachTip";
import { SessionSummary } from "@/components/SessionSummary";

// --- Types ---
interface Turn { role: "user"|"assistant"; content: string; coachTip?: string }
interface Setup { scene: Scene; interlocutor: "he"|"she"|"they"|"neutral"; zip?: string; ageConfirmed: boolean }

type Adapter = "lovable"|"openai"|"mock";

// --- Component ---
export default function App() {
  const { toast } = useToast();
  
  // Setup state
  const [setup, setSetup] = useState<Setup>({ scene: DEFAULTS.scene, interlocutor: "neutral", ageConfirmed: false });
  const adapter: Adapter = "lovable"; // Fixed to Lovable

  // Conversation state
  const [history, setHistory] = useState<Turn[]>(() => {
    const saved = localStorage.getItem("jordan-conversation");
    return saved ? JSON.parse(saved) : [];
  });
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

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist conversation to localStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("jordan-conversation", JSON.stringify(history));
    }
  }, [history]);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (history.length > 0 && chatRef.current) {
      chatRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [history]);

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

  const canStart = setup.ageConfirmed && !!setup.scene && !!setup.interlocutor;

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

  async function handleStartConversation() {
    const dbId = await createSession();
    if (dbId) {
      setHistory(h => [...h, { role: "assistant", content: openingLine(setup.scene) }]);
    } else {
      toast({
        title: "Session creation failed",
        description: "Could not create session. Continuing without logging.",
        variant: "destructive",
      });
      setHistory(h => [...h, { role: "assistant", content: openingLine(setup.scene) }]);
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
      // Fallback for browsers that don't support clipboard API
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
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 pt-4 animate-fade-in">
          <div className="flex items-center justify-center">
            <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 soft-glow">
              <MessageCircle className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-medium tracking-tight text-foreground">Jordan</h1>
          <p className="text-sm text-muted-foreground">Practice conversations in a safe space</p>
        </div>

        {/* Setup Card */}
        {history.length === 0 && !ended && (
          <Card className="border-0 warm-shadow backdrop-blur-sm bg-gradient-to-br from-card via-card to-card/80 animate-fade-in overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>
            <CardHeader className="space-y-3 relative z-10">
              <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Let's Get Started
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Welcome! Jordan helps you practice everyday conversations in a low-pressure space. Remember, this is just for practice—not therapy or advice. If you're in the US and need support, call or text 988.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-background/80 to-background/40 border border-border/30 warm-shadow">
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="text-lg">📍</span> Scene
                  </Label>
                  <Select value={setup.scene} onValueChange={(v) => setSetup(s => ({ ...s, scene: v as Scene }))}>
                    <SelectTrigger className="bg-background border-border/50 h-11 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-background/80 to-background/40 border border-border/30 warm-shadow">
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="text-lg">👤</span> Jordan's Pronouns
                  </Label>
                  <Select value={setup.interlocutor} onValueChange={(v) => setSetup(s => ({ ...s, interlocutor: v as any }))}>
                    <SelectTrigger className="bg-background border-border/50 h-11 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="she">She/Her</SelectItem>
                      <SelectItem value="he">He/Him</SelectItem>
                      <SelectItem value="they">They/Them</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 p-4 rounded-xl bg-gradient-to-br from-background/80 to-background/40 border border-border/30 warm-shadow">
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="text-lg">📮</span> ZIP (Optional)
                  </Label>
                  <Input 
                    className="bg-background border-border/50 shadow-sm h-11" 
                    placeholder="e.g., 80550" 
                    value={setup.zip || ""} 
                    onChange={e => setSetup(s => ({ ...s, zip: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center pt-3 p-4 rounded-xl bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/20">
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="age-confirm" 
                    checked={setup.ageConfirmed} 
                    onCheckedChange={(checked) => setSetup(s => ({ ...s, ageConfirmed: checked as boolean }))}
                    className="border-2"
                  />
                  <Label htmlFor="age-confirm" className="text-sm font-medium cursor-pointer">
                    I'm 18 years or older and ready to practice
                  </Label>
                </div>
                <Button 
                  disabled={!canStart} 
                  onClick={handleStartConversation}
                  className="ml-auto shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  size="lg"
                >
                  Start Conversation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chat Transcript */}
        <div ref={chatRef}>
        <Card className="border-0 warm-shadow backdrop-blur-sm bg-card/90 min-h-[450px] relative overflow-hidden">
          {/* Subtle ambient animation */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50 animate-pulse" style={{ animationDuration: "4s" }}></div>
          
          <CardContent className="p-6 md:p-8 space-y-5 relative z-10">
            {history.length === 0 && !ended && (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground/50 text-sm">
                Your conversation will appear here...
              </div>
            )}
            
            {history.map((t, i) => (
              <div key={i} className="space-y-3">
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
          </CardContent>
        </Card>
        </div>

        {/* Input Area */}
        {!ended && history.length > 0 && (
          <Card className={`border-0 warm-shadow backdrop-blur-sm bg-card/90 transition-all ${!busy && !input.trim() ? 'soft-glow' : ''}`}>
            <CardContent className="p-4 space-y-3">
              {/* Progress Indicator */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{Math.floor(history.length / 2)} exchanges</span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, Math.ceil(history.length / 4)) }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}></div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2.5">
                <Input 
                  ref={inputRef}
                  className="flex-1 h-12 bg-background/50 border-border/50 transition-all focus:border-primary/50 text-base" 
                  placeholder="Type your message..." 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) send(); }}
                  disabled={busy}
                />
                <Button 
                  onClick={send} 
                  disabled={busy || !input.trim()} 
                  size="lg" 
                  className="h-12 px-6 shadow-lg bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={endSession} 
                  disabled={history.length === 0} 
                  size="sm"
                  className="flex-1"
                >
                  End Session
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={reset} 
                  size="sm"
                  className="flex-1"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {ended && (
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
        )}

        {/* Google Form Feedback - Only show when session ended */}
        {ended && sessionId && (
          <Card className="border-2 border-accent/30 warm-shadow backdrop-blur-sm bg-gradient-to-br from-card via-card to-accent/5 animate-fade-in overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none"></div>
            
            <CardHeader className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20">
                  <span className="text-2xl">📋</span>
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold">Help Us Improve</CardTitle>
                  <CardDescription className="mt-1">
                    Your feedback makes Jordan better for everyone
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-5 relative z-10">
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSd4iiR_gPEfwsK4_ZrGGFzCx-g3xILDQwY47sJ2MA9WAt9brA/viewform?usp=header"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button 
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]" 
                  size="lg"
                >
                  Open Feedback Form →
                </Button>
              </a>

              <p className="text-sm text-muted-foreground text-center">
                Anonymous responses help us identify issues and improve the experience
              </p>
            </CardContent>
          </Card>
        )}

        {/* Utilities */}
        {history.length > 0 && (
          <div className="flex justify-center pb-8">
            <Button variant="ghost" size="sm" onClick={() => copyTranscript(history)} className="text-muted-foreground hover:text-foreground">
              <span className="mr-2">📋</span> Copy transcript
            </Button>
          </div>
        )}
      </div>
    </div>
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

function tooShortOrLong(s: string) {
  const w = s.trim().split(/\s+/).length; return w < 3 || w > 30;
}

function copyTranscript(history: Turn[]) {
  const text = history.map(h => `${h.role.toUpperCase()}: ${h.content}${h.coachTip?`\n[Coach: ${h.coachTip}]`:""}`).join("\n\n");
  navigator.clipboard.writeText(text);
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
