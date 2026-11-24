-- extractor.v4: propositions keep how the story relates to them.
-- Existing rows are legacy asserted facts. Only 'asserted' rows are world facts.
alter table propositions
  add column modality text not null default 'asserted'
  check (modality in ('asserted','promised','intended','reported','hypothetical'));
