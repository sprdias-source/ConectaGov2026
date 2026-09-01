import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import AbaGerencial from '../components/contabilidade/AbaGerencial'
import AbaContabil from '../components/contabilidade/AbaContabil'
import AbaFiscal from '../components/contabilidade/AbaFiscal'
import AbaPessoal from '../components/contabilidade/AbaPessoal'

type Aba = 'gerencial' | 'contabil' | 'fiscal' | 'pessoal'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'gerencial', label: 'Gerencial' },
  { key: 'contabil', label: 'Contábil' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'pessoal', label: 'Pessoal (DP)' },
]

// Contabilidade reorganizada em módulos: Gerencial (indicadores estratégicos
// e de licitação, mantido sem nenhuma mudança de comportamento — só passou
// a viver numa aba), Contábil (DRE profissional + Balanço Patrimonial),
// Fiscal (regime tributário, RBT12/DAS, tipos de serviço, notas fiscais) e
// Pessoal (folha reaproveitada de Funcionários + Fator R). É um painel de
// CONFERÊNCIA — a apuração fiscal oficial continua com a contabilidade
// externa.
export default function ContabilidadePage() {
  const [aba, setAba] = useState<Aba>('gerencial')

  return (
    <div className="pb-10">
      <PageHeader
        title="Contabilidade"
        subtitle="Visão gerencial, contábil, fiscal e de pessoal — painel de conferência, a apuração oficial continua com o contador"
        icon={Calculator}
      />

      <div className="px-6 mt-4">
        <div className="flex gap-1 bg-base-900 border border-base-800 rounded-lg p-1 w-fit screen-only">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition ${aba === a.key ? 'bg-accent-500 text-base-950' : 'text-base-400 hover:text-base-100'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'gerencial' && <AbaGerencial />}
      {aba === 'contabil' && <AbaContabil />}
      {aba === 'fiscal' && <AbaFiscal />}
      {aba === 'pessoal' && <AbaPessoal />}
    </div>
  )
}
