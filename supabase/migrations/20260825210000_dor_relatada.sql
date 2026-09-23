-- A dor relatada pelo lead na primeira conversa: o que ele veio resolver, nas
-- palavras dele. Nao havia nenhum campo de texto livre no cadastro, entao esse
-- dado - o mais util na hora do follow-up e do fechamento - se perdia.
-- Aplicado no Supabase via MCP em 2026-08-25; espelho para historico.
alter table public.deals add column if not exists dor_relatada text null;
