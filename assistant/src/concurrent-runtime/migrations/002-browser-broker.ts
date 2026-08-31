export const CONCURRENT_RUNTIME_MIGRATION_002 = `
ALTER TABLE concurrent_conversations
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS owner_actor_id TEXT;

ALTER TABLE concurrent_conversations
  DROP CONSTRAINT IF EXISTS concurrent_conversations_owner_pair_check;
ALTER TABLE concurrent_conversations
  ADD CONSTRAINT concurrent_conversations_owner_pair_check CHECK (
    (owner_user_id IS NULL AND owner_actor_id IS NULL)
    OR (owner_user_id IS NOT NULL AND owner_actor_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION enforce_concurrent_conversation_owner_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.owner_user_id IS NOT NULL AND (
    NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.owner_actor_id IS DISTINCT FROM OLD.owner_actor_id
  ) THEN
    RAISE EXCEPTION 'concurrent conversation ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS concurrent_conversation_owner_immutable
  ON concurrent_conversations;
CREATE TRIGGER concurrent_conversation_owner_immutable
  BEFORE UPDATE OF owner_user_id, owner_actor_id
  ON concurrent_conversations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_concurrent_conversation_owner_immutable();

ALTER TABLE concurrent_runs
  DROP CONSTRAINT IF EXISTS concurrent_runs_status_check;
ALTER TABLE concurrent_runs
  ADD CONSTRAINT concurrent_runs_status_check CHECK (
    status IN (
      'queued',
      'processing',
      'waiting_for_browser',
      'completed',
      'failed',
      'cancelled'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_concurrent_runs_one_active
  ON concurrent_runs (organization_id, assistant_id, conversation_id)
  WHERE status IN ('processing', 'waiting_for_browser');

CREATE TABLE IF NOT EXISTS concurrent_browser_clients (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  client_installation_id TEXT NOT NULL,
  interface_id TEXT NOT NULL CHECK (interface_id = 'chrome-extension'),
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  capabilities JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'expired')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  )
);

CREATE TABLE IF NOT EXISTS concurrent_browser_connections (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  client_installation_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_generation BIGINT NOT NULL CHECK (connection_generation > 0),
  resume_token_hash TEXT NOT NULL,
  cursor BIGINT NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'superseded', 'disconnected', 'expired')),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    connection_id
  ),
  UNIQUE (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_generation
  ),
  UNIQUE (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation
  ),
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  ) REFERENCES concurrent_browser_clients (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  ) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concurrent_browser_current_connection
  ON concurrent_browser_connections (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  )
  WHERE state = 'active';

CREATE TABLE IF NOT EXISTS concurrent_browser_access_grants (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  client_installation_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    conversation_id
  ),
  FOREIGN KEY (organization_id, assistant_id, conversation_id)
    REFERENCES concurrent_conversations (
      organization_id,
      assistant_id,
      conversation_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  ) REFERENCES concurrent_browser_clients (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id
  ) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS concurrent_browser_sessions (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  client_installation_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_generation BIGINT NOT NULL CHECK (connection_generation > 0),
  browser_session_id TEXT NOT NULL,
  tab_lease_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'agent' CHECK (owner IN ('agent', 'human')),
  status TEXT NOT NULL DEFAULT 'opening'
    CHECK (status IN ('opening', 'active', 'paused', 'closed', 'expired', 'invalidated')),
  document_epoch BIGINT NOT NULL DEFAULT 0 CHECK (document_epoch >= 0),
  snapshot_id TEXT,
  owner_lease_expires_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    browser_session_id
  ),
  UNIQUE (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    tab_lease_id
  ),
  UNIQUE (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    browser_session_id,
    tab_lease_id
  ),
  FOREIGN KEY (organization_id, assistant_id, conversation_id)
    REFERENCES concurrent_conversations (
      organization_id,
      assistant_id,
      conversation_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation
  ) REFERENCES concurrent_browser_connections (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation
  ) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concurrent_browser_active_session
  ON concurrent_browser_sessions (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    conversation_id
  )
  WHERE status IN ('opening', 'active', 'paused');

CREATE TABLE IF NOT EXISTS concurrent_run_steps (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  step_kind TEXT NOT NULL CHECK (step_kind IN ('provider_response', 'tool_result')),
  provider_content JSONB NOT NULL,
  tool_use_id TEXT,
  execution_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, assistant_id, run_id, step_index),
  UNIQUE (
    organization_id,
    assistant_id,
    run_id,
    tool_use_id,
    step_kind
  ),
  FOREIGN KEY (organization_id, assistant_id, run_id)
    REFERENCES concurrent_runs (organization_id, assistant_id, run_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS concurrent_browser_actions (
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_sequence BIGINT NOT NULL CHECK (action_sequence > 0),
  browser_session_id TEXT,
  tab_lease_id TEXT,
  client_installation_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_generation BIGINT NOT NULL CHECK (connection_generation > 0),
  operation JSONB NOT NULL,
  operation_hash TEXT NOT NULL,
  replay_class TEXT NOT NULL CHECK (replay_class IN ('recomputable', 'non_replayable')),
  expected_document_epoch BIGINT CHECK (expected_document_epoch >= 0),
  deadline_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN (
    'queued',
    'delivered',
    'received',
    'executing',
    'succeeded',
    'failed',
    'cancel_requested',
    'cancelled',
    'expired',
    'unknown_outcome'
  )),
  result_hash TEXT,
  result JSONB,
  error JSONB,
  delivered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  executing_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, assistant_id, user_id, actor_id, action_id),
  UNIQUE (organization_id, assistant_id, run_id, tool_use_id),
  UNIQUE (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    browser_session_id,
    action_sequence
  ),
  FOREIGN KEY (organization_id, assistant_id, run_id)
    REFERENCES concurrent_runs (organization_id, assistant_id, run_id)
    ON DELETE CASCADE,
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation
  ) REFERENCES concurrent_browser_connections (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation
  ) ON DELETE RESTRICT,
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    browser_session_id,
    tab_lease_id
  ) REFERENCES concurrent_browser_sessions (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    browser_session_id,
    tab_lease_id
  ) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_concurrent_browser_actions_recovery
  ON concurrent_browser_actions (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    state,
    deadline_at
  );

CREATE TABLE IF NOT EXISTS concurrent_browser_outbox (
  seq BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  client_installation_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_generation BIGINT NOT NULL CHECK (connection_generation > 0),
  action_id TEXT NOT NULL,
  event JSONB NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    action_id
  ) REFERENCES concurrent_browser_actions (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    action_id
  ) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_concurrent_browser_outbox_delivery
  ON concurrent_browser_outbox (
    organization_id,
    assistant_id,
    user_id,
    actor_id,
    client_installation_id,
    connection_id,
    connection_generation,
    seq
  )
  WHERE acknowledged_at IS NULL;

CREATE OR REPLACE FUNCTION concurrent_browser_scope_matches(
  row_organization_id TEXT,
  row_assistant_id TEXT,
  row_user_id TEXT,
  row_actor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT
    row_organization_id = current_setting('worklin.organization_id', true)
    AND row_assistant_id = current_setting('worklin.assistant_id', true)
    AND row_user_id = current_setting('worklin.user_id', true)
    AND row_actor_id = current_setting('worklin.actor_id', true)
$$;

DROP POLICY IF EXISTS concurrent_conversations_tenant
  ON concurrent_conversations;
CREATE POLICY concurrent_conversations_tenant ON concurrent_conversations
  USING (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND (
      (owner_user_id IS NULL AND owner_actor_id IS NULL)
      OR (
        owner_user_id = current_setting('worklin.user_id', true)
        AND owner_actor_id = current_setting('worklin.actor_id', true)
      )
    )
  )
  WITH CHECK (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND (
      (owner_user_id IS NULL AND owner_actor_id IS NULL)
      OR (
        owner_user_id = current_setting('worklin.user_id', true)
        AND owner_actor_id = current_setting('worklin.actor_id', true)
      )
    )
  );

DROP POLICY IF EXISTS concurrent_messages_tenant ON concurrent_messages;
CREATE POLICY concurrent_messages_tenant ON concurrent_messages
  USING (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_messages.organization_id
        AND owned_conversation.assistant_id = concurrent_messages.assistant_id
        AND owned_conversation.conversation_id = concurrent_messages.conversation_id
    )
  )
  WITH CHECK (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_messages.organization_id
        AND owned_conversation.assistant_id = concurrent_messages.assistant_id
        AND owned_conversation.conversation_id = concurrent_messages.conversation_id
    )
  );

DROP POLICY IF EXISTS concurrent_runs_tenant ON concurrent_runs;
CREATE POLICY concurrent_runs_tenant ON concurrent_runs
  USING (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_runs.organization_id
        AND owned_conversation.assistant_id = concurrent_runs.assistant_id
        AND owned_conversation.conversation_id = concurrent_runs.conversation_id
    )
  )
  WITH CHECK (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_runs.organization_id
        AND owned_conversation.assistant_id = concurrent_runs.assistant_id
        AND owned_conversation.conversation_id = concurrent_runs.conversation_id
    )
  );

DROP POLICY IF EXISTS concurrent_events_tenant ON concurrent_events;
CREATE POLICY concurrent_events_tenant ON concurrent_events
  USING (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_events.organization_id
        AND owned_conversation.assistant_id = concurrent_events.assistant_id
        AND owned_conversation.conversation_id = concurrent_events.conversation_id
    )
  )
  WITH CHECK (
    organization_id = current_setting('worklin.organization_id', true)
    AND assistant_id = current_setting('worklin.assistant_id', true)
    AND EXISTS (
      SELECT 1 FROM concurrent_conversations AS owned_conversation
      WHERE owned_conversation.organization_id = concurrent_events.organization_id
        AND owned_conversation.assistant_id = concurrent_events.assistant_id
        AND owned_conversation.conversation_id = concurrent_events.conversation_id
    )
  );

ALTER TABLE concurrent_browser_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_run_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_browser_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concurrent_browser_clients_scope
  ON concurrent_browser_clients;
CREATE POLICY concurrent_browser_clients_scope ON concurrent_browser_clients
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_browser_connections_scope
  ON concurrent_browser_connections;
CREATE POLICY concurrent_browser_connections_scope ON concurrent_browser_connections
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_browser_access_grants_scope
  ON concurrent_browser_access_grants;
CREATE POLICY concurrent_browser_access_grants_scope ON concurrent_browser_access_grants
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_browser_sessions_scope
  ON concurrent_browser_sessions;
CREATE POLICY concurrent_browser_sessions_scope ON concurrent_browser_sessions
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_run_steps_scope ON concurrent_run_steps;
CREATE POLICY concurrent_run_steps_scope ON concurrent_run_steps
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_browser_actions_scope
  ON concurrent_browser_actions;
CREATE POLICY concurrent_browser_actions_scope ON concurrent_browser_actions
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

DROP POLICY IF EXISTS concurrent_browser_outbox_scope
  ON concurrent_browser_outbox;
CREATE POLICY concurrent_browser_outbox_scope ON concurrent_browser_outbox
  USING (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id))
  WITH CHECK (concurrent_browser_scope_matches(organization_id, assistant_id, user_id, actor_id));

INSERT INTO concurrent_runtime_schema_migrations (version, name)
VALUES (2, 'browser_broker')
ON CONFLICT (version) DO NOTHING;
`;
