import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  SupportError,
  type CreateSupportTicketInput,
  type SupportPage,
  type SupportRealtimeEvent,
  type SupportRepository,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketPageRequest,
  type SupportMessagePageRequest,
  type UpdateSupportTicketInput,
} from "@/domains/support";
import type { Database } from "../database.types";
import { getSupabaseClient } from "../client";

type TicketReadRow = Database["public"]["Functions"]["list_support_tickets"]["Returns"][number];
type MessageReadRow = Database["public"]["Functions"]["list_support_ticket_messages"]["Returns"][number];
type TicketMutationRow = Database["public"]["Functions"]["create_support_ticket"]["Returns"];
type MessageMutationRow = Database["public"]["Functions"]["reply_support_ticket"]["Returns"];
type SupabaseErrorLike = { code?: string; message?: string; status?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapError(error: unknown): SupportError {
  if (error instanceof SupportError) return error;
  const source = (error ?? {}) as SupabaseErrorLike;
  if (source.status === 401 || source.code === "PGRST301") {
    return new SupportError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (source.status === 403 || source.code === "42501") {
    return new SupportError("permission", "Você não tem permissão para acessar este chamado.", { cause: error });
  }
  if (source.status === 409 || source.code === "23505") {
    return new SupportError("conflict", "O chamado foi alterado em outra sessão. Atualize e tente novamente.", { cause: error });
  }
  if (source.status === 429 || source.code === "PT429") {
    return new SupportError("rate_limit", "Muitas solicitações. Aguarde antes de tentar novamente.", { cause: error });
  }
  if (source.status === 400 || source.code === "22023" || source.code === "23514") {
    return new SupportError("validation", "Revise os dados informados no chamado.", { cause: error });
  }
  if (source.status === 404 || source.code === "P0002" || source.code === "PGRST116") {
    return new SupportError("unavailable", "Este chamado não está mais disponível.", { cause: error });
  }
  if (source.status === 503 || source.status === 504 || source.code === "PGRST003") {
    return new SupportError("unavailable", "O suporte está temporariamente indisponível.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new SupportError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new SupportError("unknown", "Não foi possível concluir a operação de suporte agora.", { cause: error });
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(value ?? fallback)));
}

function encodeCursor(timestamp: string, id: string) {
  return `${timestamp}|${id}`;
}

function decodeCursor(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  const timestamp = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || Number.isNaN(Date.parse(timestamp)) || !UUID.test(id)) {
    throw new SupportError("validation", "A página solicitada não é válida.");
  }
  return { timestamp: new Date(timestamp).toISOString(), id };
}

function mapTicket(row: TicketReadRow | TicketMutationRow, fallbackName = "Membro ORHA"): SupportTicket {
  const read = row as TicketReadRow;
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: read.requester_full_name?.trim() || fallbackName,
    requesterAvatarPath: read.requester_avatar_path ?? null,
    subject: row.subject,
    category: row.category,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assigneeName: read.assignee_full_name?.trim() || null,
    lastMessageAt: row.last_message_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageReadRow | MessageMutationRow): SupportTicketMessage {
  const read = row as MessageReadRow;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderId: row.sender_id,
    senderName: read.sender_name?.trim() || "Equipe ORHA",
    senderAvatarPath: read.sender_avatar_path ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function requireUserId(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getUser();
  if (error) throw mapError(error);
  if (!data.user) throw new SupportError("authentication", "Entre para acessar o suporte.");
  return data.user.id;
}

export class SupabaseSupportRepository implements SupportRepository {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseClient()) {}

  async listTickets(request: SupportTicketPageRequest = {}): Promise<SupportPage<SupportTicket>> {
    const limit = normalizeLimit(request.limit, 30, 50);
    const cursor = decodeCursor(request.cursor);
    let operation = this.client.rpc("list_support_tickets", {
      p_status: request.status && request.status !== "all" ? request.status : undefined,
      p_limit: limit,
      p_before_activity: cursor?.timestamp,
      p_before_id: cursor?.id,
    });
    if (request.signal) operation = operation.abortSignal(request.signal);
    const { data, error } = await operation;
    if (error) throw mapError(error);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => mapTicket(row)),
      nextCursor: hasMore && last ? encodeCursor(last.last_message_at, last.id) : null,
    };
  }

  async listMessages(
    ticketId: string,
    request: SupportMessagePageRequest = {},
  ): Promise<SupportPage<SupportTicketMessage>> {
    if (!UUID.test(ticketId)) throw new SupportError("validation", "O chamado informado não é válido.");
    const limit = normalizeLimit(request.limit, 50, 100);
    const cursor = decodeCursor(request.cursor);
    let operation = this.client.rpc("list_support_ticket_messages", {
      p_ticket_id: ticketId,
      p_limit: limit,
      p_before_created_at: cursor?.timestamp,
      p_before_id: cursor?.id,
    });
    if (request.signal) operation = operation.abortSignal(request.signal);
    const { data, error } = await operation;
    if (error) throw mapError(error);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map(mapMessage),
      nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    };
  }

  async createTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const { data, error } = await this.client.rpc("create_support_ticket", {
      p_subject: input.subject,
      p_category: input.category,
      p_message: input.message,
    });
    if (error) throw mapError(error);
    if (!data) throw new SupportError("unknown", "O servidor não confirmou a criação do chamado.");
    return mapTicket(data);
  }

  async reply(ticketId: string, message: string): Promise<SupportTicketMessage> {
    const { data, error } = await this.client.rpc("reply_support_ticket", {
      p_ticket_id: ticketId,
      p_message: message,
    });
    if (error) throw mapError(error);
    if (!data) throw new SupportError("unknown", "O servidor não confirmou a resposta.");
    return mapMessage(data);
  }

  async claim(ticketId: string): Promise<SupportTicket> {
    const { data, error } = await this.client.rpc("claim_support_ticket", { p_ticket_id: ticketId });
    if (error) throw mapError(error);
    if (!data) throw new SupportError("unknown", "O servidor não confirmou a atribuição.");
    return mapTicket(data);
  }

  async updateTicket(input: UpdateSupportTicketInput): Promise<SupportTicket> {
    const { data, error } = await this.client.rpc("update_support_ticket_state", {
      p_ticket_id: input.ticketId,
      p_status: input.status,
      p_priority: input.priority,
    });
    if (error) throw mapError(error);
    if (!data) throw new SupportError("unknown", "O servidor não confirmou a atualização.");
    return mapTicket(data);
  }

  async subscribe(listener: (event: SupportRealtimeEvent) => void): Promise<() => void> {
    const userId = await requireUserId(this.client);
    let subscriptionReady = false;
    let replicationReady = false;
    let resolveReady: () => void = () => undefined;
    let rejectReady: (error: Error) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const settleReady = () => {
      if (subscriptionReady && replicationReady) resolveReady();
    };
    let channel: RealtimeChannel | null = this.client
      .channel(`support:${userId}`, {
        config: {
          private: true,
          broadcast: { ack: false, self: false, replication_ready: true },
        },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          const previous = payload.old as Record<string, unknown>;
          const ticketId = typeof next.id === "string" ? next.id : previous.id;
          if (typeof ticketId === "string") listener({ ticketId, kind: "ticket" });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages" },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          const previous = payload.old as Record<string, unknown>;
          const ticketId = typeof next.ticket_id === "string" ? next.ticket_id : previous.ticket_id;
          if (typeof ticketId === "string") listener({ ticketId, kind: "message" });
        },
      )
      .on("system", {}, (payload) => {
        if (payload.extension !== "system") return;
        if (payload.status === "ok") {
          replicationReady = true;
          settleReady();
        } else {
          rejectReady(new SupportError(
            "unavailable",
            "As atualizações do suporte estão temporariamente indisponíveis.",
          ));
        }
      });

    const timeout = setTimeout(() => {
      rejectReady(new SupportError(
        "unavailable",
        "As atualizações do suporte demoraram para responder.",
      ));
    }, 15_000);
    try {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscriptionReady = true;
          settleReady();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          rejectReady(new SupportError(
            "unavailable",
            "As atualizações do suporte estão temporariamente indisponíveis.",
          ));
        }
      });
      await ready;
    } catch (error) {
      if (channel) await this.client.removeChannel(channel);
      channel = null;
      throw mapError(error);
    } finally {
      clearTimeout(timeout);
    }

    return () => {
      if (!channel) return;
      const active = channel;
      channel = null;
      void this.client.removeChannel(active);
    };
  }
}

export function createSupabaseSupportRepository(
  client: SupabaseClient<Database> = getSupabaseClient(),
) {
  return new SupabaseSupportRepository(client);
}
