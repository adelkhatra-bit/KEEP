-- KEEP — verrouille l'RPC de suppression : compte connecté uniquement.
revoke all on function public.keep_remove_track(uuid) from public;
revoke all on function public.keep_remove_track(uuid) from anon;
revoke all on function public.keep_remove_track(uuid) from authenticated;
grant execute on function public.keep_remove_track(uuid) to authenticated;
