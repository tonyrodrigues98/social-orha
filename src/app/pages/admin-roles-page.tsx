import { useState } from "react";
import { ChevronLeft, Search, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Drawer } from "@/components/godui/drawer";
import { roleLabels, type AppRole, type UserIdentity } from "@/domain/identity";
import {
  useAssignGlobalRole,
  useGlobalRoleAssignments,
  type GlobalRoleAssignment,
} from "@/domains/administration";

const allRoles: readonly AppRole[] = ["user", "support", "moderator", "admin", "super_admin"];
const adminAssignableRoles: readonly AppRole[] = ["user", "support", "moderator"];

function roleTone(role: AppRole) {
  if (role === "super_admin") return "bg-violet-100 text-violet-800";
  if (role === "admin") return "bg-blue-100 text-blue-800";
  if (role === "moderator") return "bg-amber-100 text-amber-900";
  if (role === "support") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

export function AdminRolesPage({
  identity,
  onBack,
}: {
  identity: UserIdentity;
  onBack: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<GlobalRoleAssignment | null>(null);
  const [nextRole, setNextRole] = useState<AppRole>("user");
  const [reason, setReason] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const assignments = useGlobalRoleAssignments(searchQuery);
  const mutation = useAssignGlobalRole();
  const assignableRoles = identity.role === "super_admin" ? allRoles : adminAssignableRoles;

  const openAssignment = (assignment: GlobalRoleAssignment) => {
    setSelected(assignment);
    setNextRole(assignment.role);
    setReason("");
    setSuccess(null);
    mutation.reset();
  };

  const save = async () => {
    if (!selected) return;
    const updated = await mutation.assign({
      targetUserId: selected.userId,
      role: nextRole,
      reason,
    });
    setSelected(null);
    setSuccess(`${updated.fullName} agora possui a função ${roleLabels[updated.role]}.`);
  };

  return (
    <div className="page min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 shrink-0 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            <UserCog aria-hidden size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-gray-950">Funções da equipe</h1>
            <p className="truncate text-xs text-gray-500">Atribuições protegidas e auditadas</p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 pb-[max(32px,env(safe-area-inset-bottom))]">
        <aside className="flex gap-3 rounded-2xl bg-violet-50 p-4 text-violet-950">
          <ShieldCheck aria-hidden className="mt-0.5 shrink-0" size={20} />
          <p className="text-sm leading-5">
            A interface solicita a mudança; o banco valida sua função, impede escalada e registra o motivo.
          </p>
        </aside>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = searchDraft.trim();
            if (normalized.length === 0 || normalized.length >= 2) setSearchQuery(normalized);
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="Buscar pessoa"
              placeholder="Nome ou @username"
              value={searchDraft}
              onChange={setSearchDraft}
              maxLength={64}
            />
          </div>
          <Button
            type="submit"
            color="secondary"
            size="lg"
            iconLeading={Search}
            isDisabled={searchDraft.trim().length === 1}
          >
            Buscar
          </Button>
        </form>

        {success && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{success}</p>}
        {assignments.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
            <p className="text-sm text-red-800">{assignments.error}</p>
            <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void assignments.reload()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {assignments.status === "loading" ? (
          <div className="space-y-2" aria-label="Carregando funções">
            {Array.from({ length: 4 }, (_, index) => <div className="h-20 animate-pulse rounded-2xl bg-gray-100" key={index} />)}
          </div>
        ) : assignments.items.length === 0 ? (
          <section className="rounded-3xl border border-gray-200 bg-white px-6 py-10 text-center">
            <UserCog aria-hidden className="mx-auto text-gray-400" size={32} />
            <h2 className="mt-3 font-semibold text-gray-950">Nenhuma conta encontrada</h2>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? "Revise o nome ou @username informado." : "Ainda não há equipe operacional atribuída."}
            </p>
          </section>
        ) : (
          <section className="divide-y divide-gray-100 overflow-hidden rounded-3xl border border-gray-200 bg-white" aria-label="Atribuições globais">
            {assignments.items.map((assignment) => {
              const isSelf = assignment.userId === identity.profile.id;
              return (
                <article className="flex min-h-20 items-center gap-3 px-4 py-3" key={assignment.userId}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                    {assignment.fullName.slice(0, 2).toLocaleUpperCase("pt-BR")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-gray-950">{assignment.fullName}</strong>
                    <span className="block truncate text-xs text-gray-500">@{assignment.username}</span>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleTone(assignment.role)}`}>
                      {roleLabels[assignment.role]}
                    </span>
                  </span>
                  <Button
                    color="secondary"
                    size="sm"
                    isDisabled={isSelf}
                    onPress={() => openAssignment(assignment)}
                  >
                    {isSelf ? "Sua função" : "Alterar"}
                  </Button>
                </article>
              );
            })}
          </section>
        )}

        {assignments.hasMore && (
          <Button color="secondary" size="md" className="w-full" isLoading={assignments.isLoadingMore} onPress={() => void assignments.loadMore()}>
            Carregar mais
          </Button>
        )}
      </main>

      <Drawer
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        title="Alterar função"
        className="max-h-[88dvh]"
      >
        {selected && (
          <form
            className="space-y-4 pb-[max(8px,env(safe-area-inset-bottom))]"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="rounded-2xl bg-gray-50 p-4">
              <strong className="block text-sm text-gray-950">{selected.fullName}</strong>
              <span className="text-sm text-gray-500">@{selected.username} · {roleLabels[selected.role]}</span>
            </div>
            <label className="block text-sm font-medium text-gray-700">
              Nova função
              <select
                value={nextRole}
                onChange={(event) => setNextRole(event.target.value as AppRole)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-600"
              >
                {assignableRoles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}
              </select>
            </label>
            <TextArea
              label="Motivo operacional"
              hint="Obrigatório e armazenado no log de auditoria."
              placeholder="Explique por que esta pessoa precisa da nova função"
              value={reason}
              onChange={setReason}
              rows={4}
              maxLength={500}
              isRequired
            />
            {mutation.error && <p className="text-sm text-red-700" role="alert">{mutation.error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button color="secondary" size="lg" onPress={() => setSelected(null)}>Cancelar</Button>
              <Button
                type="submit"
                color="primary"
                size="lg"
                isLoading={mutation.isPending}
                isDisabled={nextRole === selected.role || reason.trim().length < 12}
              >
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
