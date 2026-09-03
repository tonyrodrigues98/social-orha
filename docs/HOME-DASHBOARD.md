# Home dashboard

The authenticated Home screen is backed by one bounded server summary instead of
independent browser reads. This keeps the first render consistent, avoids client-side
N+1 queries and centralizes privacy decisions in PostgreSQL.

## Contract

`public.get_home_dashboard_summary(p_recent_limit integer default 5)` returns:

- incoming pending friendship and conversation-request counts plus at most `p_recent_limit` items;
- at most `p_recent_limit` recent active conversations with unread counts;
- the unread notification count plus at most `p_recent_limit` recent notifications;
- at most `p_recent_limit` active community memberships and recent visible community posts;
- server-derived profile-completion signals and missing field keys.

The limit is clamped to `1..10`, and the serialized response is rejected above 128 KiB.
The browser validates the complete JSON shape before exposing it to React Query.

## Privacy and trust boundaries

The function is `SECURITY DEFINER`, `STABLE`, has an empty `search_path`, reads
`auth.uid()` once, and rejects accounts that are inactive, moderated or have not
completed onboarding. It reuses the canonical account, block, profile, community-post
and message-visibility helpers from the earlier migrations.

The response intentionally excludes:

- message bodies and attachments;
- conversation-request opening messages;
- notification payload JSON;
- birth dates, email addresses and private profile fields.

Profile completeness only exposes booleans indirectly as missing field keys and a
percentage. A birth date is never returned. Recent-message timestamps and unread
counts use `private.can_view_message`, so a user's `cleared_before` watermark is
authoritative.

## Migration order

Apply these forward migrations before the Home summary:

1. `20260816170000_social_launch_schema.sql`
2. `20260816180000_edge_worker_contracts.sql`
3. `20260816200000_conversation_preference_controls.sql`
4. `20260816210000_profile_details_age_privacy.sql`
5. `20260816220000_home_dashboard_summary.sql`

The Home migration has no transaction control because production validation wraps
the entire migration set in its own rollback transaction. Preconditions and
postconditions fail atomically if dependencies, execution context or grants differ
from the expected contract.

After applying migrations to the target project, regenerate Supabase database types.
The current adapter intentionally uses a narrow structural RPC client so the migration
and frontend can be reviewed together before generated types are refreshed.

## UI behavior

The Home screen has explicit loading, retry, complete-profile and honest empty states.
Actions open the real friendship center, conversations, notifications and typed
community routes. The header receives the unread count from the same summary to avoid
a duplicate notification query on Home; other pages continue using the notification
repository directly.

React Query keys include the authenticated profile ID, and runtime session cleanup
clears query data when the authenticated user changes, preventing cross-account cache
reuse.
