CREATE TABLE public.visitor_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  name TEXT NOT NULL,
  company TEXT,
  purpose TEXT NOT NULL,
  preferred_time TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','closed')),
  operator_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_visitor_requests_chat_id ON public.visitor_requests (chat_id);
CREATE INDEX idx_visitor_requests_created_at ON public.visitor_requests (created_at DESC);

GRANT SELECT, UPDATE ON public.visitor_requests TO authenticated;
GRANT ALL ON public.visitor_requests TO service_role;

ALTER TABLE public.visitor_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read requests"
  ON public.visitor_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators can update requests"
  ON public.visitor_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_visitor_requests_updated_at
  BEFORE UPDATE ON public.visitor_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();