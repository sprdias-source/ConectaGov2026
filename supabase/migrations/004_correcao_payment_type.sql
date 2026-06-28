-- ============================================================================
-- ConectaGov — Migração 004: Correção da constraint de tipo de vínculo
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001, 002 e 003.
--
-- O QUE CORRIGE: o código já permitia cadastrar colaboradores como
-- "Sócio/Pró-labore", mas o banco de dados ainda tinha uma regra antiga
-- que só aceitava CLT, PJ, Autônomo ou Estágio — causando o erro
-- "violates check constraint employees_payment_type_check" ao tentar
-- salvar um colaborador desse tipo.

alter table employees drop constraint if exists employees_payment_type_check;

alter table employees add constraint employees_payment_type_check
  check (payment_type in ('CLT','PJ','Autônomo','Estágio','Sócio/Pró-labore'));

-- ----------------------------------------------------------------------------
-- Função de diagnóstico: permite que o próprio app verifique, com segurança
-- e sem inserir dados de teste, se a constraint de payment_type já foi
-- corrigida. Usada pela página /diagnostico do sistema.
-- ----------------------------------------------------------------------------
create or replace function check_employees_payment_type_constraint()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from pg_constraint
    where conname = 'employees_payment_type_check'
      and pg_get_constraintdef(oid) like '%Sócio/Pró-labore%'
  );
$$;

grant execute on function check_employees_payment_type_constraint() to authenticated;
