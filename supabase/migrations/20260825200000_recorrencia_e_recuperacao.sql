-- 1) Bloqueios que se repetem (ex.: reuniao a cada 15 dias). As ocorrencias sao
--    gravadas como linhas individuais e compartilham um grupo_id, o que permite
--    apagar so uma data ou a serie inteira.
alter table public.agenda_bloqueios add column if not exists grupo_id uuid null;
create index if not exists agenda_bloqueios_grupo_idx on public.agenda_bloqueios (grupo_id);

-- 2) Faltas e cancelamentos a recuperar: a recepcao marca como tratado e o item
--    sai do painel, sem alterar o status da consulta (que segue sendo historico).
alter table public.activities add column if not exists resolvido_em timestamptz null;
