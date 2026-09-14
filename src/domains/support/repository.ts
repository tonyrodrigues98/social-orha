import type {
  CreateSupportTicketInput,
  SupportMessagePageRequest,
  SupportPage,
  SupportRealtimeEvent,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketPageRequest,
  UpdateSupportTicketInput,
} from "./types";

export interface SupportRepository {
  listTickets(request?: SupportTicketPageRequest): Promise<SupportPage<SupportTicket>>;
  listMessages(
    ticketId: string,
    request?: SupportMessagePageRequest,
  ): Promise<SupportPage<SupportTicketMessage>>;
  createTicket(input: CreateSupportTicketInput): Promise<SupportTicket>;
  reply(ticketId: string, message: string): Promise<SupportTicketMessage>;
  claim(ticketId: string): Promise<SupportTicket>;
  updateTicket(input: UpdateSupportTicketInput): Promise<SupportTicket>;
  subscribe(listener: (event: SupportRealtimeEvent) => void): Promise<() => void>;
}
