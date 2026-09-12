-- Audit multi-agent 07/09/2026 (juge charge/scalabilite) : 59 policies RLS sur ~35
-- tables reevaluaient auth.uid() ligne par ligne (advisor auth_rls_initplan) --
-- invisible avec quelques dizaines d'utilisateurs, degrade fortement des scans
-- normalement indexes (profiles, notifications, follows...) une fois ces tables
-- a plusieurs dizaines/centaines de milliers de lignes. Correctif standard
-- Supabase : (select auth.uid()) au lieu de auth.uid() nu, pour que Postgres
-- fige le filtre une fois par requete (initplan) au lieu de le reevaluer par
-- ligne. Aucun changement de comportement, meme logique exacte.

ALTER POLICY "admin_credit_grants_read_own" ON public."admin_credit_grants" USING (((select auth.uid()) = profile_id));
ALTER POLICY "client_diagnostics_insert_own" ON public."client_diagnostics" WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "client_diagnostics_select_own" ON public."client_diagnostics" USING ((profile_id = (select auth.uid())));
ALTER POLICY "discovery_profile_views_select_own" ON public."discovery_profile_views" USING ((profile_id = (select auth.uid())));
ALTER POLICY "download_credit_usage_select_own" ON public."download_credit_usage" USING ((profile_id = (select auth.uid())));
ALTER POLICY "event_reports_insert_authenticated" ON public."event_reports" WITH CHECK ((reported_by = (select auth.uid())));
ALTER POLICY "event_rsvps_select_own" ON public."event_rsvps" USING ((profile_id = (select auth.uid())));
ALTER POLICY "event_rsvps_write_own" ON public."event_rsvps" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "events_creator_write" ON public."events" USING ((creator_id = (select auth.uid()))) WITH CHECK ((creator_id = (select auth.uid())));
ALTER POLICY "feature_usage_counters_select_own" ON public."feature_usage_counters" USING ((profile_id = (select auth.uid())));
ALTER POLICY "follows_delete_self" ON public."follows" USING ((follower_id = (select auth.uid())));
ALTER POLICY "follows_insert_self" ON public."follows" WITH CHECK ((follower_id = (select auth.uid())));
ALTER POLICY "keep_battle_match_preferences_manage_own" ON public."keep_battle_match_preferences" USING (((select auth.uid()) = profile_id)) WITH CHECK (((select auth.uid()) = profile_id));
ALTER POLICY "keep_battle_monthly_match_counters_self_read" ON public."keep_battle_monthly_match_counters" USING (((select auth.uid()) = profile_id));
ALTER POLICY "keep_decisions_owner" ON public."keep_decisions" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "keep_referral_codes_read_own" ON public."keep_referral_codes" USING ((profile_id = (select auth.uid())));
ALTER POLICY "keep_referrals_read_own" ON public."keep_referrals" USING (((referrer_profile_id = (select auth.uid())) OR (referred_profile_id = (select auth.uid()))));
ALTER POLICY "music_library_items_delete_own" ON public."music_library_items" USING ((profile_id = (select auth.uid())));
ALTER POLICY "music_library_items_insert_own" ON public."music_library_items" WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "music_library_items_select" ON public."music_library_items" USING (((profile_id = (select auth.uid())) OR ((removed_at IS NULL) AND (visibility = 'PUBLIC'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = music_library_items.profile_id) AND (p.is_public = true))))) OR ((removed_at IS NULL) AND (visibility = 'FOLLOWERS'::text) AND (EXISTS ( SELECT 1 FROM follows f WHERE ((f.follower_id = (select auth.uid())) AND (f.followee_id = music_library_items.profile_id)))))));
ALTER POLICY "music_library_items_update_own" ON public."music_library_items" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "music_service_connections_select_own" ON public."music_service_connections" USING ((profile_id = (select auth.uid())));
ALTER POLICY "notification_preferences_owner" ON public."notification_preferences" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "notifications_delete_own" ON public."notifications" USING ((profile_id = (select auth.uid())));
ALTER POLICY "notifications_select_own" ON public."notifications" USING ((profile_id = (select auth.uid())));
ALTER POLICY "notifications_update_own" ON public."notifications" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "plan_entitlements_admin_write" ON public."plan_entitlements" USING (is_admin((select auth.uid()))) WITH CHECK (is_admin((select auth.uid())));
ALTER POLICY "plan_prices_admin_write" ON public."plan_prices" USING (is_admin((select auth.uid()))) WITH CHECK (is_admin((select auth.uid())));
ALTER POLICY "plans_admin_write" ON public."plans" USING (is_admin((select auth.uid()))) WITH CHECK (is_admin((select auth.uid())));
ALTER POLICY "playlist_tracks_owner_write" ON public."playlist_tracks" USING ((EXISTS ( SELECT 1 FROM playlists p WHERE ((p.id = playlist_tracks.playlist_id) AND (p.owner_id = (select auth.uid()))))));
ALTER POLICY "playlist_tracks_via_playlist" ON public."playlist_tracks" USING ((EXISTS ( SELECT 1 FROM playlists p WHERE ((p.id = playlist_tracks.playlist_id) AND ((p.owner_id = (select auth.uid())) OR ((p.is_public = true) AND (EXISTS ( SELECT 1 FROM keep_decisions kd WHERE ((kd.profile_id = p.owner_id) AND (kd.track_id = playlist_tracks.track_id) AND (kd.decision = 'KEPT'::text) AND (kd.visibility = 'PUBLIC'::text))))))))));
ALTER POLICY "playlists_owner_write" ON public."playlists" USING ((owner_id = (select auth.uid()))) WITH CHECK ((owner_id = (select auth.uid())));
ALTER POLICY "playlists_select_own_or_public" ON public."playlists" USING (((owner_id = (select auth.uid())) OR is_public));
ALTER POLICY "profile_private_info_owner" ON public."profile_private_info" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "profiles_admin_select" ON public."profiles" USING (is_admin((select auth.uid())));
ALTER POLICY "profiles_insert_own" ON public."profiles" WITH CHECK ((id = (select auth.uid())));
ALTER POLICY "profiles_select_own_or_public" ON public."profiles" USING (((id = (select auth.uid())) OR is_public));
ALTER POLICY "profiles_update_own" ON public."profiles" USING ((id = (select auth.uid())));
ALTER POLICY "provider_links_owner" ON public."provider_links" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "push_tokens_owner" ON public."push_tokens" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "refunds_owner_select" ON public."refunds" USING ((EXISTS ( SELECT 1 FROM transactions t WHERE ((t.id = refunds.transaction_id) AND (t.profile_id = (select auth.uid()))))));
ALTER POLICY "routing_weights_owner" ON public."routing_weights" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "social_links_owner" ON public."social_links" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "subscriptions_admin_write" ON public."subscriptions" USING (is_admin((select auth.uid()))) WITH CHECK (is_admin((select auth.uid())));
ALTER POLICY "subscriptions_owner_select" ON public."subscriptions" USING ((profile_id = (select auth.uid())));
ALTER POLICY "support_messages_admin_insert" ON public."support_ticket_messages" WITH CHECK ((is_admin((select auth.uid())) AND (sender_role = ANY (ARRAY['ADMIN'::text, 'SYSTEM'::text]))));
ALTER POLICY "support_messages_participant_select" ON public."support_ticket_messages" USING ((EXISTS ( SELECT 1 FROM support_tickets t WHERE ((t.id = support_ticket_messages.ticket_id) AND ((t.profile_id = (select auth.uid())) OR admin_has_role((select auth.uid()), ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'SUPPORT'::text, 'MODERATOR'::text]))))));
ALTER POLICY "support_messages_user_insert" ON public."support_ticket_messages" WITH CHECK (((sender_role = 'USER'::text) AND (sender_profile_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM support_tickets t WHERE ((t.id = support_ticket_messages.ticket_id) AND (t.profile_id = (select auth.uid())))))));
ALTER POLICY "support_tickets_admin_update" ON public."support_tickets" USING (admin_has_role((select auth.uid()), ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'SUPPORT'::text, 'MODERATOR'::text]));
ALTER POLICY "support_tickets_owner_insert" ON public."support_tickets" WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "support_tickets_owner_select" ON public."support_tickets" USING (((profile_id = (select auth.uid())) OR admin_has_role((select auth.uid()), ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'SUPPORT'::text, 'MODERATOR'::text])));
ALTER POLICY "track_likes_delete_own" ON public."track_likes" USING ((profile_id = (select auth.uid())));
ALTER POLICY "track_likes_insert_own" ON public."track_likes" WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "track_likes_owner" ON public."track_likes" USING ((profile_id = (select auth.uid()))) WITH CHECK ((profile_id = (select auth.uid())));
ALTER POLICY "transactions_owner_select" ON public."transactions" USING ((profile_id = (select auth.uid())));
ALTER POLICY "usage_limits_admin_write" ON public."usage_limits" USING (is_admin((select auth.uid()))) WITH CHECK (is_admin((select auth.uid())));
ALTER POLICY "user_blocks_owner" ON public."user_blocks" USING ((blocker_id = (select auth.uid()))) WITH CHECK ((blocker_id = (select auth.uid())));
ALTER POLICY "user_profile_requirements_select_own" ON public."user_profile_requirements" USING ((profile_id = (select auth.uid())));
ALTER POLICY "user_reports_insert_own" ON public."user_reports" WITH CHECK ((reporter_id = (select auth.uid())));
