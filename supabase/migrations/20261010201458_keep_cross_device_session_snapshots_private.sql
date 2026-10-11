-- Synchronisation privée additive des sessions musicales PC/iOS.
CREATE TABLE IF NOT EXISTS public.keep_device_sessions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id text NOT NULL CHECK (char_length(session_id) BETWEEN 1 AND 160),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 PRIMARY KEY (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS keep_device_sessions_user_changed_idx
 ON public.keep_device_sessions(user_id,updated_at DESC);
ALTER TABLE public.keep_device_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS keep_device_sessions_owner ON public.keep_device_sessions;
CREATE POLICY keep_device_sessions_owner ON public.keep_device_sessions FOR ALL TO authenticated
 USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
REVOKE ALL ON TABLE public.keep_device_sessions FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.keep_device_sessions TO authenticated;

-- Invoker / propriétaire authentifié. Le cache d'un appareil ancien
-- ne peut pas rétablir une session que son propriétaire a supprimée.
CREATE OR REPLACE FUNCTION public.keep_sync_device_session(
 p_session_id text,
 p_snapshot jsonb DEFAULT '{}'::jsonb,
 p_deleted boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE
 v_user uuid := (select auth.uid());
 v_changed integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000'; END IF;
 IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_snapshot) != 'object' OR octet_length(p_snapshot::text) > 1048576
 THEN RAISE EXCEPTION 'invalid_session_snapshot' USING ERRCODE = '22023'; END IF;
 IF p_deleted THEN
   INSERT INTO public.keep_device_sessions (user_id,session_id,snapshot,deleted_at)
   VALUES (v_user,p_session_id,'{}'::jsonb,now())
   ON CONFLICT (user_id,session_id) DO UPDATE SET
    deleted_at=coalesce(public.keep_device_sessions.deleted_at,now()),updated_at=now();
 ELSE
   INSERT INTO public.keep_device_sessions (user_id,session_id,snapshot,deleted_at)
   VALUES (v_user,p_session_id,p_snapshot,null)
   ON CONFLICT (user_id,session_id) DO UPDATE SET
    snapshot=EXCLUDED.snapshot,updated_at=now()
   WHERE public.keep_device_sessions.deleted_at IS NULL;
 END IF;
 GET DIAGNOSTICS v_changed = ROW_COUNT;
 RETURN v_changed > 0;
END;
$fn$;
REVOKE ALL ON FUNCTION public.keep_sync_device_session(text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_sync_device_session(text,jsonb,boolean) TO authenticated;
