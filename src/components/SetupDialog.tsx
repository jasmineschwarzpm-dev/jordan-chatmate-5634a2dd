import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageCircle, ArrowRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { SCENES, type Scene } from "@/pages/constants";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SetupDialogProps {
  open: boolean;
  onStartConversation: (setup: {
    scene: Scene;
    interlocutor: "he" | "she" | "they" | "neutral";
    zip?: string;
    ageConfirmed: boolean;
  }) => void;
}

export const SetupDialog = ({ open, onStartConversation }: SetupDialogProps) => {
  const [scene, setScene] = useState<Scene>("bookstore");
  const [interlocutor, setInterlocutor] = useState<"he" | "she" | "they" | "neutral">("they");
  const [zip, setZip] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showResources, setShowResources] = useState(false);

  const canStart = ageConfirmed && !!scene && !!interlocutor;

  const handleStart = () => {
    if (canStart) {
      onStartConversation({ scene, interlocutor, zip: zip || undefined, ageConfirmed });
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-border/50 rounded-3xl p-8">
        <DialogHeader className="space-y-6">
          <div className="flex justify-center">
            <div className="p-5 rounded-full bg-gradient-to-br from-primary/15 to-accent/15">
              <MessageCircle className="w-14 h-14 text-primary" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-4xl font-bold text-center bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
              Practice with Jordan
            </DialogTitle>
            <DialogDescription className="text-center text-base leading-relaxed text-muted-foreground">
              A safe space to build confidence in everyday conversations
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-8">
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">
                Choose a scene
              </Label>
              <Select value={scene} onValueChange={(v) => setScene(v as Scene)}>
                <SelectTrigger className="h-12 text-base border-border/50 rounded-xl capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize text-base">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">
                Jordan's pronouns
              </Label>
              <Select value={interlocutor} onValueChange={(v) => setInterlocutor(v as any)}>
                <SelectTrigger className="h-12 text-base border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="she" className="text-base">She/Her</SelectItem>
                  <SelectItem value="he" className="text-base">He/Him</SelectItem>
                  <SelectItem value="they" className="text-base">They/Them</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">
                ZIP code <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                className="h-12 text-base border-border/50 rounded-xl"
                placeholder="e.g., 12345"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5">
              <Checkbox
                id="age-confirm"
                checked={ageConfirmed}
                onCheckedChange={(checked) => setAgeConfirmed(checked as boolean)}
                className="border-2 mt-0.5"
              />
              <div className="flex-1 space-y-3">
                <Label htmlFor="age-confirm" className="text-sm font-medium cursor-pointer leading-relaxed">
                  I'm 18 years or older and ready to practice
                </Label>
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    Jordan is for practice—not crisis support or therapy.
                  </p>
                  <Collapsible open={showResources} onOpenChange={setShowResources}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      {showResources ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {showResources ? "Hide" : "Show"} support resources
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-2">
                      <div className="text-xs space-y-1.5 text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">988</span> 
                          <span>— Suicide & Crisis Lifeline (call or text)</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">741741</span> 
                          <span>— Crisis Text Line (text "HELLO")</span>
                        </p>
                        <a 
                          href="https://findtreatment.gov" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-primary hover:underline pt-1"
                        >
                          <span>Find local mental health resources</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </div>
            <Button
              disabled={!canStart}
              onClick={handleStart}
              className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity rounded-2xl"
              size="lg"
            >
              Start Conversation
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
