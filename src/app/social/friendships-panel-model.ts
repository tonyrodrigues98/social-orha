import type { Friendship, SocialProfile } from "@/domains/social";

export type FriendshipPanelTab = "friends" | "incoming" | "outgoing";
export type FriendshipAction = "accept" | "decline" | "cancel" | "remove";

export function friendshipCounterpart(
  friendship: Friendship,
  viewerId: string,
): SocialProfile | null {
  if (friendship.requesterId === viewerId) return friendship.addressee;
  if (friendship.addresseeId === viewerId) return friendship.requester;
  return null;
}

export function friendshipActionLabel(
  tab: FriendshipPanelTab,
  action: FriendshipAction,
): string {
  const labels: Record<FriendshipPanelTab, Record<FriendshipAction, string>> = {
    friends: {
      accept: "Aceitar",
      decline: "Recusar",
      cancel: "Cancelar",
      remove: "Remover amizade",
    },
    incoming: {
      accept: "Aceitar",
      decline: "Recusar",
      cancel: "Cancelar",
      remove: "Remover",
    },
    outgoing: {
      accept: "Aceitar",
      decline: "Recusar",
      cancel: "Cancelar solicitação",
      remove: "Remover",
    },
  };
  return labels[tab][action];
}
