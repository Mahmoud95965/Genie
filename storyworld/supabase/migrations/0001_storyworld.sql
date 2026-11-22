-- ============================================================================
-- Story-World Consistency Engine — migration 0001 (M0, starter schema)
--
-- NOT EXECUTED BY DEFAULT. This file is a parse-validated starter schema
-- from the implementation spec (section 3); it has never run against a
-- live database, and running migrations anywhere is NOT authorized by
-- the spec. Do not apply it to any real database. It exists in M0 only
-- so the data model is versioned alongside the offline scaffold.
-- ============================================================================

-- 1. Projects, branches, commits, heads
create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,
  parent_branch_id uuid references branches(id),
  fork_commit_id uuid,
  created_at timestamptz not null default now(),
  unique (id, project_id)
);

create table commits (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_seq bigint not null,
  parent_commit_id uuid references commits(id),
  author text not null default 'human',
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (branch_id, commit_seq),
  unique (branch_id, idempotency_key)
);

alter table branches
  add constraint branches_fork_commit_fk
  foreign key (fork_commit_id) references commits(id);

create table branch_heads (
  branch_id uuid primary key references branches(id),
  head_commit_id uuid references commits(id),
  updated_at timestamptz not null default now()
);

-- 2. Chapters and immutable revisions
create table chapters (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  seq int not null,
  title text,
  unique (branch_id, seq),
  unique (id, branch_id)
);

create table chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  branch_id uuid not null,
  revision_no int not null,
  body_normalized text not null,
  body_sha256 text not null,
  source text not null check (source in ('human','writer','repair','import')),
  created_in_commit_id uuid not null references commits(id),
  created_at timestamptz not null default now(),
  unique (chapter_id, revision_no),
  unique (id, branch_id),
  foreign key (chapter_id, branch_id) references chapters(id, branch_id)
);

create table chapter_heads (
  chapter_id uuid not null,
  branch_id uuid not null,
  active_revision_id uuid not null,
  primary key (chapter_id, branch_id),
  foreign key (chapter_id, branch_id) references chapters(id, branch_id),
  foreign key (active_revision_id, branch_id) references chapter_revisions(id, branch_id)
);

-- 3. Characters and propositions
create table characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  canonical_name text not null,
  aliases text[] not null default '{}',
  unique (id, project_id)
);

create table propositions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  statement text not null,
  created_in_commit_id uuid not null references commits(id),
  unique (id, branch_id)
);

-- 4. Event ledger
create table event_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  chapter_revision_id uuid not null,
  kind text not null check (kind in
    ('death','action','dialogue','knowledge_transfer','knowledge_use',
     'movement','observation','promise_raised','other')),
  summary text not null,
  location text,
  story_time text,
  span_start int,
  span_end int,
  reality_scope text not null default 'real'
    check (reality_scope in ('real','dream','vision','unreliable_account','hypothetical')),
  certainty text not null default 'asserted'
    check (certainty in ('asserted','ambiguous','false_in_world')),
  unique (id, branch_id),
  foreign key (chapter_revision_id, branch_id) references chapter_revisions(id, branch_id)
);

create table event_participants (
  event_id uuid not null,
  branch_id uuid not null,
  character_id uuid not null references characters(id),
  role text not null check (role in
    ('actor','victim','speaker','listener','observer','subject')),
  primary key (event_id, character_id, role),
  foreign key (event_id, branch_id) references event_entries(id, branch_id)
);

-- 5. Knowledge ledger
create table knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  character_id uuid not null references characters(id),
  proposition_id uuid not null,
  learned_at_event_id uuid not null,
  learned_how text not null check (learned_how in ('witnessed','told','inferred','other')),
  certainty text not null default 'asserted'
    check (certainty in ('asserted','suspected','false_belief')),
  unique (id, branch_id),
  foreign key (proposition_id, branch_id) references propositions(id, branch_id),
  foreign key (learned_at_event_id, branch_id) references event_entries(id, branch_id)
);

create table knowledge_uses (
  event_id uuid not null,
  branch_id uuid not null,
  character_id uuid not null references characters(id),
  proposition_id uuid not null,
  primary key (event_id, character_id, proposition_id),
  foreign key (event_id, branch_id) references event_entries(id, branch_id),
  foreign key (proposition_id, branch_id) references propositions(id, branch_id)
);

-- 6. Character fact ledger
create table character_fact_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  character_id uuid not null references characters(id),
  kind text not null check (kind in ('alive','dead','location','trait','relationship')),
  value text not null,
  valid_from_event_id uuid not null,
  unique (id, branch_id),
  foreign key (valid_from_event_id, branch_id) references event_entries(id, branch_id)
);

-- 7. Promise ledger
create table promise_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  description text not null,
  raised_at_event_id uuid not null,
  deadline_event_id uuid,
  deadline_condition text,
  unique (id, branch_id),
  foreign key (raised_at_event_id, branch_id) references event_entries(id, branch_id),
  foreign key (deadline_event_id, branch_id) references event_entries(id, branch_id)
);

create table promise_resolutions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  promise_id uuid not null,
  resolved_at_event_id uuid not null,
  status text not null check (status in ('fulfilled','violated','abandoned')),
  foreign key (promise_id, branch_id) references promise_entries(id, branch_id),
  foreign key (resolved_at_event_id, branch_id) references event_entries(id, branch_id)
);

-- 8. Evidence
create table evidence_spans (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  chapter_revision_id uuid not null,
  start_offset int not null,
  end_offset int not null,
  quote text not null,
  body_sha256 text not null,
  check (end_offset > start_offset),
  unique (id, branch_id),
  foreign key (chapter_revision_id, branch_id) references chapter_revisions(id, branch_id)
);

create table entry_evidence (
  entry_table text not null check (entry_table in
    ('event','knowledge','character_fact','promise','proposition')),
  entry_id uuid not null,
  branch_id uuid not null,
  evidence_span_id uuid not null,
  primary key (entry_table, entry_id, evidence_span_id),
  foreign key (evidence_span_id, branch_id) references evidence_spans(id, branch_id)
);

-- 9. Retractions: the only post-commit change mechanism
create table retractions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  commit_id uuid not null references commits(id),
  entry_table text not null check (entry_table in
    ('event','knowledge','character_fact','promise','proposition')),
  entry_id uuid not null,
  reason text not null
);

-- 10. Current-state projections
create view v_current_events as
  select e.* from event_entries e
  where not exists (
    select 1 from retractions r
    where r.entry_table = 'event' and r.entry_id = e.id and r.branch_id = e.branch_id
  );

create view v_current_knowledge as
  select k.* from knowledge_entries k
  where not exists (
    select 1 from retractions r
    where r.entry_table = 'knowledge' and r.entry_id = k.id and r.branch_id = k.branch_id
  );

create view v_current_character_facts as
  select f.* from character_fact_entries f
  where not exists (
    select 1 from retractions r
    where r.entry_table = 'character_fact' and r.entry_id = f.id and r.branch_id = f.branch_id
  );

create view v_current_promises as
  select p.*,
    coalesce((
      select pr.status from promise_resolutions pr
      join commits pc on pc.id = pr.commit_id
      where pr.promise_id = p.id and pr.branch_id = p.branch_id
      order by pc.commit_seq desc limit 1
    ), 'open') as current_status
  from promise_entries p
  where not exists (
    select 1 from retractions r
    where r.entry_table = 'promise' and r.entry_id = p.id and r.branch_id = p.branch_id
  );

-- 11. Jobs, extraction provenance, telemetry, findings
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('extract','review','write','repair')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed')),
  idempotency_key text not null unique,
  payload jsonb not null,
  result jsonb,
  error text,
  budget jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table extraction_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  chapter_revision_id uuid not null,
  job_id uuid not null references jobs(id),
  model_requested text not null,
  model_resolved text,
  provider text,
  prompt_version text not null,
  status text not null check (status in
    ('ok','parse_error','validated_error','budget_exhausted','live_disabled')),
  raw_output jsonb,
  created_at timestamptz not null default now(),
  unique (id, branch_id),
  foreign key (chapter_revision_id, branch_id) references chapter_revisions(id, branch_id)
);

create table llm_call_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  purpose text not null check (purpose in ('extract','write','review','repair')),
  model_requested text not null,
  model_resolved text,
  generation_id text,
  prompt_sha256 text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric,
  latency_ms int,
  status text not null,
  created_at timestamptz not null default now()
);

create table spend_reservations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  period_month text not null,
  reserved_usd numeric not null,
  actual_usd numeric,
  status text not null default 'held' check (status in ('held','settled','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  source text not null check (source in ('rule_checker','llm_reviewer','human')),
  rule_code text,
  confidence text not null check (confidence in ('confirmed','uncertain')),
  description text not null,
  resolution text not null default 'open'
    check (resolution in ('open','accepted','dismissed','fixed')),
  created_at timestamptz not null default now()
);

create table finding_evidence (
  finding_id uuid not null references findings(id),
  evidence_span_id uuid not null,
  branch_id uuid not null,
  primary key (finding_id, evidence_span_id),
  foreign key (evidence_span_id, branch_id) references evidence_spans(id, branch_id)
);
