-- Same schema used during setup; keep for reference/redeployment.
create table if not exists public.photos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 original_name text not null,
 mime_type text not null,
 size_bytes bigint not null,
 category text not null default 'Other' check (category in ('Family','Work','Other')),
 created_at timestamptz not null default now()
);
alter table public.photos enable row level security;
create policy "Users can view their own photos" on public.photos for select to authenticated using(auth.uid()=user_id);
create policy "Users can upload their own photos" on public.photos for insert to authenticated with check(auth.uid()=user_id);
create policy "Users can update their own photos" on public.photos for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "Users can delete their own photos" on public.photos for delete to authenticated using(auth.uid()=user_id);
create policy "Users can upload photos to their folder" on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users can view their own stored photos" on storage.objects for select to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users can update their own stored photos" on storage.objects for update to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users can delete their own stored photos" on storage.objects for delete to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
