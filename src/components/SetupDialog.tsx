import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
    ageConfirmed: boolean;
  }) => void;
}

export const SetupDialog = ({ open, onStartConversation }: SetupDialogProps) => {
  const [page, setPage] = useState<1 | 2>(1);
  const [scene, setScene] = useState<Scene>("bookstore");
  const [interlocutor, setInterlocutor] = useState<"he" | "she" | "they" | "neutral">("they");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showResources, setShowResources] = useState(false);

  const canProceedToPage2 = !!scene && !!interlocutor;
  const canStart = ageConfirmed;

  const handleNext = () => {
    if (canProceedToPage2) {
      setPage(2);
    }
  };

  const handleStart = () => {
    if (canStart) {
      onStartConversation({ scene, interlocutor, ageConfirmed });
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md border-border/50 rounded-3xl p-8">
        {page === 1 ? (
          // PAGE 1: Scene & Pronoun Selection
          <>
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-3xl font-bold text-center bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                Practice with Jordan
              </DialogTitle>
              <DialogDescription className="text-center text-base leading-relaxed text-muted-foreground">
                A safe space to build confidence in everyday conversations
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center my-6">
              <div className="p-4 rounded-full bg-gradient-to-br from-primary/15 to-accent/15">
                <MessageCircle className="w-12 h-12 text-primary" strokeWidth={1.5} />
              </div>
            </div>

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

              <Button
                disabled={!canProceedToPage2}
                onClick={handleNext}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity rounded-2xl mt-2"
              >
                Next
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </>
        ) : (
          // PAGE 2: Age Confirmation & Practice Notice
          <>
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-2xl font-bold text-center text-foreground">
                Before we start
              </DialogTitle>
              <DialogDescription className="text-center text-sm leading-relaxed text-muted-foreground">
                Quick reminder about what Jordan is for
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-6">
              <div className="flex items-start gap-3 p-5 rounded-xl bg-primary/5 border border-primary/10">
                <Checkbox
                  id="age-confirm"
                  checked={ageConfirmed}
                  onCheckedChange={(checked) => setAgeConfirmed(checked as boolean)}
                  className="border-2 mt-0.5"
                />
                <div className="flex-1 space-y-3">
                  <Label htmlFor="age-confirm" className="text-sm font-medium cursor-pointer leading-relaxed">
                    I'm 18 years or older and understand Jordan is for practice
                  </Label>
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                      Jordan helps you practice small talk—not crisis support or therapy.
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

              <div className="flex gap-3">
                <Button
                  onClick={() => setPage(1)}
                  variant="outline"
                  className="flex-1 h-12 text-base font-medium rounded-2xl"
                >
                  Back
                </Button>
                <Button
                  disabled={!canStart}
                  onClick={handleStart}
                  className="flex-1 h-12 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity rounded-2xl"
                >
                  Start Conversation
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
