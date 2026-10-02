-- Migration slot preserved after duplicate chat-reply work was consolidated
-- into 20261002133500_chat_realtime_and_message_replies.sql.
-- Intentionally no-op: do not duplicate or override the canonical functions.
select 1;
