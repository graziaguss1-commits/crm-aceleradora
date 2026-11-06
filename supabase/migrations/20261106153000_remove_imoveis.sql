-- Restos do template de imobiliária. Na matriz do CRM para clínicas nenhuma
-- tela usa mais imóveis (a busca de imóveis compatíveis e a visita a imóvel
-- foram removidas). Tabela e coluna estavam vazias quando foram removidas.
alter table public.contacts drop column if exists imovel_interesse_id;
drop table if exists public.imoveis;
