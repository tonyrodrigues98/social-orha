import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Selection } from "react-aria-components";
import { Camera, LockKeyhole } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { InputTags } from "@/components/base/input/input-tags";
import { MultiSelect } from "@/components/base/select/multi-select";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { Drawer } from "@/components/godui/drawer";
import type { ProfileVisibility, UserIdentity } from "@/domain/identity";
import { favoriteCategoryLabels } from "@/domain/favorite-catalog";
import {
  favoriteCollectionsFromDetails,
  type FavoriteCategory,
} from "@/domain/profile-data";
import type { PixelCrop } from "@/domain/profile-media";
import {
  hobbyOptions,
  interestOptions,
  normalizeEditableProfileDetailsPatch,
  personalityOptions,
  profileDetailLimits,
  seasonOptions,
  socialEnergyOptions,
  validateEditableProfileDetailsPatch,
  weekendOptions,
} from "@/domain/profile-details";
import { processProfileImage } from "@/infrastructure/media/profile-image-processor";
import { isUsernameAvailable } from "@/infrastructure/supabase/identity-repository";
import {
  useUpdateOwnFavoriteMutation,
  useUpdateOwnDetailsMutation,
  useUpdateOwnPrivacyMutation,
  useUpdateOwnProfileMutation,
  useUploadProfileMediaMutation,
} from "./profile-queries";
import { ProfileImageCropDrawer } from "./profile-image-crop-drawer";
import { FavoriteCatalogPicker } from "../favorites/favorite-catalog-picker";
import {
  PROFILE_IMAGE_ACCEPT,
  loadLocalImageDimensions,
  validateProfileMediaSelection,
} from "../pages/profile-media";

export type ProfileSettingsPanel =
  | { type: "edit-profile" }
  | { type: "details" }
  | { type: "privacy" }
  | { type: "favorites"; category: FavoriteCategory };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProfileSettingsDrawer({
  panel,
  identity,
  onClose,
  announce,
}: {
  panel: ProfileSettingsPanel | null;
  identity: UserIdentity;
  onClose: () => void;
  announce: (message: string) => void;
}) {
  if (!panel) return null;
  const title = panel.type === "edit-profile"
    ? "Editar perfil"
    : panel.type === "details"
      ? "Personalizar perfil"
      : panel.type === "privacy"
        ? "Privacidade"
        : favoriteCategoryLabels[panel.category];

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
    >
      {panel.type === "edit-profile" ? (
        <EditProfilePanel
          key={`edit-${identity.profile.updated_at}`}
          identity={identity}
          onClose={onClose}
          announce={announce}
        />
      ) : panel.type === "details" ? (
        <ProfileDetailsPanel
          key={`details-${identity.details.profile_id}`}
          identity={identity}
          onClose={onClose}
          announce={announce}
        />
      ) : panel.type === "privacy" ? (
        <PrivacyPanel
          key={`privacy-${identity.privacy.profile_visibility}-${identity.privacy.age_visibility}-${identity.privacy.dating_enabled}`}
          identity={identity}
          onClose={onClose}
          announce={announce}
        />
      ) : (
        <FavoritesPanel
          key={`favorites-${panel.category}-${identity.details.profile_id}`}
          identity={identity}
          category={panel.category}
          onClose={onClose}
          announce={announce}
        />
      )}
    </Drawer>
  );
}

function EditProfilePanel({
  identity,
  onClose,
  announce,
}: {
  identity: UserIdentity;
  onClose: () => void;
  announce: (message: string) => void;
}) {
  const profileId = identity.profile.id;
  const updateProfile = useUpdateOwnProfileMutation(profileId);
  const uploadMedia = useUploadProfileMediaMutation(profileId);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(identity.profile.full_name ?? "");
  const [username, setUsername] = useState(identity.profile.username ?? "");
  const [bio, setBio] = useState(identity.profile.bio ?? "");
  const [church, setChurch] = useState(identity.profile.church ?? "");
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = updateProfile.isPending || uploadMedia.isPending || processingAvatar;

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    const validation = validateProfileMediaSelection(files, 1);
    if (!validation.ok) {
      setError(validation.message);
      announce(validation.message);
      return;
    }
    setProcessingAvatar(true);
    setError(null);
    try {
      await loadLocalImageDimensions(validation.files[0]);
      setPendingAvatar(validation.files[0]);
    } catch (reason) {
      const message = messageFrom(reason, "A foto de perfil não pôde ser lida.");
      setError(message);
      announce(message);
    } finally {
      setProcessingAvatar(false);
    }
  }

  async function uploadAvatar(crop: PixelCrop) {
    if (!pendingAvatar) return;
    setProcessingAvatar(true);
    setError(null);
    try {
      const image = await processProfileImage(pendingAvatar, { purpose: "avatar", crop });
      await uploadMedia.mutateAsync({ purpose: "avatar", image });
      setPendingAvatar(null);
      announce("Foto de perfil salva.");
    } catch (reason) {
      const message = messageFrom(reason, "Não foi possível salvar a foto de perfil.");
      setError(message);
      announce(message);
    } finally {
      setProcessingAvatar(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedName = fullName.trim();
    const normalizedUsername = username.replace(/^@/, "").trim().toLowerCase();
    const normalizedBio = bio.trim();
    if (normalizedName.length < 2 || !/^[a-z0-9._]{3,30}$/i.test(normalizedUsername)) {
      setError("Informe seu nome e um username válido de 3 a 30 caracteres.");
      return;
    }
    try {
      if (normalizedUsername !== identity.profile.username) {
        const available = await isUsernameAvailable(normalizedUsername);
        if (!available) {
          setError("Este @username já está em uso.");
          return;
        }
      }
      await updateProfile.mutateAsync({
        full_name: normalizedName,
        username: normalizedUsername,
        bio: normalizedBio || null,
        church: church.trim() || null,
      });
      announce("Perfil atualizado.");
      onClose();
    } catch (reason) {
      setError(messageFrom(reason, "Não foi possível salvar o perfil."));
    }
  }

  return (
    <>
      <form className="grid gap-4" aria-busy={busy || undefined} onSubmit={(event) => void submit(event)}>
        <div className="grid gap-2">
          <Button
            type="button"
            color="secondary"
            size="lg"
            iconLeading={Camera}
            isDisabled={busy}
            onPress={() => avatarInput.current?.click()}
          >
            Alterar foto de perfil
          </Button>
          <input
            ref={avatarInput}
            className="prototype-file-input"
            type="file"
            accept={PROFILE_IMAGE_ACCEPT}
            aria-label="Selecionar foto de perfil"
            onChange={(event) => void chooseAvatar(event)}
          />
        </div>
        <Input
          label="Nome completo"
          value={fullName}
          onChange={setFullName}
          autoComplete="name"
          maxLength={100}
          isRequired
          isDisabled={busy}
        />
        <Input
          label="Username"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          isRequired
          isDisabled={busy}
          hint="Use letras, números, ponto ou underline."
        />
        <TextArea
          label="Bio"
          value={bio}
          onChange={setBio}
          rows={4}
          maxLength={300}
          isDisabled={busy}
          hint={`${bio.length}/300`}
        />
        <Input
          label="Igreja (opcional)"
          value={church}
          onChange={setChurch}
          maxLength={160}
          isDisabled={busy}
        />
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
          <Button type="button" color="secondary" size="lg" isDisabled={busy} onPress={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" isLoading={busy} showTextWhileLoading>
            {busy ? "Salvando…" : "Salvar perfil"}
          </Button>
        </div>
      </form>
      {pendingAvatar ? (
        <ProfileImageCropDrawer
          file={pendingAvatar}
          purpose="avatar"
          busy={processingAvatar || uploadMedia.isPending}
          onCancel={() => setPendingAvatar(null)}
          onConfirm={(crop) => void uploadAvatar(crop)}
        />
      ) : null}
    </>
  );
}

type DetailOption = { id: string; label: string };

function detailOptions(defaults: readonly string[], current: readonly string[]): DetailOption[] {
  return Array.from(new Set([...defaults, ...current])).map((label) => ({ id: label, label }));
}

function selectedValues(selection: Selection, options: readonly DetailOption[]): string[] {
  if (selection === "all") return options.map((option) => option.id);
  const selected = new Set(Array.from(selection, String));
  return options.filter((option) => selected.has(option.id)).map((option) => option.id);
}

function selectOptions(defaults: readonly string[], current: string | null) {
  const values = current && !defaults.includes(current) ? [...defaults, current] : defaults;
  return [
    { value: "", label: "Prefiro não informar" },
    ...values.map((value) => ({ value, label: value })),
  ];
}

function ProfileDetailsPanel({
  identity,
  onClose,
  announce,
}: {
  identity: UserIdentity;
  onClose: () => void;
  announce: (message: string) => void;
}) {
  const updateDetails = useUpdateOwnDetailsMutation(identity.profile.id);
  const details = identity.details;
  const personalityItems = detailOptions(personalityOptions, details.personality);
  const weekendItems = detailOptions(weekendOptions, details.weekend_preferences);
  const [personality, setPersonality] = useState(details.personality);
  const [favoriteSeason, setFavoriteSeason] = useState(details.favorite_season ?? "");
  const [socialEnergy, setSocialEnergy] = useState(details.social_energy ?? "");
  const [weekendPreferences, setWeekendPreferences] = useState(details.weekend_preferences);
  const [interests, setInterests] = useState(details.interests);
  const [hobbies, setHobbies] = useState(details.hobbies);
  const [visitedPlaces, setVisitedPlaces] = useState(details.visited_places);
  const [desiredPlaces, setDesiredPlaces] = useState(details.desired_places);
  const [error, setError] = useState<string | null>(null);

  function updateSelection(
    selection: Selection,
    options: readonly DetailOption[],
    limit: number,
    label: string,
    setter: (values: string[]) => void,
  ) {
    const values = selectedValues(selection, options);
    if (values.length > limit) {
      setError(`${label}: escolha no máximo ${limit}.`);
      return;
    }
    setError(null);
    setter(values);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const patch = normalizeEditableProfileDetailsPatch({
      personality,
      favorite_season: favoriteSeason || null,
      social_energy: socialEnergy || null,
      weekend_preferences: weekendPreferences,
      interests,
      hobbies,
      visited_places: visitedPlaces,
      desired_places: desiredPlaces,
    });
    const validationError = validateEditableProfileDetailsPatch(patch);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await updateDetails.mutateAsync(patch);
      announce("Detalhes do perfil atualizados.");
      onClose();
    } catch (reason) {
      setError(messageFrom(reason, "Não foi possível salvar os detalhes do perfil."));
    }
  }

  const busy = updateDetails.isPending;
  const personalityLimit = profileDetailLimits.personality;
  const weekendLimit = profileDetailLimits.weekend_preferences;
  const interestLimit = profileDetailLimits.interests;
  const hobbyLimit = profileDetailLimits.hobbies;
  const visitedLimit = profileDetailLimits.visited_places;
  const desiredLimit = profileDetailLimits.desired_places;

  return (
    <form
      className="grid gap-5"
      aria-busy={busy || undefined}
      onSubmit={(event) => void submit(event)}
    >
      <p className="m-0 text-sm leading-5 text-tertiary">
        Mostre seu jeito, seus interesses e os lugares que fazem parte da sua história. Você pode alterar tudo depois.
      </p>
      <MultiSelect
        label="Personalidade"
        size="lg"
        items={personalityItems}
        selectedKeys={new Set(personality)}
        onSelectionChange={(selection) => updateSelection(
          selection,
          personalityItems,
          personalityLimit.maxItems,
          "Personalidade",
          setPersonality,
        )}
        selectedCountFormatter={(count) => `${count} de ${personalityLimit.maxItems}`}
        placeholder="Escolha como você se define"
        hint="Selecione até cinco características."
        showSearch={false}
        showFooter={false}
        isDisabled={busy}
      >
        {(item) => (
          <MultiSelect.Item {...item} className="min-h-11" selectionIndicator="checkbox">
            {item.label}
          </MultiSelect.Item>
        )}
      </MultiSelect>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NativeSelect
          label="Estação preferida"
          size="lg"
          value={favoriteSeason}
          onChange={(event) => setFavoriteSeason(event.target.value)}
          options={selectOptions(seasonOptions, details.favorite_season)}
          disabled={busy}
        />
        <NativeSelect
          label="Energia social"
          size="lg"
          value={socialEnergy}
          onChange={(event) => setSocialEnergy(event.target.value)}
          options={selectOptions(socialEnergyOptions, details.social_energy)}
          disabled={busy}
        />
      </div>
      <MultiSelect
        label="Como gosta de passar o fim de semana"
        size="lg"
        items={weekendItems}
        selectedKeys={new Set(weekendPreferences)}
        onSelectionChange={(selection) => updateSelection(
          selection,
          weekendItems,
          weekendLimit.maxItems,
          "Fim de semana",
          setWeekendPreferences,
        )}
        selectedCountFormatter={(count) => `${count} de ${weekendLimit.maxItems}`}
        placeholder="Escolha suas preferências"
        showSearch={false}
        showFooter={false}
        isDisabled={busy}
      >
        {(item) => (
          <MultiSelect.Item {...item} className="min-h-11" selectionIndicator="checkbox">
            {item.label}
          </MultiSelect.Item>
        )}
      </MultiSelect>
      <InputTags
        label="Interesses"
        size="lg"
        value={interests}
        onChange={setInterests}
        maxTags={interestLimit.maxItems}
        validate={(value) => Array.from(value).length <= interestLimit.maxItemCharacters}
        placeholder={`Ex.: ${interestOptions.slice(0, 3).join(", ")}`}
        hint={`${interests.length}/${interestLimit.maxItems} · pressione Enter para adicionar`}
        isDisabled={busy}
      />
      <InputTags
        label="Hobbies"
        size="lg"
        value={hobbies}
        onChange={setHobbies}
        maxTags={hobbyLimit.maxItems}
        validate={(value) => Array.from(value).length <= hobbyLimit.maxItemCharacters}
        placeholder={`Ex.: ${hobbyOptions.slice(0, 3).join(", ")}`}
        hint={`${hobbies.length}/${hobbyLimit.maxItems} · pressione Enter para adicionar`}
        isDisabled={busy}
      />
      <InputTags
        label="Lugares que já conheceu"
        size="lg"
        value={visitedPlaces}
        onChange={setVisitedPlaces}
        maxTags={visitedLimit.maxItems}
        validate={(value) => Array.from(value).length <= visitedLimit.maxItemCharacters}
        placeholder="Ex.: Salvador"
        hint={`${visitedPlaces.length}/${visitedLimit.maxItems} · pressione Enter para adicionar`}
        isDisabled={busy}
      />
      <InputTags
        label="Lugares que deseja conhecer"
        size="lg"
        value={desiredPlaces}
        onChange={setDesiredPlaces}
        maxTags={desiredLimit.maxItems}
        validate={(value) => Array.from(value).length <= desiredLimit.maxItemCharacters}
        placeholder="Ex.: Jerusalém"
        hint={`${desiredPlaces.length}/${desiredLimit.maxItems} · pressione Enter para adicionar`}
        isDisabled={busy}
      />
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button type="button" color="secondary" size="lg" isDisabled={busy} onPress={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" isLoading={busy} showTextWhileLoading>
          {busy ? "Salvando…" : "Salvar detalhes"}
        </Button>
      </div>
    </form>
  );
}

function PrivacyPanel({
  identity,
  onClose,
  announce,
}: {
  identity: UserIdentity;
  onClose: () => void;
  announce: (message: string) => void;
}) {
  const updatePrivacy = useUpdateOwnPrivacyMutation(identity.profile.id);
  const [profileVisibility, setProfileVisibility] = useState(identity.privacy.profile_visibility);
  const [ageVisibility, setAgeVisibility] = useState(identity.privacy.age_visibility);
  const [locationVisibility, setLocationVisibility] = useState(identity.privacy.location_visibility);
  const [favoritesVisibility, setFavoritesVisibility] = useState(identity.privacy.favorites_visibility);
  const [galleryVisibility, setGalleryVisibility] = useState(identity.privacy.gallery_visibility);
  const [datingEnabled, setDatingEnabled] = useState(identity.privacy.dating_enabled);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await updatePrivacy.mutateAsync({
        profile_visibility: profileVisibility,
        age_visibility: ageVisibility,
        location_visibility: locationVisibility,
        favorites_visibility: favoritesVisibility,
        gallery_visibility: galleryVisibility,
        dating_enabled: datingEnabled,
      });
      announce("Preferências de privacidade salvas.");
      onClose();
    } catch (reason) {
      setError(messageFrom(reason, "Não foi possível salvar sua privacidade."));
    }
  }

  return (
    <form className="grid gap-4" aria-busy={updatePrivacy.isPending || undefined} onSubmit={(event) => void submit(event)}>
      <div className="flex gap-3 rounded-2xl bg-secondary p-4 text-sm text-secondary">
        <LockKeyhole className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="m-0">Você escolhe quem pode ver cada parte do perfil. Sua data de nascimento nunca é exibida; mostramos apenas a idade calculada quando permitido. O modo namoro continua privado.</p>
      </div>
      <VisibilitySelect label="Perfil" value={profileVisibility} onChange={setProfileVisibility} disabled={updatePrivacy.isPending} />
      <VisibilitySelect label="Idade" value={ageVisibility} onChange={setAgeVisibility} disabled={updatePrivacy.isPending} />
      <VisibilitySelect label="Localização" value={locationVisibility} onChange={setLocationVisibility} disabled={updatePrivacy.isPending} />
      <VisibilitySelect label="Favoritos" value={favoritesVisibility} onChange={setFavoritesVisibility} disabled={updatePrivacy.isPending} />
      <VisibilitySelect label="Galeria" value={galleryVisibility} onChange={setGalleryVisibility} disabled={updatePrivacy.isPending} />
      <Toggle
        size="md"
        label="Modo namoro"
        hint="Não cria nenhuma área pública no perfil."
        isSelected={datingEnabled}
        onChange={setDatingEnabled}
        isDisabled={updatePrivacy.isPending}
      />
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button type="button" color="secondary" size="lg" isDisabled={updatePrivacy.isPending} onPress={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" isLoading={updatePrivacy.isPending} showTextWhileLoading>
          {updatePrivacy.isPending ? "Salvando…" : "Salvar privacidade"}
        </Button>
      </div>
    </form>
  );
}

function VisibilitySelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: ProfileVisibility;
  onChange: (value: ProfileVisibility) => void;
  disabled: boolean;
}) {
  return (
    <NativeSelect
      label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ProfileVisibility)}
      options={[
        { value: "public", label: "Público" },
        { value: "friends", label: "Somente amigos" },
        { value: "private", label: "Somente eu" },
      ]}
    />
  );
}

function FavoritesPanel({
  identity,
  category,
  onClose,
  announce,
}: {
  identity: UserIdentity;
  category: FavoriteCategory;
  onClose: () => void;
  announce: (message: string) => void;
}) {
  const updateFavorite = useUpdateOwnFavoriteMutation(identity.profile.id);
  const initialItems = favoriteCollectionsFromDetails(identity.details)[category];
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const label = favoriteCategoryLabels[category];

  async function save() {
    setError(null);
    try {
      await updateFavorite.mutateAsync({ category, items });
      announce(`${label} atualizados.`);
      onClose();
    } catch (reason) {
      setError(messageFrom(reason, `Não foi possível salvar ${label.toLocaleLowerCase("pt-BR")}.`));
    }
  }

  return (
    <div className="grid gap-4" aria-busy={updateFavorite.isPending || undefined}>
      <p className="m-0 text-sm text-tertiary">
        Pesquise no catálogo, selecione até cinco e ajuste a ordem exibida no seu perfil.
      </p>
      <FavoriteCatalogPicker
        category={category}
        items={items}
        onChange={setItems}
        isDisabled={updateFavorite.isPending}
      />
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button type="button" color="secondary" size="lg" isDisabled={updateFavorite.isPending} onPress={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="lg" isLoading={updateFavorite.isPending} showTextWhileLoading onPress={() => void save()}>
          {updateFavorite.isPending ? "Salvando…" : "Salvar favoritos"}
        </Button>
      </div>
    </div>
  );
}
