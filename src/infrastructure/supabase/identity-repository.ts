import type {
  AppRole,
  Profile,
  ProfileDetails,
  ProfilePrivacy,
  UserIdentity,
} from "@/domain/identity";
import { getSupabaseClient } from "./client";

export async function loadUserIdentity(userId: string): Promise<UserIdentity> {
  const client = getSupabaseClient();
  const [profileResult, detailsResult, privacyResult, roleResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).single(),
    client.from("profile_details").select("*").eq("profile_id", userId).single(),
    client.from("profile_privacy").select("*").eq("profile_id", userId).single(),
    client.from("user_roles").select("role").eq("user_id", userId).single(),
  ]);

  const error =
    profileResult.error ?? detailsResult.error ?? privacyResult.error ?? roleResult.error;
  if (error) throw error;

  return {
    profile: profileResult.data as Profile,
    details: detailsResult.data as ProfileDetails,
    privacy: privacyResult.data as ProfilePrivacy,
    role: (roleResult.data?.role ?? "user") as AppRole,
  };
}

export async function updateOwnProfile(
  userId: string,
  values: Partial<Profile>,
): Promise<Profile> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateOwnDetails(
  userId: string,
  values: Partial<ProfileDetails>,
): Promise<ProfileDetails> {
  const { data, error } = await getSupabaseClient()
    .from("profile_details")
    .update(values)
    .eq("profile_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ProfileDetails;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("username_is_available", {
    candidate: username,
  });

  if (error) throw error;
  return Boolean(data);
}
