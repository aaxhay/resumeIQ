-- Optional saved summaries only. Apply manually after operator review; never stores files.
-- Requires Supabase's existing auth.users, auth.uid(), auth.jwt(), and API roles.
begin;

create function public.saved_review_registered_user()
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false';
$$;

create function public.saved_review_text(value jsonb, maximum integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'string'
    and char_length(value #>> '{}') between 1 and maximum
    and char_length(btrim(value #>> '{}')) > 0, false);
$$;

create function public.saved_review_analysis_valid(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or octet_length(value::text) > 32768 then return false; end if;
  if not (value ?& array['version','assessment','priorities','strengths','limitations'])
    or value - array['version','assessment','priorities','strengths','limitations'] <> '{}'::jsonb
    or value -> 'version' <> '1'::jsonb
    or not public.saved_review_text(value -> 'assessment', 1200)
    or jsonb_typeof(value -> 'priorities') <> 'array'
    or jsonb_typeof(value -> 'strengths') <> 'array'
    or jsonb_typeof(value -> 'limitations') <> 'array' then return false; end if;
  if jsonb_array_length(value -> 'priorities') <> 3
    or jsonb_array_length(value -> 'strengths') not between 1 and 5
    or jsonb_array_length(value -> 'limitations') not between 1 and 5 then return false; end if;
  for item in select jsonb_array_elements(value -> 'priorities') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['title','recommendation'])
      or item - array['title','recommendation'] <> '{}'::jsonb
      or not public.saved_review_text(item -> 'title', 500)
      or not public.saved_review_text(item -> 'recommendation', 1200) then return false; end if;
  end loop;
  for item in select jsonb_array_elements(value -> 'strengths') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['title','explanation'])
      or item - array['title','explanation'] <> '{}'::jsonb
      or not public.saved_review_text(item -> 'title', 500)
      or not public.saved_review_text(item -> 'explanation', 1200) then return false; end if;
  end loop;
  for item in select jsonb_array_elements(value -> 'limitations') loop
    if not public.saved_review_text(item, 500) then return false; end if;
  end loop;
  return true;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_mode text not null check (review_mode in ('general', 'job-specific')),
  resume_filename text check (resume_filename is null or (
    char_length(resume_filename) between 1 and 160
    and resume_filename !~ '[[:cntrl:]]')),
  analysis_result jsonb not null check (public.saved_review_analysis_valid(analysis_result)),
  created_at timestamptz not null default now()
);
create index resume_reviews_owner_created_idx on public.resume_reviews(user_id, created_at);
create index resume_reviews_retention_idx on public.resume_reviews(created_at);
create table public.resume_suggestions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.resume_reviews(id) on delete cascade,
  finding_id text not null check (finding_id ~ '^[a-z0-9-]{1,60}$'),
  original_text text not null check (char_length(original_text) between 1 and 2500 and char_length(btrim(original_text)) > 0),
  suggested_text text not null check (char_length(suggested_text) between 1 and 2500 and char_length(btrim(suggested_text)) > 0),
  status text not null check (status in ('pending','accepted','rejected','manually_edited')),
  created_at timestamptz not null default now(),
  unique (review_id, finding_id)
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.resume_reviews enable row level security;
alter table public.resume_reviews force row level security;
alter table public.resume_suggestions enable row level security;
alter table public.resume_suggestions force row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (public.saved_review_registered_user() and id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.saved_review_registered_user() and id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.saved_review_registered_user() and id = auth.uid());
create policy reviews_select on public.resume_reviews for select to authenticated
  using (public.saved_review_registered_user() and user_id = auth.uid() and created_at > now() - interval '30 days');
create policy reviews_insert on public.resume_reviews for insert to authenticated
  with check (public.saved_review_registered_user() and user_id = auth.uid() and created_at > now() - interval '30 days');
create policy reviews_delete on public.resume_reviews for delete to authenticated
  using (public.saved_review_registered_user() and user_id = auth.uid() and created_at > now() - interval '30 days');
create policy suggestions_select on public.resume_suggestions for select to authenticated
  using (public.saved_review_registered_user() and exists (
    select 1 from public.resume_reviews r where r.id = review_id
      and r.user_id = auth.uid() and r.created_at > now() - interval '30 days'));
create policy suggestions_insert on public.resume_suggestions for insert to authenticated
  with check (public.saved_review_registered_user() and exists (
    select 1 from public.resume_reviews r where r.id = review_id
      and r.user_id = auth.uid() and r.created_at > now() - interval '30 days'));
create policy suggestions_delete on public.resume_suggestions for delete to authenticated
  using (public.saved_review_registered_user() and exists (
    select 1 from public.resume_reviews r where r.id = review_id
      and r.user_id = auth.uid() and r.created_at > now() - interval '30 days'));

-- Invoker triggers enforce limits even for direct INSERTs needed by the invoker RPC.
-- Locks serialize each owner's saves and each review's child inserts until commit.
create function public.saved_review_limit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.resume_reviews
      where user_id = new.user_id and created_at > now() - interval '30 days') >= 20 then
    raise exception 'Saved review limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger saved_review_limit before insert on public.resume_reviews
  for each row execute function public.saved_review_limit();
create function public.saved_suggestion_limit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.review_id::text, 1));
  if (select count(*) from public.resume_suggestions where review_id = new.review_id) >= 12 then
    raise exception 'Saved suggestion limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger saved_suggestion_limit before insert on public.resume_suggestions
  for each row execute function public.saved_suggestion_limit();

create function public.save_resume_review(
  p_id uuid, p_review_mode text, p_resume_filename text,
  p_analysis_result jsonb, p_suggestions jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare caller uuid := auth.uid(); item jsonb;
begin
  if not public.saved_review_registered_user() then
    raise exception 'Registered authentication required' using errcode = '42501';
  end if;
  if p_id is null then raise exception 'Review id required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  -- Only a still-visible snapshot belonging to this caller is idempotent.
  if exists (select 1 from public.resume_reviews where id = p_id and user_id = caller) then
    return p_id;
  end if;
  if p_suggestions is null or jsonb_typeof(p_suggestions) <> 'array' then
    raise exception 'Invalid saved suggestions' using errcode = '22023';
  end if;
  if jsonb_array_length(p_suggestions) > 12 or octet_length(p_suggestions::text) > 262144 then
    raise exception 'Invalid saved suggestions' using errcode = '22023';
  end if;
  insert into public.profiles(id) values (caller) on conflict (id) do nothing;
  insert into public.resume_reviews(id,user_id,review_mode,resume_filename,analysis_result)
    values (p_id,caller,p_review_mode,p_resume_filename,p_analysis_result);
  for item in select jsonb_array_elements(p_suggestions) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Invalid saved suggestion' using errcode = '22023';
    end if;
    if not (item ?& array['finding_id','original_text','suggested_text','status'])
      or item - array['finding_id','original_text','suggested_text','status'] <> '{}'::jsonb
      or not public.saved_review_text(item -> 'finding_id',60)
      or not public.saved_review_text(item -> 'original_text',2500)
      or not public.saved_review_text(item -> 'suggested_text',2500)
      or not public.saved_review_text(item -> 'status',30) then
      raise exception 'Invalid saved suggestion' using errcode = '22023';
    end if;
    insert into public.resume_suggestions(review_id,finding_id,original_text,suggested_text,status)
      values (p_id,item ->> 'finding_id',item ->> 'original_text',item ->> 'suggested_text',item ->> 'status');
  end loop;
  return p_id;
end;
$$;

create function public.delete_expired_resume_reviews()
returns bigint language plpgsql security definer set search_path = '' as $$
declare deleted bigint;
begin
  delete from public.resume_reviews where created_at <= now() - interval '30 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
alter function public.delete_expired_resume_reviews() owner to postgres;

-- Supabase may supply permissive default grants: explicitly reset every new object.
revoke all on public.profiles, public.resume_reviews, public.resume_suggestions from public, anon, authenticated, service_role;
grant select, delete on public.profiles, public.resume_reviews, public.resume_suggestions to authenticated;
grant insert (id) on public.profiles to authenticated;
grant insert (id,user_id,review_mode,resume_filename,analysis_result) on public.resume_reviews to authenticated;
grant insert (id,review_id,finding_id,original_text,suggested_text,status) on public.resume_suggestions to authenticated;
-- No UPDATE and no client INSERT(created_at): snapshots and server timestamps are immutable.
revoke all on function public.saved_review_registered_user(), public.saved_review_text(jsonb,integer),
  public.saved_review_analysis_valid(jsonb), public.saved_review_limit(), public.saved_suggestion_limit(),
  public.save_resume_review(uuid,text,text,jsonb,jsonb), public.delete_expired_resume_reviews()
  from public, anon, authenticated, service_role;
grant execute on function public.saved_review_registered_user(), public.saved_review_text(jsonb,integer),
  public.saved_review_analysis_valid(jsonb), public.save_resume_review(uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.delete_expired_resume_reviews() to service_role;

commit;
