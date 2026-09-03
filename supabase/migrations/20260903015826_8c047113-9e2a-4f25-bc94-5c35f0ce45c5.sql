ALTER TABLE public.chat_threads ADD COLUMN telegram_chat_id BIGINT;
CREATE UNIQUE INDEX chat_threads_telegram_chat_id_key ON public.chat_threads (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;