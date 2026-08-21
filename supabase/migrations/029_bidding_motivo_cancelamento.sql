alter table biddings add column if not exists motivo_cancelamento text;

comment on column biddings.motivo_cancelamento is 'Motivo registrado quando o órgão cancela o edital (status = Cancelada) — análogo a motivo_perda (status Perdeu) e motivo_desistencia (status Desistiu).';
