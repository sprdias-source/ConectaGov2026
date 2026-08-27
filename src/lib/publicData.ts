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

// Valida o CPF pelo algoritmo padrão de dígito verificador (módulo 11) —
// até aqui só se checava o FORMATO (11 dígitos, com máscara), então um CPF
// "bem formado" mas matematicamente inválido (ex: 111.111.111-11) passava
// batido e só ia quebrar depois, numa integração de verdade (emissão de
// NFS-e no portal da prefeitura, busca de certidão).
export function validarCpf(cpfRaw: string): boolean {
  const cpf = onlyDigits(cpfRaw)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoInicial - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  const d1 = calcularDigito(cpf.slice(0, 9), 10)
  const d2 = calcularDigito(cpf.slice(0, 9) + d1, 11)
  return cpf.endsWith(`${d1}${d2}`)
}

// Mesma ideia, algoritmo do CNPJ (dois dígitos verificadores, pesos
// diferentes do CPF).
export function validarCnpj(cnpjRaw: string): boolean {
  const cnpj = onlyDigits(cnpjRaw)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calcularDigito = (base: string): number => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calcularDigito(cnpj.slice(0, 12))
  const d2 = calcularDigito(cnpj.slice(0, 12) + d1)
  return cnpj.endsWith(`${d1}${d2}`)
}
