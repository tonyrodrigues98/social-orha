import { useState } from "react";
import { Camera, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { FileTrigger } from "@/components/base/file-upload-trigger/file-upload-trigger";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Drawer } from "@/components/godui/drawer";
import { nextCommunityRuleOrder } from "@/domain/community-management";
import type { PixelCrop } from "@/domain/profile-media";
import type { Community, CommunityRule } from "@/domains/social";
import { processProfileImage } from "@/infrastructure/media/profile-image-processor";
import {
  PROFILE_IMAGE_ACCEPT,
  loadLocalImageDimensions,
  validateProfileMediaSelection,
} from "@/infrastructure/media/profile-image-validation";
import { ProfileImageCropDrawer } from "../profile/profile-image-crop-drawer";
import { useCommunityManagementActions } from "./community-management-hooks";

type PendingAsset = {
  file: File;
  kind: "avatar" | "cover";
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Não foi possível concluir esta ação.";
}

export function CommunityManagerDrawer({
  open,
  community,
  rules,
  avatarUrl,
  coverUrl,
  hasMoreRules,
  loadingMoreRules,
  rulesAvailable,
  onLoadMoreRules,
  onOpenChange,
  onArchived,
}: {
  open: boolean;
  community: Community;
  rules: readonly CommunityRule[];
  avatarUrl: string | null;
  coverUrl: string | null;
  hasMoreRules: boolean;
  loadingMoreRules: boolean;
  rulesAvailable: boolean;
  onLoadMoreRules: () => void;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const actions = useCommunityManagementActions(community.id);
  const [section, setSection] = useState<"details" | "rules">("details");
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [category, setCategory] = useState(community.category);
  const [visibility, setVisibility] = useState(community.visibility);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [editingRule, setEditingRule] = useState<CommunityRule | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<PendingAsset | null>(null);
  const [processingAsset, setProcessingAsset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setError(null);
    setStatus(null);
    try {
      await operation();
      setStatus(success);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };

  const selectAsset = async (files: FileList | null, kind: PendingAsset["kind"]) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const validation = validateProfileMediaSelection(selected, 1);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setProcessingAsset(true);
    setError(null);
    try {
      await loadLocalImageDimensions(validation.files[0]);
      setPendingAsset({ file: validation.files[0], kind });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setProcessingAsset(false);
    }
  };

  const uploadAsset = async (crop: PixelCrop) => {
    if (!pendingAsset) return;
    setProcessingAsset(true);
    setError(null);
    try {
      const image = await processProfileImage(pendingAsset.file, {
        purpose: pendingAsset.kind,
        crop,
      });
      await actions.uploadCommunityAsset({
        kind: pendingAsset.kind,
        file: image.file,
        dimensions: { width: image.width, height: image.height },
        previousPath: pendingAsset.kind === "avatar"
          ? community.avatarPath
          : community.coverPath,
      });
      setStatus(pendingAsset.kind === "avatar" ? "Imagem da comunidade salva." : "Capa da comunidade salva.");
      setPendingAsset(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setProcessingAsset(false);
    }
  };

  const submitRule = async () => {
    const availableOrder = editingRule?.sortOrder
      ?? nextCommunityRuleOrder(rules.map((rule) => rule.sortOrder));
    if (availableOrder === null) {
      setError("Esta comunidade já atingiu o limite de 50 regras.");
      return;
    }
    const input = {
      title: ruleTitle,
      description: ruleDescription,
      sortOrder: availableOrder,
    };
    const succeeded = await run(
      () => editingRule
        ? actions.updateRule(editingRule.id, input)
        : actions.createRule(input),
      editingRule ? "Regra atualizada." : "Regra criada.",
    );
    if (succeeded) {
      setEditingRule(null);
      setRuleTitle("");
      setRuleDescription("");
    }
  };

  const busy = processingAsset || actions.isPending;
  const isOwner = community.viewerMembership?.status === "active"
    && community.viewerMembership.role === "owner";
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) onOpenChange(false);
        }}
        title="Administrar comunidade"
        className="max-h-[94dvh] rounded-t-[28px]"
      >
        <div className="grid gap-4 pb-[max(8px,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Configurações da comunidade">
            <button
              type="button"
              role="tab"
              aria-selected={section === "details"}
              onClick={() => setSection("details")}
              className={`min-h-11 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${section === "details" ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Detalhes
            </button>
            <button
              type="button"
              role="tab"
              disabled={!rulesAvailable}
              aria-selected={section === "rules"}
              onClick={() => setSection("rules")}
              className={`min-h-11 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50 ${section === "rules" ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Regras
            </button>
          </div>

          {section === "details" ? (
            <div className="grid gap-4" role="tabpanel">
              <div className="overflow-hidden rounded-3xl border border-gray-100 bg-gray-50">
                <div className="relative aspect-[16/7] bg-violet-100">
                  {coverUrl ? <img src={coverUrl} alt="" className="size-full object-cover" /> : null}
                  <FileTrigger
                    acceptedFileTypes={PROFILE_IMAGE_ACCEPT.split(",")}
                    onSelect={(files) => void selectAsset(files, "cover")}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      className="absolute bottom-2 right-2 flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-3 text-xs font-semibold text-gray-900 shadow outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"
                    >
                      <ImagePlus aria-hidden size={16} /> Alterar capa
                    </button>
                  </FileTrigger>
                </div>
                <div className="flex items-center gap-3 p-3">
                  <span className="grid size-16 place-items-center overflow-hidden rounded-2xl bg-violet-100 text-lg font-semibold text-violet-900">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : community.name.slice(0, 2).toLocaleUpperCase("pt-BR")}
                  </span>
                  <FileTrigger
                    acceptedFileTypes={PROFILE_IMAGE_ACCEPT.split(",")}
                    onSelect={(files) => void selectAsset(files, "avatar")}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      className="flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"
                    >
                      <Camera aria-hidden size={16} /> Alterar imagem
                    </button>
                  </FileTrigger>
                </div>
              </div>
              <Input label="Nome" value={name} onChange={setName} maxLength={100} isRequired isDisabled={busy} />
              <TextArea
                label="Descrição"
                value={description}
                onChange={setDescription}
                maxLength={2_000}
                rows={4}
                isDisabled={busy}
                hint={`${description.length}/2.000`}
              />
              <Input
                label="Categoria"
                value={category}
                onChange={setCategory}
                maxLength={40}
                isRequired
                isDisabled={busy}
                hint="Ex.: fé e vida, música, leitura"
              />
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                Visibilidade
                <select
                  value={visibility}
                  disabled={busy}
                  onChange={(event) => setVisibility(event.target.value === "private" ? "private" : "public")}
                  className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-950 outline-none focus:ring-2 focus:ring-violet-600"
                >
                  <option value="public">Pública — entrada imediata</option>
                  <option value="private">Privada — entrada por solicitação</option>
                </select>
              </label>
              <Button
                color="primary"
                size="lg"
                isLoading={actions.isPending}
                onPress={() => void run(
                  () => actions.updateCommunity({ name, description, category, visibility }),
                  "Comunidade atualizada.",
                )}
              >
                Salvar alterações
              </Button>
              {isOwner ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-3" aria-labelledby="archive-community-title">
                <h3 id="archive-community-title" className="font-semibold text-red-950">Encerrar comunidade</h3>
                <p className="mt-1 text-sm leading-5 text-red-800">
                  Arquivar retira a comunidade da descoberta e impede novas atividades. Esta ação é exclusiva do responsável.
                </p>
                {confirmArchive ? (
                  <div className="mt-3" role="alertdialog" aria-label="Confirmar arquivamento da comunidade">
                    <p className="text-sm font-semibold text-red-950">Confirmar arquivamento de {community.name}?</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button color="secondary" size="md" isDisabled={busy} onPress={() => setConfirmArchive(false)}>
                        Cancelar
                      </Button>
                      <Button
                        color="primary-destructive"
                        size="md"
                        isLoading={actions.isPending}
                        data-testid="archive-community-confirm"
                        onPress={() => void run(
                          actions.archiveCommunity,
                          "Comunidade arquivada.",
                        ).then((succeeded) => {
                          if (succeeded) onArchived();
                        })}
                      >
                        Arquivar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    color="secondary-destructive"
                    size="md"
                    className="mt-3 w-full"
                    data-testid="archive-community"
                    onPress={() => setConfirmArchive(true)}
                  >
                    Arquivar comunidade
                  </Button>
                )}
              </section>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4" role="tabpanel">
              {rules.length ? (
                <div className="grid gap-2">
                  {rules.map((rule, index) => (
                    <article className="rounded-2xl border border-gray-100 p-3" key={rule.id}>
                      <div className="flex items-start gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-50 text-xs font-semibold text-violet-800">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-sm text-gray-950">{rule.title}</strong>
                          <p className="mt-1 text-sm leading-5 text-gray-600">{rule.description}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Editar regra ${rule.title}`}
                          onClick={() => {
                            setEditingRule(rule);
                            setRuleTitle(rule.title);
                            setRuleDescription(rule.description);
                          }}
                          className="grid size-11 place-items-center rounded-full text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
                        >
                          <Pencil aria-hidden size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir regra ${rule.title}`}
                          onClick={() => setDeletingRuleId(rule.id)}
                          className="grid size-11 place-items-center rounded-full text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <Trash2 aria-hidden size={16} />
                        </button>
                      </div>
                      {deletingRuleId === rule.id ? (
                        <div className="mt-2 rounded-xl bg-red-50 p-3" role="alertdialog" aria-label="Confirmar exclusão da regra">
                          <p className="text-sm text-red-900">Excluir esta regra?</p>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Button color="secondary" size="sm" onPress={() => setDeletingRuleId(null)}>Cancelar</Button>
                            <Button
                              color="primary-destructive"
                              size="sm"
                              isLoading={actions.isPending}
                              onPress={() => void run(
                                () => actions.deleteRule(rule.id),
                                "Regra removida.",
                              ).then((succeeded) => {
                                if (succeeded) setDeletingRuleId(null);
                              })}
                            >
                              Excluir
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Nenhuma regra cadastrada.</p>
              )}
              {hasMoreRules ? (
                <Button
                  color="secondary"
                  size="md"
                  isLoading={loadingMoreRules}
                  onPress={onLoadMoreRules}
                >
                  Carregar mais regras
                </Button>
              ) : null}
              <div className="grid gap-3 rounded-2xl bg-gray-50 p-3">
                <h3 className="font-semibold text-gray-950">{editingRule ? "Editar regra" : "Nova regra"}</h3>
                <Input label="Título" value={ruleTitle} onChange={setRuleTitle} maxLength={100} isDisabled={busy} />
                <TextArea label="Descrição" value={ruleDescription} onChange={setRuleDescription} maxLength={1_000} rows={3} isDisabled={busy} />
                <div className="grid grid-cols-2 gap-2">
                  {editingRule ? (
                    <Button
                      color="secondary"
                      size="md"
                      onPress={() => {
                        setEditingRule(null);
                        setRuleTitle("");
                        setRuleDescription("");
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : <span />}
                  <Button
                    color="primary"
                    size="md"
                    iconLeading={editingRule ? Pencil : Plus}
                    isLoading={actions.isPending}
                    isDisabled={hasMoreRules || !ruleTitle.trim() || !ruleDescription.trim()}
                    onPress={() => void submitRule()}
                  >
                    {editingRule ? "Salvar" : "Adicionar"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {status ? <p className="text-sm text-emerald-700" role="status">{status}</p> : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
      </Drawer>
      {pendingAsset ? (
        <ProfileImageCropDrawer
          file={pendingAsset.file}
          purpose={pendingAsset.kind}
          busy={busy}
          onCancel={() => setPendingAsset(null)}
          onConfirm={(crop) => void uploadAsset(crop)}
        />
      ) : null}
    </>
  );
}
