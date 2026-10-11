-- Record which verified Google account owns the app's Drive media folder.
-- Safe to run after the original Google Drive integration migration.
alter table public.google_drive_connections
  add column if not exists connected_email text;
