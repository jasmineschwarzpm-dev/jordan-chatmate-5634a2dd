import React, { useMemo, useState, useEffect } from "react";
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

  // Persist conversation to localStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("jordan-conversation", JSON.stringify(history));
    }
  }, [history]);

  const summary = useMemo(() => makeSummary(history), [history]);

  function reset() { 
    setHistory([]); 
    setInput(""); 
    setEnded(false); 
    setCooldown(false); 
    localStorage.removeItem("jordan-conversation");
  }

  const canStart = setup.ageConfirmed && !!setup.scene && !!setup.interlocutor;

  async function send() {
    if (!input.trim() || busy || ended) return;
    const userText = input.trim();
    setInput("");
    setBusy(true);

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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in">
          <h1 className="text-3xl font-light tracking-tight text-foreground">Jordan</h1>
          <p className="text-sm text-muted-foreground">Your conversation practice partner</p>
        </div>

        {/* Setup Card */}
        {history.length === 0 && !ended && (
          <Card className="border-border/50 shadow-sm animate-fade-in">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Get Started</CardTitle>
              <CardDescription className="text-sm">
                Welcome! Jordan helps you practice everyday conversations in a low-pressure space. Remember, this is just for practice—not therapy or advice. If you're in the US and need support, call or text 988.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Scene</Label>
                  <Select value={setup.scene} onValueChange={(v) => setSetup(s => ({ ...s, scene: v as Scene }))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Jordan's gender</Label>
                  <Select value={setup.interlocutor} onValueChange={(v) => setSetup(s => ({ ...s, interlocutor: v as any }))}>
                    <SelectTrigger className="bg-background">
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
                    I'm 18 or older and ready to practice
                  </Label>
                </div>
                <Button 
                  disabled={!canStart} 
                  onClick={() => setHistory(h => [...h, { role: "assistant", content: openingLine(setup.scene) }])}
                  className="ml-auto"
                >
                  Start Conversation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chat Transcript */}
        <Card className="border-border/50 shadow-sm min-h-[400px]">
          <CardContent className="p-6 space-y-4">
            {history.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                <div className="max-w-[80%] space-y-1">
                  <div className={`px-4 py-3 rounded-2xl ${
                    t.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-card border border-border"
                  }`}>
                    {t.content}
                  </div>
                  {t.coachTip && (
                    <div className="text-xs text-muted-foreground px-2 italic">
                      💡 Coach: {t.coachTip}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-card border border-border px-4 py-3 rounded-2xl text-muted-foreground italic">
                  Jordan is typing...
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Input Area */}
        {!ended && history.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input 
                  className="flex-1" 
                  placeholder="Type your message..." 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) send(); }}
                  disabled={busy}
                />
                <Button onClick={send} disabled={busy || !input.trim()}>Send</Button>
                <Button variant="outline" onClick={endSession} disabled={history.length === 0}>End</Button>
                <Button variant="ghost" onClick={reset}>Reset</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {ended && (
          <Card className="border-border/50 shadow-sm animate-fade-in">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Session Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <p><span className="font-medium text-muted-foreground">Practiced:</span> {summary.practiced.join(", ") || "opener, small talk, exit"}</p>
                <p><span className="font-medium text-muted-foreground">Went well:</span> {summary.wentWell.join("; ") || "kept it polite and on-topic"}</p>
                <p><span className="font-medium text-muted-foreground">Improve next:</span> {summary.nextStep || "add an open question by turn 3"}</p>
                <p><span className="font-medium text-muted-foreground">Sample line:</span> "{summary.sampleLine || getSampleLine()}"</p>
              </div>
              <Button onClick={reset} variant="outline" className="mt-4">Try Again</Button>
            </CardContent>
          </Card>
        )}

        {/* Utilities */}
        {history.length > 0 && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => copyTranscript(history)}>
              📋 Copy transcript
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
