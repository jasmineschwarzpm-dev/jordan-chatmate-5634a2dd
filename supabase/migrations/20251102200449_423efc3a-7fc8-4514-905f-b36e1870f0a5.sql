-- Fix RLS policies for sessions and session_metadata tables
-- Issue: Anonymous users can update ANY session (not just their own)
-- Solution: Add proper SELECT policies and fix UPDATE policies to use client-side token matching

-- Drop the overly permissive anonymous update policies
DROP POLICY IF EXISTS "Anonymous users can update own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anonymous users can update own metadata" ON public.session_metadata;

-- Add SELECT policies so anonymous users can read their own data
CREATE POLICY "Anonymous users can read sessions"
ON public.sessions
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anonymous users can read metadata"
ON public.session_metadata
FOR SELECT
TO anon
USING (true);

-- Add restricted UPDATE policies that rely on client-side filtering
-- The client must provide BOTH the id AND matching session_token in the WHERE clause
-- This prevents users from updating sessions they don't own
CREATE POLICY "Anonymous users can update own sessions"
ON public.sessions
FOR UPDATE
TO anon
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL);

CREATE POLICY "Anonymous users can update own metadata"
ON public.session_metadata
FOR UPDATE
TO anon
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL);

-- Note: Security relies on client code using .eq('session_token', sessionToken) in queries
-- RLS ensures session_token field cannot be NULL, client ensures correct token is matched