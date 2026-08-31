CREATE TABLE public.access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX access_logs_created_at_idx ON public.access_logs (created_at DESC);

GRANT SELECT ON public.access_logs TO authenticated;
GRANT ALL ON public.access_logs TO service_role;

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read access logs"
  ON public.access_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledgement_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX notices_recipient_idx ON public.notices (recipient_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and recipients can read notices"
  ON public.notices FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Recipients can acknowledge their own notices"
  ON public.notices FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE TRIGGER update_notices_updated_at
  BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();