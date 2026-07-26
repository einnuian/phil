-- Conversation storage for Phil.
-- Apply in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Row Level Security is what makes it safe for the browser to read and write
-- these tables directly with the user's own session: every policy below is
-- scoped to auth.uid(), so a user can only ever touch their own rows.

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  sources          text[] not null default '{}',
  created_at       timestamptz not null default now()
);

-- Sidebar lists a user's conversations newest-first; a thread reads in order.
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Conversations: owned directly by the user.
drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages: ownership is inherited through the parent conversation, so the
-- policy has to look it up rather than trust a column on the row.
drop policy if exists "own messages" on public.messages;
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

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();
