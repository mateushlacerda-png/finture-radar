/**
 * Contratos de integração. NENHUMA integração está ativa no MVP: só os tipos, para que a
 * implementação entre sem mexer em quem consome. Ver docs/ARQUITETURA.md, seção Integrações.
 *
 * Padrão de entrega: outbox. A action de negócio grava o evento na mesma transação
 * (tabela integration_outbox, fase 3) e um worker publica com retry e idempotência.
 * Segredos (tokens, chaves) só em variáveis de ambiente do servidor.
 */

export type OutboxEvent =
  | { type: "opportunity.created" | "opportunity.stage_changed"; orgId: string; opportunityId: string; at: string; data: Record<string, unknown> }
  | { type: "activity.created"; orgId: string; activityId: string; opportunityId: string | null; at: string; data: Record<string, unknown> };

/** CRM externo. Alvo inicial: CRM da plataforma Finture (hub-partner). */
export interface CrmSink {
  readonly name: string;
  /** Deve ser idempotente pela chave `event.type + id`; o worker pode reenviar. */
  push(event: OutboxEvent): Promise<{ externalId?: string }>;
}

/**
 * WhatsApp Business (Cloud API). Regras que a implementação precisa cumprir:
 * - mensagem ativa só com template aprovado e opt-in registrado do contato;
 * - webhook de status validado pela assinatura X-Hub-Signature-256;
 * - nada de número pessoal de sócio sem base legal (docs/LGPD.md).
 */
export interface MessagingChannel {
  readonly name: string;
  sendTemplate(input: { to: string; template: string; language: "pt_BR"; variables: string[]; optInRef: string }): Promise<{ messageId: string }>;
}

/** Enriquecimento cadastral por CNPJ. Cada campo devolvido carrega origem e data. */
export interface Enricher {
  readonly name: string;
  enrich(cnpj: string): Promise<{
    fields: Partial<Record<"site" | "telefone" | "email" | "funcionariosFaixa", { value: string; source: string; fetchedAt: string; confidence: "alta" | "media" | "baixa" }>>;
  }>;
}
