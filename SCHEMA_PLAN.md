# Plano de Schema — ConectaGov

## Tabelas principais (1 linha = 1 registro, nunca JSON gigante)

- clients (clientes/parceiros)
- biddings (licitações)
- empenhos
- financial_accounts (contas e cartões)
- transactions (lançamentos a pagar/receber)
- employees (funcionários/colaboradores)
- payroll_payments (pagamentos de folha lançados)
- categories_pagar / categories_receber (ou uma tabela única `categories` com `type`)
- contracts (contratos gerados)
- receipts (recibos/orçamentos emitidos)
- attached_files (metadados; arquivo real no Supabase Storage)
- audit_logs

## Princípios
- Toda tabela com `created_at`, `updated_at` (triggers automáticos)
- Toda tabela com `user_id` (Row Level Security — cada usuário só vê o que é seu)
- Exclusões em cascata tratadas via foreign keys (ON DELETE) em vez de lógica manual no frontend
- Nada de localStorage como fonte de verdade — só cache leve, se necessário
- Arquivos: salvos no Supabase Storage, tabela guarda só o path/metadados
