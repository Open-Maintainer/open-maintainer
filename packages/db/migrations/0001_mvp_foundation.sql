CREATE TABLE IF NOT EXISTS system_events (
  id text PRIMARY KEY,
  kind text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS installations (
  id text PRIMARY KEY,
  account_login text NOT NULL,
  account_type text NOT NULL,
  repository_selection text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repos (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id),
  owner text NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  default_branch text NOT NULL,
  private boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS repo_profiles (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  version integer NOT NULL,
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repo_id, version)
);

CREATE TABLE IF NOT EXISTS generated_artifacts (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  artifact_type text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  source_profile_version integer NOT NULL,
  model_provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repo_id, artifact_type, version)
);
