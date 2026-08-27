# Instruções para o Claude neste repositório

- Sempre que uma migração SQL nova for criada em `supabase/migrations/`, cole o
  conteúdo completo do SQL na resposta ao usuário (não só o caminho do
  arquivo) — o usuário aplica manualmente no SQL Editor do Supabase e prefere
  não precisar abrir o arquivo pra copiar.
- O mesmo vale pra qualquer código de Edge Function (`supabase/functions/`)
  que o usuário precise colar manualmente no Dashboard do Supabase: sempre
  cole o conteúdo completo do arquivo na resposta, nunca só o caminho ou um
  anexo pra baixar.
