-- Add session_token column to sessions table
ALTER TABLE sessions 
ADD COLUMN session_token TEXT;

-- Add session_token column to session_metadata table
ALTER TABLE session_metadata 
ADD COLUMN session_token TEXT;

-- Drop old policies
DROP POLICY IF EXISTS "Anonymous users can update sessions" ON sessions;
DROP POLICY IF EXISTS "Anonymous users can update metadata" ON session_metadata;

-- Create new policies that require session_token match
CREATE POLICY "Anonymous users can update own sessions" 
ON sessions
FOR UPDATE 
USING (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true));

CREATE POLICY "Anonymous users can update own metadata" 
ON session_metadata
FOR UPDATE 
USING (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true));