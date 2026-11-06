import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SituacaoClinica {
  tem_clinica: boolean;
  ativa: boolean;
  nome: string | null;
}

/**
 * Situação da clínica do usuário logado e se ele é admin da plataforma SISA.
 * Clínica desativada (ou usuário sem clínica) perde o acesso aos dados pelo
 * banco; esta consulta só serve para mostrar a tela certa.
 */
export function useClinicaAcesso() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["clinica-acesso", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [sit, admin] = await Promise.all([
        (supabase as any).rpc("minha_clinica_situacao"),
        (supabase as any).rpc("is_platform_admin"),
      ]);
      return {
        situacao: (sit.data ?? { tem_clinica: false, ativa: false, nome: null }) as SituacaoClinica,
        admin: admin.data === true,
      };
    },
  });
}
