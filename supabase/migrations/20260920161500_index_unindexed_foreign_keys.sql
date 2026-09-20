-- Audit Supabase performance (demandé par Adel, 20/09/2026) : 44 clés
-- étrangères sans index couvrant. Purement additif, aucun changement de
-- comportement -- juste des lectures/jointures plus rapides à l'échelle.

create index if not exists idx_artist_track_orders_track_id on public.artist_track_orders(track_id);
create index if not exists idx_discovery_profile_views_target_profile_id on public.discovery_profile_views(target_profile_id);
create index if not exists idx_event_recommendation_sends_profile_id on public.event_recommendation_sends(profile_id);
create index if not exists idx_event_reports_event_id on public.event_reports(event_id);
create index if not exists idx_event_reports_reported_by on public.event_reports(reported_by);
create index if not exists idx_event_reviews_reviewer_id on public.event_reviews(reviewer_id);
create index if not exists idx_event_rsvps_profile_id on public.event_rsvps(profile_id);
create index if not exists idx_events_creator_id on public.events(creator_id);
create index if not exists idx_events_moderated_by on public.events(moderated_by);
create index if not exists idx_events_playlist_id on public.events(playlist_id);
create index if not exists idx_feature_flags_updated_by on public.feature_flags(updated_by);
create index if not exists idx_integration_secrets_updated_by on public.integration_secrets(updated_by);
create index if not exists idx_keep_decisions_chosen_playlist_id on public.keep_decisions(chosen_playlist_id);
create index if not exists idx_keep_decisions_recommended_playlist_id on public.keep_decisions(recommended_playlist_id);
create index if not exists idx_keep_decisions_source_user_id on public.keep_decisions(source_user_id);
create index if not exists idx_keep_decisions_track_id on public.keep_decisions(track_id);
create index if not exists idx_music_recognition_attempts_profile_id on public.music_recognition_attempts(profile_id);
create index if not exists idx_operating_costs_created_by on public.operating_costs(created_by);
create index if not exists idx_operating_costs_currency_code on public.operating_costs(currency_code);
create index if not exists idx_plan_entitlements_feature_id on public.plan_entitlements(feature_id);
create index if not exists idx_plan_prices_currency_code on public.plan_prices(currency_code);
create index if not exists idx_playlist_sale_offer_tracks_track_id on public.playlist_sale_offer_tracks(track_id);
create index if not exists idx_playlist_sale_payments_offer_id on public.playlist_sale_payments(offer_id);
create index if not exists idx_playlist_tracks_track_id on public.playlist_tracks(track_id);
create index if not exists idx_product_events_profile_id on public.product_events(profile_id);
create index if not exists idx_profile_music_notification_sends_follower_id on public.profile_music_notification_sends(follower_id);
create index if not exists idx_promo_codes_promotion_id on public.promo_codes(promotion_id);
create index if not exists idx_promotions_plan_id on public.promotions(plan_id);
create index if not exists idx_push_delivery_attempts_push_token_id on public.push_delivery_attempts(push_token_id);
create index if not exists idx_refunds_currency_code on public.refunds(currency_code);
create index if not exists idx_refunds_transaction_id on public.refunds(transaction_id);
create index if not exists idx_remote_config_updated_by on public.remote_config(updated_by);
create index if not exists idx_router_config_versions_created_by on public.router_config_versions(created_by);
create index if not exists idx_routing_weights_playlist_id on public.routing_weights(playlist_id);
create index if not exists idx_subscriptions_country_code on public.subscriptions(country_code);
create index if not exists idx_subscriptions_currency_code on public.subscriptions(currency_code);
create index if not exists idx_subscriptions_granted_by on public.subscriptions(granted_by);
create index if not exists idx_subscriptions_plan_id on public.subscriptions(plan_id);
create index if not exists idx_subscriptions_plan_price_id on public.subscriptions(plan_price_id);
create index if not exists idx_support_ticket_messages_sender_profile_id on public.support_ticket_messages(sender_profile_id);
create index if not exists idx_tax_rules_country_code on public.tax_rules(country_code);
create index if not exists idx_user_profile_requirements_updated_by on public.user_profile_requirements(updated_by);
create index if not exists idx_user_reports_reporter_id on public.user_reports(reporter_id);
create index if not exists idx_user_reports_reviewed_by on public.user_reports(reviewed_by);
