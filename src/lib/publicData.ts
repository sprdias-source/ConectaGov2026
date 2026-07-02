// Serviços de consulta de dados públicos para autopreenchimento de
// formulários. Usa BrasilAPI (CNPJ) e ViaCEP (endereço), ambas gratuitas
// e sem necessidade de chave de API.

export interface CnpjData {
  razaoSocial: string
  nomeFantasia: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
}

export interface CepData {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export async function fetchCnpjData(cnpjRaw: string): Promise<{ data?: CnpjData; error?: string }> {
  const cnpj = onlyDigits(cnpjRaw)
  if (cnpj.length !== 14) {
    return { error: 'CNPJ deve ter 14 dígitos.' }
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    if (!res.ok) {
      if (res.status === 404) return { error: 'CNPJ não encontrado na Receita Federal.' }
      return { error: 'Não foi possível consultar o CNPJ agora. Tente novamente em alguns instantes.' }
    }
    const json = await res.json()
    return {
      data: {
        razaoSocial: json.razao_social ?? '',
        nomeFantasia: json.nome_fantasia ?? '',
        logradouro: json.logradouro ?? '',
        numero: json.numero ?? '',
        bairro: json.bairro ?? '',
        municipio: json.municipio ?? '',
        uf: json.uf ?? '',
        cep: json.cep ?? '',
        telefone: json.ddd_telefone_1 ?? '',
        email: json.email ?? '',
      },
    }
  } catch {
    return { error: 'Falha de conexão ao consultar o CNPJ. Verifique sua internet.' }
  }
}

export async function fetchCepData(cepRaw: string): Promise<{ data?: CepData; error?: string }> {
  const cep = onlyDigits(cepRaw)
  if (cep.length !== 8) {
    return { error: 'CEP deve ter 8 dígitos.' }
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if (!res.ok) return { error: 'Não foi possível consultar o CEP agora.' }
    const json = await res.json()
    if (json.erro) return { error: 'CEP não encontrado.' }
    return {
      data: {
        logradouro: json.logradouro ?? '',
        bairro: json.bairro ?? '',
        localidade: json.localidade ?? '',
        uf: json.uf ?? '',
      },
    }
  } catch {
    return { error: 'Falha de conexão ao consultar o CEP. Verifique sua internet.' }
  }
}

export function formatCnpjMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatCepMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)
  return digits.replace(/^(\d{5})(\d)/, '$1-$2')
}
