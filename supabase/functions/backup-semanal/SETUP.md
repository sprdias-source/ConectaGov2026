# Backup Automático por E-mail — Guia de Configuração

Este é o passo a passo completo para ativar o backup automático diário,
enviado por e-mail. É um pouco mais trabalhoso que os outros SQLs porque
envolve 3 serviços conversando entre si (Supabase + Resend + um agendador).
Faça com calma, na ordem.

## Passo 1 — Criar conta no Resend

1. Acesse **https://resend.com** e crie uma conta gratuita
2. Confirme seu e-mail
3. No painel, vá em **API Keys** → **Create API Key**
4. Dê um nome (ex: "ConectaGov Backup") e copie a chave gerada
   (começa com `re_...`) — guarde em um lugar seguro, você vai precisar dela
   no Passo 4

## Passo 2 — Ativar extensões no Supabase

1. No painel do Supabase, vá em **Database** → **Extensions**
2. Procure por **pg_cron** e clique para ativar (Enable)
3. Procure por **pg_net** e clique para ativar também

## Passo 3 — Publicar a Edge Function

Isso exige a ferramenta de linha de comando do Supabase (Supabase CLI).
Se você não tem experiência com terminal, este é o passo mais técnico —
me avise se quiser que eu te ajude em tempo real aqui no chat.

1. Instale a Supabase CLI: https://supabase.com/docs/guides/cli
2. No terminal, dentro da pasta do projeto, rode:
   ```
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase functions deploy backup-semanal
   ```
   (o `SEU_PROJECT_REF` é a parte do meio da sua URL do Supabase, tipo
   `pdsxigexvxosahdcnsak`)

## Passo 4 — Configurar os segredos da função

1. No painel do Supabase, vá em **Edge Functions** → clique em `backup-semanal`
2. Vá na aba **Secrets** (ou "Settings")
3. Adicione 3 segredos:
   - `RESEND_API_KEY` → a chave que você copiou no Passo 1
   - `BACKUP_EMAIL_TO` → o e-mail que vai receber o backup (o seu)
   - `BACKUP_EMAIL_FROM` → use `onboarding@resend.dev` por enquanto
     (é um domínio de teste do próprio Resend, funciona sem configuração
     extra; depois, se quiser, pode configurar um domínio próprio)

## Passo 5 — Agendar a execução automática

1. Abra o arquivo `006_backup_automatico.sql`
2. Substitua `<PROJECT_REF>` pela referência do seu projeto Supabase
3. Substitua `<ANON_KEY>` pela sua chave anon (a mesma que você já usa no `.env.local`)
4. Cole o conteúdo no **SQL Editor** do Supabase e clique em **Run**

## Passo 6 — Testar manualmente (antes de esperar o agendamento)

No painel do Supabase, vá em **Edge Functions** → `backup-semanal` → clique
em **Invoke** (ou "Test") para disparar manualmente uma vez e confirmar que
o e-mail chega certo. Se der erro, a mensagem geralmente aponta exatamente
qual configuração está faltando.

## Frequência

Por padrão, configurei para rodar **todo dia às 6h da manhã** (horário de
Brasília, ajustado para UTC no script). Se preferir só uma vez por semana,
troque a linha do cron em `006_backup_automatico.sql` de `'0 6 * * *'`
para `'0 6 * * 1'` (toda segunda-feira) antes de rodar o SQL.
