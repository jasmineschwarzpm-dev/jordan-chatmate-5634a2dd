import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, ExternalLink } from "lucide-react";

interface CrisisModalProps {
  onSelection: (choice: "support_needed" | "false_positive" | "restart", zip?: string) => void;
}

export function CrisisModal({ onSelection }: CrisisModalProps) {
  const [showZipInput, setShowZipInput] = useState(false);
  const [zip, setZip] = useState("");
  const [resourcesShown, setResourcesShown] = useState(false);

  const handleGetSupport = () => {
    if (showZipInput && zip.trim()) {
      // User submitted ZIP - show confirmation and allow closing
      onSelection("support_needed", zip.trim());
      setResourcesShown(true);
    } else if (resourcesShown) {
      // User already saw resources, this closes the modal
      onSelection("restart");
    } else {
      // First click - show ZIP input option
      setShowZipInput(true);
      setResourcesShown(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border-2 border-destructive/50 rounded-2xl shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="mt-1 p-2 bg-destructive/10 rounded-full shrink-0">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Hey, real talk
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              I noticed something in your message that makes me think you might need actual support—not just practice convos.
            </p>
          </div>
        </div>

        {/* Crisis Resources */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            If you're going through something serious right now:
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">Call or text:</span>
              <a 
                href="tel:988" 
                className="text-primary hover:underline font-mono"
              >
                988
              </a>
              <span className="text-muted-foreground">(24/7 Crisis Lifeline)</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">Find treatment:</span>
              <a 
                href="https://findtreatment.gov" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                findtreatment.gov
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Optional ZIP Input */}
          {showZipInput && (
            <div className="pt-3 border-t border-border/50">
              <label htmlFor="zip" className="text-xs text-muted-foreground block mb-2">
                Enter your ZIP code for local resources (optional):
              </label>
              <Input
                id="zip"
                type="text"
                placeholder="e.g., 90210"
                value={zip}
                onChange={(e) => setZip(e.target.value.slice(0, 5))}
                maxLength={5}
                className="text-sm"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button
            onClick={handleGetSupport}
            variant="default"
            className="w-full"
          >
            {resourcesShown 
              ? (showZipInput && !zip.trim() ? "Skip ZIP & Close" : "Close & Start Fresh")
              : "Get Real Support"}
          </Button>

          {!resourcesShown && (
            <div className="flex gap-2">
              <Button
                onClick={() => onSelection("false_positive")}
                variant="outline"
                className="flex-1 text-xs"
              >
                This Was a Mistake
              </Button>
              
              <Button
                onClick={() => onSelection("restart")}
                variant="secondary"
                className="flex-1 text-xs"
              >
                I'm Good, Let's Start Over
              </Button>
            </div>
          )}

        </div>

        {/* Footer Note */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          I'm just here to help you practice small talk. For anything deeper, talking to a real person is always the move.
        </p>
      </div>
    </div>
  );
}
