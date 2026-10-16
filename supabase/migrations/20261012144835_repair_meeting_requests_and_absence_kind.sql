ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS requested_with uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_status varchar(30) NULL,
  ADD COLUMN IF NOT EXISTS request_decided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS request_decision_comment text NULL;

COMMENT ON COLUMN public.meetings.requested_with IS
  'Profile whose time was requested for this meeting; NULL for ordinary meetings.';
COMMENT ON COLUMN public.meetings.request_status IS
  'Status of the manager-meeting request; NULL for ordinary meetings.';
COMMENT ON COLUMN public.meetings.request_decided_at IS
  'Timestamp when the meeting request was accepted or rejected.';
COMMENT ON COLUMN public.meetings.request_decision_comment IS
  'Optional explanation for the meeting request decision.';

CREATE INDEX IF NOT EXISTS idx_meetings_requested_with_request_status
  ON public.meetings (requested_with, request_status)
  WHERE requested_with IS NOT NULL;

ALTER TABLE public.absence_requests
  ADD COLUMN IF NOT EXISTS kind varchar(30) NOT NULL DEFAULT 'REQUEST';

COMMENT ON COLUMN public.absence_requests.kind IS
  'REQUEST for formal absence approval; NOTICE for communicating unavailability without treating it as approved leave.';

NOTIFY pgrst, 'reload schema';
