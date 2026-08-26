CREATE TABLE public.telegram_chats (
  chat_id BIGINT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'secretary' CHECK (mode IN ('secretary','kelvin')),
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  business_connection_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_chats TO service_role;

ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_telegram_chats_updated_at
BEFORE UPDATE ON public.telegram_chats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();