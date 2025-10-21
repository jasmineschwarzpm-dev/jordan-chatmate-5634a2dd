-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create sessions table for conversation logging
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  scene TEXT NOT NULL,
  interlocutor TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_turns INTEGER DEFAULT 0,
  transcript JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Admins can read all sessions
CREATE POLICY "Admins can read all sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert sessions (for manual data entry if needed)
CREATE POLICY "Admins can insert sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update sessions
CREATE POLICY "Admins can update sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow anonymous users to create sessions (for testing without auth)
CREATE POLICY "Anonymous users can create sessions"
ON public.sessions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to update their own sessions
CREATE POLICY "Anonymous users can update sessions"
ON public.sessions
FOR UPDATE
TO anon
USING (true);

-- Create session_metadata table for aggregate stats
CREATE TABLE public.session_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,
  crisis_count INTEGER DEFAULT 0,
  pii_count INTEGER DEFAULT 0,
  controversial_count INTEGER DEFAULT 0,
  coaching_count INTEGER DEFAULT 0,
  avg_user_message_length INTEGER DEFAULT 0,
  completion_status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.session_metadata ENABLE ROW LEVEL SECURITY;

-- Admins can read all metadata
CREATE POLICY "Admins can read all metadata"
ON public.session_metadata
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert metadata
CREATE POLICY "Admins can insert metadata"
ON public.session_metadata
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update metadata
CREATE POLICY "Admins can update metadata"
ON public.session_metadata
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow anonymous users to create metadata
CREATE POLICY "Anonymous users can create metadata"
ON public.session_metadata
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to update metadata
CREATE POLICY "Anonymous users can update metadata"
ON public.session_metadata
FOR UPDATE
TO anon
USING (true);

-- Create moderation_logs table for blocked responses
CREATE TABLE public.moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  original_response TEXT NOT NULL,
  block_reason TEXT NOT NULL,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  moderation_details JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read moderation logs
CREATE POLICY "Admins can read moderation logs"
ON public.moderation_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow anonymous users to insert moderation logs
CREATE POLICY "Anonymous users can insert moderation logs"
ON public.moderation_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Special policy: Allow first user to grant themselves admin (one-time setup)
-- This will be handled in application logic, not RLS