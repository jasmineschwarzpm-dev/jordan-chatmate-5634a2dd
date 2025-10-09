import React, { useMemo, useState, useEffect, useRef } from "react";
import { DEFAULTS, SCENES, type Scene } from "./constants";
import { detectTriggers, prioritize, coachMessageFor, crisisBanner } from "./guardrails";
import { lovableChat, openaiChat, mockChat, type ChatMessage } from "./llmAdapters";
import { buildSystemPrompt, makeMessages, chatOpts } from "./JordanEngine";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist conversation to localStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("jordan-conversation", JSON.stringify(history));
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

  // Auto-scroll to chat when conversation starts
  useEffect(() => {
    if (history.length > 0 && chatRef.current) {
      chatRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus();
    }
  }, [history.length > 0]);

  const summary = useMemo(() => makeSummary(history), [history]);

  function reset() { 
    setHistory([]); 
    setInput(""); 
    setEnded(false); 
    setCooldown(false); 
    setPauseWarning(false);
    setLastResponseTime(null);
    localStorage.removeItem("jordan-conversation");
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

    // 6) Commit (coach tip attached to user message, appears before Jordan's reply)
    setHistory(h => [...h, { role: "user", content: userText, coachTip }, { role: "assistant", content: reply }]);
    setBusy(false);
    setCooldown(!!coachTip);
  }

  function endSession() { setEnded(true); }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 pt-8 animate-fade-in">
          <div className="inline-block p-3 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 mb-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xl font-light">
              J
            </div>
          </div>
          <h1 className="text-4xl font-light tracking-tight text-foreground">Jordan</h1>
        </div>

        {/* Setup Card */}
        {history.length === 0 && !ended && (
          <Card className="border-0 warm-shadow backdrop-blur-sm bg-card/90 animate-fade-in">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl font-medium">Let's get started</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Welcome! Jordan helps you practice everyday conversations in a low-pressure space. Remember, this is just for practice—not therapy or advice. If you're in the US and need support, call or text 988.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Scene</Label>
                  <Select value={setup.scene} onValueChange={(v) => setSetup(s => ({ ...s, scene: v as Scene }))}>
                    <SelectTrigger className="bg-background/50 border-border/50 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Jordan's pronouns</Label>
                  <Select value={setup.interlocutor} onValueChange={(v) => setSetup(s => ({ ...s, interlocutor: v as any }))}>
                    <SelectTrigger className="bg-background/50 border-border/50 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neutral">neutral</SelectItem>
                      <SelectItem value="she">she/her</SelectItem>
                      <SelectItem value="he">he/him</SelectItem>
                      <SelectItem value="they">they/them</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">ZIP (optional)</Label>
                  <Input 
                    className="bg-background" 
                    placeholder="e.g., 80550" 
                    value={setup.zip || ""} 
                    onChange={e => setSetup(s => ({ ...s, zip: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="age-confirm" 
                    checked={setup.ageConfirmed} 
                    onCheckedChange={(checked) => setSetup(s => ({ ...s, ageConfirmed: checked as boolean }))}
                  />
                  <Label htmlFor="age-confirm" className="text-sm font-normal cursor-pointer">
                    I'm 18 years or older and ready to practice
                  </Label>
                </div>
                <Button 
                  disabled={!canStart} 
                  onClick={() => setHistory(h => [...h, { role: "assistant", content: openingLine(setup.scene) }])}
                  className="ml-auto shadow-md hover:shadow-lg transition-shadow"
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
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                <div className="max-w-[85%] space-y-2">
                  <div className={`px-5 py-3.5 rounded-3xl transition-all ${
                    t.role === "user" 
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-md" 
                      : "bg-gradient-to-br from-card to-card/80 border border-border/50 shadow-sm"
                  }`}>
                    <p className="leading-relaxed">{t.content}</p>
                  </div>
                  {t.coachTip && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-2xl bg-accent/20 border border-accent/30">
                      <span className="text-base">💡</span>
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                        <span className="font-medium text-foreground/80">Coach:</span> {t.coachTip}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 shadow-sm px-5 py-3.5 rounded-3xl">
                  <span className="text-muted-foreground italic flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                    Jordan is typing...
                  </span>
                </div>
              </div>
            )}
            {pauseWarning && !busy && !ended && (
              <div className="flex justify-center animate-fade-in">
                <div className="px-5 py-3 rounded-2xl bg-accent/20 border border-accent/40 text-sm max-w-md">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">💭 Coach:</span> Taking your time to think is great! In real conversations, a brief pause is natural, but if you're stuck, try commenting on something around you or asking an open question like "What brings you here today?"
                  </p>
                </div>
              </div>
            )}
            {pauseWarning && !busy && !ended && (
              <div className="flex justify-center animate-fade-in">
                <div className="px-5 py-3 rounded-2xl bg-accent/20 border border-accent/40 text-sm max-w-md">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">💭 Coach:</span> Taking your time to think is great! In real conversations, a brief pause is natural, but if you're stuck, try commenting on something around you or asking an open question like "What brings you here today?"
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Input Area */}
        {!ended && history.length > 0 && (
          <Card className={`border-0 warm-shadow backdrop-blur-sm bg-card/90 transition-all ${!busy && !input.trim() ? 'soft-glow' : ''}`}>
            <CardContent className="p-4">
              <div className="flex gap-2.5">
                <Input 
                  ref={inputRef}
                  className="flex-1 h-11 bg-background/50 border-border/50 transition-all focus:border-primary/50" 
                  placeholder="Type your message..." 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) send(); }}
                  disabled={busy}
                />
                <Button onClick={send} disabled={busy || !input.trim()} size="lg" className="shadow-md">Send</Button>
                <Button variant="outline" onClick={endSession} disabled={history.length === 0} size="lg">End</Button>
                <Button variant="ghost" onClick={reset} size="lg">Reset</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {ended && (
          <Card className="border-0 warm-shadow backdrop-blur-sm bg-card/90 animate-fade-in">
            <CardHeader>
              <CardTitle className="text-xl font-medium">Session Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/30">
                  <p className="text-muted-foreground mb-1">Practiced</p>
                  <p className="font-medium">{summary.practiced.join(", ") || "opener, small talk, exit"}</p>
                </div>
                <div className="p-4 rounded-2xl bg-accent/10 border border-accent/30">
                  <p className="text-muted-foreground mb-1">Went well</p>
                  <p className="font-medium">{summary.wentWell.join("; ") || "kept it polite and on-topic"}</p>
                </div>
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30">
                  <p className="text-muted-foreground mb-1">Improve next</p>
                  <p className="font-medium">{summary.nextStep || "add an open question by turn 3"}</p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border/50">
                  <p className="text-muted-foreground mb-1">Sample line to try</p>
                  <p className="font-medium italic">"{summary.sampleLine || getSampleLine()}"</p>
                </div>
              </div>
              <Button onClick={reset} variant="outline" className="mt-4" size="lg">Try Again</Button>
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
