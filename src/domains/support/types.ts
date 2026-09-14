export type SupportTicketStatus = "open" | "in_progress" | "resolved";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";
export type SupportTicketCategory =
  | "account"
  | "access"
  | "security"
  | "privacy"
  | "technical"
  | "other";

export type SupportTicket = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarPath: string | null;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedTo: string | null;
  assigneeName: string | null;
  lastMessageAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderAvatarPath: string | null;
  body: string;
  createdAt: string;
};

export type SupportPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type SupportTicketPageRequest = {
  status?: SupportTicketStatus | "all";
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type SupportMessagePageRequest = {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type CreateSupportTicketInput = {
  subject: string;
  category: SupportTicketCategory;
  message: string;
};

export type UpdateSupportTicketInput = {
  ticketId: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
};

export type SupportRealtimeEvent = {
  ticketId: string;
  kind: "ticket" | "message";
};

export const supportCategoryLabels: Record<SupportTicketCategory, string> = {
  account: "Conta",
  access: "Acesso",
  security: "Segurança",
  privacy: "Privacidade",
  technical: "Problema técnico",
  other: "Outro assunto",
};

export const supportPriorityLabels: Record<SupportTicketPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const supportStatusLabels: Record<SupportTicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
};
