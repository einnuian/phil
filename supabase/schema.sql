-- Conversation storage for Phil.
-- Apply in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Row Level Security is what makes it safe for the browser to read and write
-- these tables directly with the user's own session: every policy below is
-- scoped to auth.uid(), so a user can only ever touch their own rows.
--
-- Re-running this file rebuilds the schema from scratch. That is deliberate:
-- there is no deployed database to preserve, and iterating on the schema is
-- easier when a re-run actually applies your edits.

drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  sources          text[] not null default '{}',
  created_at       timestamptz not null default now()
);

-- Sidebar lists a user's conversations newest-first; a thread reads in order.
create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Conversations: owned directly by the user.
create policy "own conversations" on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages: ownership is inherited through the parent conversation, so the
-- policy has to look it up rather than trust a column on the row.
create policy "own messages" on public.messages
  for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- Keep conversations.updated_at fresh so the newest thread sorts first.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Account deletion. The browser can't touch auth.users directly — that needs
-- the service role key, which must never reach the client. This runs as the
-- function owner instead and is hard-scoped to auth.uid(), so a caller can
-- only ever delete themselves. Conversations and messages follow via
-- `on delete cascade`.
create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
