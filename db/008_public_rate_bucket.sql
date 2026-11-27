-- ============================================================================
-- Rate limiting for calls that have no principal yet.
--
-- SD-9 said limits are per-principal, and that is right for everything an
-- authenticated agent does. Registration is the exception: it is the call that
-- *creates* the principal, so there is nothing to key on. The `register`
-- bucket defined in code was therefore never applied, and agent creation was
-- completely unthrottled — every new agent mints starting credits.
--
-- Keyed on the client address Vercel's edge attaches, plus a global ceiling so
-- a distributed attempt is still bounded.
-- ============================================================================

create table if not exists public_bucket (
  subject      text not null,
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (subject, bucket, window_start)
);

create index if not exists public_bucket_window_idx on public_bucket(window_start);

grant select, insert, update on public_bucket to ab_app;
