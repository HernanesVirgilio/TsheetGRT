-- Reparação limitada: acrescenta apenas as colunas em falta, sem aplicar as migrations completas.
ALTER TABLE public.meeting_participants
    ADD COLUMN IF NOT EXISTS response VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS response_comment TEXT;

ALTER TABLE public.meetings
    ADD COLUMN IF NOT EXISTS request_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS requested_with UUID,
    ADD COLUMN IF NOT EXISTS request_decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS request_decision_comment TEXT,
    ADD COLUMN IF NOT EXISTS request_proposed_starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS request_proposed_ends_at TIMESTAMPTZ;
