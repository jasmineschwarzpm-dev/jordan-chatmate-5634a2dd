-- Add crisis tracking columns to sessions table
ALTER TABLE public.sessions 
ADD COLUMN crisis_detected boolean DEFAULT false,
ADD COLUMN crisis_user_selection text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.crisis_detected IS 'Flags if crisis keywords were detected during the session';
COMMENT ON COLUMN public.sessions.crisis_user_selection IS 'Tracks user choice from crisis modal: support_needed, false_positive, or restart';