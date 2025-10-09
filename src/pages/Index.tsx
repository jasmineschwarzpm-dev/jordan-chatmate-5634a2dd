import React, { useMemo, useState } from "react";
import { DEFAULTS, SCENES, type Scene } from "./constants";
import { detectTriggers, prioritize, coachMessageFor, crisisBanner } from "./guardrails";
import { lovableChat, openaiChat, mockChat, type ChatMessage } from "./llmAdapters";
import { buildSystemPrompt, makeMessages, chatOpts } from "./JordanEngine";

// --- Types ---
interface Turn { role: "user"|"assistant"; content: string; coachTip?: string }
interface Setup { scene: Scene; interlocutor: "he"|"she"|"they"|"neutral"; zip?: string; ageConfirmed: boolean }

type Adapter = "lovable"|"openai"|"mock";

// --- Component ---
export default function App() {
  // Setup state
  const [setup, setSetup] = useState<Setup>({ scene: DEFAULTS.scene, interlocutor: "neutral", ageConfirmed: false });
  const adapter: Adapter = "lovable"; // Fixed to Lovable

  // Conversation state
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => makeSummary(history), [history]);

  function reset() { setHistory([]); setInput(""); setEnded(false); setCooldown(false); }

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
        if (wordCount < 5) {
          coachTip = "Your message was very brief. Try elaborating a bit and asking a question to keep the conversation going.";
        } else if (wordCount > 30) {
          coachTip = "That's a bit long for casual small talk. Keep it concise (5-20 words) and include a question.";
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
      reply = "(Generator unavailable) Let's keep it simple—what's one thing you've been reading or watching lately?";
    }

    // 6) Commit (coach tip attached to user message, appears before Jordan's reply)
    setHistory(h => [...h, { role: "user", content: userText, coachTip }, { role: "assistant", content: reply }]);
    setBusy(false);
    setCooldown(!!coachTip);
  }

  function endSession() { setEnded(true); }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4 text-sm">
      <h1 className="text-xl font-semibold">SkillBuilder — Jordan (Stage‑1)</h1>

      {/* Setup */}
      {history.length === 0 && !ended && (
        <div className="border rounded p-3 space-y-3">
          <p><strong>For testers (18+):</strong> Jordan is a conversation practice partner, not a therapist or advisor. No PII. US: crisis support at 988.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">Scene
              <select className="w-full border rounded p-2" value={setup.scene} onChange={e=>setSetup(s=>({...s, scene: e.target.value as Scene}))}>
                {SCENES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">Jordan's gender
              <select className="w-full border rounded p-2" value={setup.interlocutor} onChange={e=>setSetup(s=>({...s, interlocutor: e.target.value as any}))}>
                <option value="neutral">neutral</option>
                <option value="she">she/her</option>
                <option value="he">he/him</option>
                <option value="they">they/them</option>
              </select>
            </label>
            <label className="block">ZIP (optional)
              <input className="w-full border rounded p-2" placeholder="e.g., 80550" value={setup.zip||""} onChange={e=>setSetup(s=>({...s, zip: e.target.value}))}/>
            </label>
          </div>
          <div className="flex gap-3 items-center">
            <label className="inline-flex items-center space-x-2">
              <input type="checkbox" checked={setup.ageConfirmed} onChange={e=>setSetup(s=>({...s, ageConfirmed: e.target.checked}))}/>
              <span>I confirm I'm 18+ and agree to no‑PII testing.</span>
            </label>
            <button disabled={!canStart} className="border rounded px-3 py-2 disabled:opacity-50" onClick={()=>setHistory(h=>[...h, { role: "assistant", content: openingLine(setup.scene) }])}>Start</button>
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="border rounded p-3 space-y-3 min-h-[200px]">
        {history.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
            <div className={"inline-block px-3 py-2 rounded " + (t.role === "user" ? "bg-blue-50" : "bg-gray-50")}>{t.content}</div>
            {t.coachTip && (<div className="text-xs text-gray-600 mt-1">[Coach: {t.coachTip}]</div>)}
          </div>
        ))}
      </div>

      {/* Input */}
      {!ended && (
        <div className="flex gap-2">
          <input className="flex-1 border rounded p-2" placeholder="Your message" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if (e.key === "Enter") send(); }}/>
          <button className="border rounded px-3" onClick={send} disabled={busy || !input.trim()}>Send</button>
          <button className="border rounded px-3" onClick={endSession} disabled={history.length===0}>End</button>
          <button className="border rounded px-3" onClick={reset}>Reset</button>
        </div>
      )}

      {/* Summary */}
      {ended && (
        <div className="border rounded p-3 space-y-2">
          <h2 className="font-semibold">Session Summary</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li><strong>Practiced:</strong> {summary.practiced.join(", ") || "opener, small talk, exit"}</li>
            <li><strong>Went well:</strong> {summary.wentWell.join("; ") || "kept it polite and on-topic"}</li>
            <li><strong>Improve next:</strong> {summary.nextStep || "add an open question by turn 3"}</li>
            <li><strong>Sample line:</strong> "{summary.sampleLine || getSampleLine()}"</li>
          </ul>
          <div className="flex gap-2">
            <button className="border rounded px-3" onClick={reset}>Try Again</button>
          </div>
        </div>
      )}

      {/* Utilities */}
      <div className="flex gap-2">
        <button className="border rounded px-3" onClick={()=>copyTranscript(history)}>Copy transcript</button>
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
