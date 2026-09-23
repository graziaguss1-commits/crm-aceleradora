-- Temperatura estava em dois lugares: o campo contacts.temperatura (que
-- alimenta os dashboards) e tags de categoria 'temperatura' (que nao entravam
-- em nenhuma conta). Duas fontes para o mesmo dado, com risco real de
-- divergirem: campo dizendo "frio" e tag dizendo "quente" no mesmo lead.
-- O campo fica; as tags saem.
-- Aplicado no Supabase via MCP em 2026-08-25; espelho para historico.

-- Preserva a informacao antes de apagar: se o lead tinha a tag mas o campo
-- estava vazio, o campo herda o valor da tag.
update public.contacts c
   set temperatura = lower(t.name)
  from public.contact_tags ct
  join public.tags t on t.id = ct.tag_id
 where ct.contact_id = c.id
   and t.categoria = 'temperatura'
   and c.temperatura is null;

delete from public.contact_tags
 where tag_id in (select id from public.tags where categoria = 'temperatura');

delete from public.tags where categoria = 'temperatura';
