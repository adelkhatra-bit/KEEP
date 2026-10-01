-- Store hardening: purchase/payment RPCs require an authenticated JWT.
-- Several SECURITY DEFINER functions still inherited EXECUTE from PUBLIC,
-- making them callable by anon even when their body later checked auth.uid().
-- Remove that unnecessary public attack surface before native-store release.

revoke execute on function public.keep_artist_track_mark_paid(uuid) from public, anon;
revoke execute on function public.keep_artist_track_my_purchases() from public, anon;
revoke execute on function public.keep_artist_track_request_purchase(uuid) from public, anon;
revoke execute on function public.keep_event_request_ticket_purchase(uuid) from public, anon;
revoke execute on function public.keep_event_ticket_mark_paid(uuid) from public, anon;
revoke execute on function public.keep_event_ticket_my_purchases() from public, anon;
revoke execute on function public.keep_payout_link_for_profile(uuid) from public, anon;
revoke execute on function public.keep_playlist_sale_mark_paid(uuid) from public, anon;
revoke execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) from public, anon;
revoke execute on function public.keep_playlist_sale_my_purchases() from public, anon;
revoke execute on function public.keep_set_payout_link(text) from public, anon;

grant execute on function public.keep_artist_track_mark_paid(uuid) to authenticated;
grant execute on function public.keep_artist_track_my_purchases() to authenticated;
grant execute on function public.keep_artist_track_request_purchase(uuid) to authenticated;
grant execute on function public.keep_event_request_ticket_purchase(uuid) to authenticated;
grant execute on function public.keep_event_ticket_mark_paid(uuid) to authenticated;
grant execute on function public.keep_event_ticket_my_purchases() to authenticated;
grant execute on function public.keep_payout_link_for_profile(uuid) to authenticated;
grant execute on function public.keep_playlist_sale_mark_paid(uuid) to authenticated;
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) to authenticated;
grant execute on function public.keep_playlist_sale_my_purchases() to authenticated;
grant execute on function public.keep_set_payout_link(text) to authenticated;
