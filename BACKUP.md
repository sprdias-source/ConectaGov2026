# Estratégia de Backup — ConectaGov

## O que já vem de fábrica (Supabase, gratuito)

O Supabase faz **backup automático diário** do banco de dados inteiro,
guardado por vários dias. Isso roda sozinho, sem você precisar fazer nada.
Em caso de qualquer problema grave, é possível restaurar o banco para
qualquer um desses pontos no tempo direto pelo painel do Supabase
(Project Settings → Database → Backups).

Isso já cobre o medo principal: **"se der bug, os dados não podem se perder"**.
Como os dados moram no banco (não no navegador), um bug no site não consegue
apagar o banco — na pior das hipóteses, alguém teria que apagar
manualmente e de propósito.

## Camada extra que o próprio app vai ter

Além do backup automático do Supabase, o sistema vai ter um botão
**"Exportar Backup Completo"** (na tela de Configurações/Sincronização)
que gera um arquivo `.json` com todos os seus dados, para você guardar
onde quiser (Google Drive, e-mail para você mesmo, pendrive). Recomendo
fazer isso a cada poucas semanas, ou antes de qualquer atualização grande
do sistema.

## Por que isso é mais confiável que o sistema antigo

O sistema antigo guardava tudo em `localStorage` (só no navegador) e
"sincronizava" copiando esse JSON inteiro para o servidor a cada 4
segundos — se o navegador travasse no meio disso, ou dois dispositivos
escrevessem ao mesmo tempo, dados podiam se perder ou voltar para uma
versão antiga, e isso não tinha como ser recuperado depois.

Agora, cada clique seu (criar um cliente, marcar uma conta como paga)
é uma transação direta e definitiva no banco de dados — não existe
"estado intermediário" que pode se perder.
