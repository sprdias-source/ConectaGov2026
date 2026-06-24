# ConectaGov — Sistema de Gestão de Licitações & Financeiro

Sistema completo para assessorias de licitações públicas: cadastro de
clientes, acompanhamento de licitações, gestão de empenhos e comissões,
fluxo de caixa, contratos, recibos, folha de pagamento e indicadores
contábeis avançados.

## Arquitetura

- **Frontend:** React + TypeScript + Tailwind CSS, publicado como site estático
- **Banco de dados:** Supabase (PostgreSQL gerenciado, com backup automático diário)
- **Autenticação:** Supabase Auth (e-mail + senha)
- **Hospedagem recomendada:** Vercel (gratuito, sem necessidade de servidor próprio)

Todos os dados ficam no banco de dados — não em `localStorage` — então um
bug no site não consegue apagar ou corromper dados já salvos.

## Passo a passo para colocar no ar

### 1. Configurar o banco de dados (uma única vez)

1. Acesse seu projeto em https://supabase.com
2. Vá em **SQL Editor** → **New query**
3. Cole o conteúdo de `supabase/migrations/001_initial_schema.sql` e clique em **Run**
4. Repita o processo colando o conteúdo de `supabase/migrations/002_storage.sql`

### 2. Publicar o site (Vercel)

1. Crie uma conta gratuita em https://vercel.com (pode usar login do GitHub)
2. Crie um repositório no GitHub e suba esta pasta do projeto
3. Na Vercel, clique em **Add New → Project** e selecione o repositório
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = (a URL do seu projeto Supabase)
   - `VITE_SUPABASE_ANON_KEY` = (a chave anon public do seu projeto)
5. Clique em **Deploy**

Em poucos minutos o site estará no ar, com um link próprio
(ex: `conectagov.vercel.app`), acessível do computador e do celular.

### 3. Criar sua conta de acesso

Acesse o site publicado e use a aba **Criar conta** na tela de login,
com seu e-mail e uma senha. Isso já é suficiente — os dados ficam
isolados e protegidos por usuário automaticamente.

## Desenvolvimento local (opcional)

```bash
npm install
cp .env.example .env.local   # depois edite com suas credenciais reais
npm run dev
```

## Backup

Veja `BACKUP.md` para detalhes sobre como os dados são protegidos e
como exportar uma cópia manual a qualquer momento.
