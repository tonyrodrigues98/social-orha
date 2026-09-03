import { describe, expect, it } from "vitest";
import type { Friendship, SocialProfile } from "@/domains/social";
import {
  friendshipActionLabel,
  friendshipCounterpart,
} from "./friendships-panel-model";

const requester: SocialProfile = {
  id: "requester",
  fullName: "Ana Clara",
  username: "anaclara",
  bio: null,
  church: null,
  avatarPath: null,
  stateCode: "SP",
  city: "Campinas",
  interests: [],
  hobbies: [],
  isFriend: false,
};

const addressee: SocialProfile = {
  ...requester,
  id: "addressee",
  fullName: "Lucas Nunes",
  username: "lucasnunes",
};

const friendship: Friendship = {
  id: "friendship-id",
  requesterId: requester.id,
  addresseeId: addressee.id,
  status: "pending",
  acceptedAt: null,
  createdAt: "2026-08-16T12:00:00.000Z",
  updatedAt: "2026-08-16T12:00:00.000Z",
  requester,
  addressee,
};

describe("friendships panel", () => {
  it("resolves the other participant without trusting list direction", () => {
    expect(friendshipCounterpart(friendship, requester.id)?.id).toBe(addressee.id);
    expect(friendshipCounterpart(friendship, addressee.id)?.id).toBe(requester.id);
    expect(friendshipCounterpart(friendship, "unrelated")).toBeNull();
  });

  it("uses explicit labels for cancel and removal actions", () => {
    expect(friendshipActionLabel("outgoing", "cancel")).toBe("Cancelar solicitação");
    expect(friendshipActionLabel("friends", "remove")).toBe("Remover amizade");
  });
});
