CREATE TABLE public.telegram_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  chat_id BIGINT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error TEXT,
  preview TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.telegram_deliveries TO authenticated;
GRANT ALL ON public.telegram_deliveries TO service_role;
ALTER TABLE public.telegram_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read their own deliveries"
ON public.telegram_deliveries FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators record their own deliveries"
ON public.telegram_deliveries FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE INDEX telegram_deliveries_created_at_idx ON public.telegram_deliveries (created_at DESC);

CREATE TABLE public.mode_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  chat_id BIGINT,
  from_mode TEXT,
  to_mode TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','telegram')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.mode_events TO authenticated;
GRANT ALL ON public.mode_events TO service_role;
ALTER TABLE public.mode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read their own mode switches"
ON public.mode_events FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators record their own mode switches"
ON public.mode_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE INDEX mode_events_created_at_idx ON public.mode_events (created_at DESC);