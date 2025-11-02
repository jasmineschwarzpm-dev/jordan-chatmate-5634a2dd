import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageCircle, ArrowRight } from "lucide-react";
import { SCENES, type Scene } from "@/pages/constants";

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
  const [interlocutor, setInterlocutor] = useState<"he" | "she" | "they" | "neutral">("neutral");
  const [zip, setZip] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const canStart = ageConfirmed && !!scene && !!interlocutor;

  const handleStart = () => {
    if (canStart) {
      onStartConversation({ scene, interlocutor, zip: zip || undefined, ageConfirmed });
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm">
              <MessageCircle className="w-12 h-12 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-3xl font-semibold text-center">
            Practice with Jordan
          </DialogTitle>
          <DialogDescription className="text-center text-base leading-relaxed">
            A safe space to build confidence in everyday conversations. No pressure, just practice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          <div className="p-6 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/30">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Welcome! Jordan helps you practice everyday conversations in a low-pressure space. This is for practice—not therapy or advice. If you're in the US and need support, call or text 988.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <span className="text-xl">📍</span> Scene
              </Label>
              <Select value={scene} onValueChange={(v) => setScene(v as Scene)}>
                <SelectTrigger className="h-12 text-base">
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
              <Label className="text-base font-semibold flex items-center gap-2">
                <span className="text-xl">👤</span> Jordan's Pronouns
              </Label>
              <Select value={interlocutor} onValueChange={(v) => setInterlocutor(v as any)}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral" className="text-base">Neutral</SelectItem>
                  <SelectItem value="she" className="text-base">She/Her</SelectItem>
                  <SelectItem value="he" className="text-base">He/Him</SelectItem>
                  <SelectItem value="they" className="text-base">They/Them</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <span className="text-xl">📮</span> ZIP Code (Optional)
            </Label>
            <Input
              className="h-12 text-base"
              placeholder="e.g., 80550"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/20">
            <div className="flex items-start gap-3">
              <Checkbox
                id="age-confirm"
                checked={ageConfirmed}
                onCheckedChange={(checked) => setAgeConfirmed(checked as boolean)}
                className="border-2 mt-1"
              />
              <Label htmlFor="age-confirm" className="text-base font-medium cursor-pointer leading-relaxed">
                I'm 18 years or older and ready to practice
              </Label>
            </div>
            <Button
              disabled={!canStart}
              onClick={handleStart}
              className="w-full shadow-lg hover:shadow-xl transition-all hover:scale-105 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 h-12 text-base"
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
