import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromGrupoContabilRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { GrupoContabil } from '../types/domain'

// Grupo contábil de 2 níveis (Grupo → Categoria) pra organizar a DRE do
// jeito que o contador entrega — não é um plano de contas totalmente
// codificado (não faz sentido pro porte da empresa). "Fora da DRE" marca
// grupos que são movimentação de patrimônio líquido, não despesa/receita de
// resultado (ex: Distribuição de Lucros, Retirada de Sócio) — a DRE soma só
// os grupos com entraDre = true.
const DEFAULT_GRUPOS_PAGAR: { nome: string; ordem: number; entraDre: boolean }[] = [
  { nome: 'Despesas com Pessoal', ordem: 1, entraDre: true },
  { nome: 'Despesas Tributárias', ordem: 2, entraDre: true },
  { nome: 'Despesas Administrativas', ordem: 3, entraDre: true },
  { nome: 'Despesas Comerciais', ordem: 4, entraDre: true },
  { nome: 'Outras Despesas', ordem: 5, entraDre: true },
  { nome: 'Distribuição de Lucros e Retiradas', ordem: 6, entraDre: false },
]

const DEFAULT_GRUPOS_RECEBER: { nome: string; ordem: number; entraDre: boolean }[] = [
  { nome: 'Receita de Serviços', ordem: 1, entraDre: true },
  { nome: 'Receita de Comissões', ordem: 2, entraDre: true },
  { nome: 'Outras Receitas', ordem: 3, entraDre: true },
]

// Mapa das categorias padrão (DEFAULT_PAGAR/DEFAULT_RECEBER de
// useCategories.ts) pro grupo correspondente — qualquer categoria que não
// esteja aqui (inclusive uma criada pelo próprio usuário) cai no grupo
// "Outras Despesas"/"Outras Receitas", nunca fica sem grupo.
const CATEGORIA_PARA_GRUPO: Record<string, string> = {
  'Folha de Pagamento': 'Despesas com Pessoal',
  'Pró-Labore': 'Despesas com Pessoal',
  'INSS a Recolher (GPS)': 'Despesas com Pessoal',
  'IRRF a Recolher (DARF)': 'Despesas com Pessoal',
  'FGTS a Recolher': 'Despesas com Pessoal',
  'Impostos (DAS/Simples)': 'Despesas Tributárias',
  'ISS': 'Despesas Tributárias',
  'Aluguel': 'Despesas Administrativas',
  'Internet e Telefone': 'Despesas Administrativas',
  'Contabilidade': 'Despesas Administrativas',
  'Material de Escritório': 'Despesas Administrativas',
  'Taxas de Cartório/Envios': 'Despesas Administrativas',
  'Sistemas de Licitação (Apoio)': 'Despesas Comerciais',
  'Marketing/Anúncios': 'Despesas Comerciais',
  'Outros Gastos': 'Outras Despesas',
  'Distribuição de Lucros': 'Distribuição de Lucros e Retiradas',
  'Retirada de Sócio': 'Distribuição de Lucros e Retiradas',
  'Mensalidade Assessoria': 'Receita de Serviços',
  'Taxa de Participação Individual': 'Receita de Serviços',
  'Consultoria Avulsa': 'Receita de Serviços',
  'Comissão de Êxito (Licitação Ganha)': 'Receita de Comissões',
  'Comissão de Êxito (Projetada - 12 meses)': 'Receita de Comissões',
  'Outras Receitas': 'Outras Receitas',
}

// Categorias novas que a Fase 4 (Pró-labore × Distribuição de Lucro ×
// Retirada de Sócio) precisa que existam — mesmo padrão de "complementa o
// que falta" que useCategories.ts já usa pra INSS/IRRF/FGTS.
const CATEGORIAS_SOCIO_NOVAS = ['Distribuição de Lucros', 'Retirada de Sócio']

export function useGruposContabeis() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['grupos_contabeis'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('grupos_contabeis').select('*').order('type').order('ordem')
      if (error) throw error
      if (!user) return data.map(fromGrupoContabilRow)

      let grupos = data

      if (grupos.length === 0) {
        const seed = [
          ...DEFAULT_GRUPOS_PAGAR.map((g) => ({ user_id: user.id, type: 'Pagar', nome: g.nome, ordem: g.ordem, entra_dre: g.entraDre })),
          ...DEFAULT_GRUPOS_RECEBER.map((g) => ({ user_id: user.id, type: 'Receber', nome: g.nome, ordem: g.ordem, entra_dre: g.entraDre })),
        ]
        const { data: seeded, error: seedError } = await supabase.from('grupos_contabeis').insert(seed).select()
        if (seedError) throw seedError
        grupos = seeded
      }

      const grupoIdPorNome = new Map(grupos.map((g) => [g.nome, g.id]))

      // Garante as categorias novas da Fase 4 (Distribuição de Lucros /
      // Retirada de Sócio) antes de reagrupar — senão elas nunca existiriam
      // pra aparecer no seletor de categoria do formulário de lançamento.
      const { data: categoriasAtuais, error: catError } = await supabase.from('categories').select('*')
      if (catError) throw catError

      const nomesExistentesPagar = new Set(categoriasAtuais.filter((c) => c.type === 'Pagar').map((c) => c.name))
      const faltantes = CATEGORIAS_SOCIO_NOVAS.filter((nome) => !nomesExistentesPagar.has(nome))
      let todasCategorias = categoriasAtuais
      if (faltantes.length > 0) {
        const { data: adicionadas, error: addError } = await supabase
          .from('categories')
          .insert(faltantes.map((name) => ({ user_id: user.id, type: 'Pagar', name })))
          .select()
        if (!addError && adicionadas) {
          todasCategorias = [...categoriasAtuais, ...adicionadas]
        }
      }

      // Reagrupa qualquer categoria (existente ou recém-criada) que ainda
      // não tenha grupo_id — roda toda vez, não só na primeira carga, pra
      // pegar categorias criadas antes desta migração ou fora do mapa padrão.
      const semGrupo = todasCategorias.filter((c) => !c.grupo_id)
      for (const cat of semGrupo) {
        const nomeGrupo = CATEGORIA_PARA_GRUPO[cat.name] ?? (cat.type === 'Pagar' ? 'Outras Despesas' : 'Outras Receitas')
        const grupoId = grupoIdPorNome.get(nomeGrupo)
        if (grupoId) {
          await supabase.from('categories').update({ grupo_id: grupoId }).eq('id', cat.id)
        }
      }
      if (semGrupo.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      }

      return grupos.map(fromGrupoContabilRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grupos_contabeis'] })

  const addGrupo = useMutation({
    mutationFn: async ({ type, nome, entraDre }: { type: 'Pagar' | 'Receber'; nome: string; entraDre: boolean }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const ordemMax = Math.max(0, ...grupos.filter((g) => g.type === type).map((g) => g.ordem))
      const { error } = await supabase
        .from('grupos_contabeis')
        .insert({ user_id: user.id, type, nome, ordem: ordemMax + 1, entra_dre: entraDre })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const grupos: GrupoContabil[] = query.data ?? []

  return {
    grupos,
    gruposPagar: grupos.filter((g) => g.type === 'Pagar'),
    gruposReceber: grupos.filter((g) => g.type === 'Receber'),
    isLoading: query.isLoading,
    addGrupo,
  }
}
