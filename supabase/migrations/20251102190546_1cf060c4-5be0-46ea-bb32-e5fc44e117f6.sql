-- Create security definer function to check if no admins exist
create or replace function public.no_admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.user_roles
    where role = 'admin'::app_role
  );
$$;

-- Add policy for first user to grant themselves admin access
create policy "First user can grant self admin"
on public.user_roles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'admin'::app_role
  and public.no_admin_exists()
);