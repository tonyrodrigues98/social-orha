import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { TrustError } from "@/domains/trust";
import {
  SupabaseTrustRepository,
  mapAccountLifecycleRow,
  mapBlockRow,
  mapBlockSummaryRow,
  mapModerationReportContextRow,
  mapReportRow,
  mapTrustError,
} from "./trust-repository";

describe("SupabaseTrustRepository mapping", () => {
  it("normaliza um bloqueio persistido", () => {
    expect(
      mapBlockRow({
        id: "10000000-0000-4000-8000-000000000001",
        blocked_id: "10000000-0000-4000-8000-000000000002",
        blocked_profile: {
          id: "10000000-0000-4000-8000-000000000002",
          full_name: "Pessoa bloqueada",
          username: "bloqueada",
          avatar_path: null,
        },
        created_at: "2026-08-16T10:00:00.000Z",
      }).blockedProfile?.username,
    ).toBe("bloqueada");
  });

  it("normaliza a projeção autoritativa da própria lista de bloqueios", () => {
    expect(mapBlockSummaryRow({
      block_id: "10000000-0000-4000-8000-000000000001",
      blocked_profile_id: "10000000-0000-4000-8000-000000000002",
      full_name: "Pessoa bloqueada",
      username: "bloqueada",
      avatar_path: null,
      created_at: "2026-08-16T10:00:00.000Z",
    })).toMatchObject({
      blockedProfileId: "10000000-0000-4000-8000-000000000002",
      blockedProfile: { fullName: "Pessoa bloqueada", username: "bloqueada" },
    });
  });

  it("normaliza denúncia sem conceder autoridade no cliente", () => {
    const report = mapReportRow({
      id: "10000000-0000-4000-8000-000000000001",
      reporter_id: "10000000-0000-4000-8000-000000000002",
      target_type: "message",
      target_id: "10000000-0000-4000-8000-000000000003",
      category: "harassment",
      details: "Conteúdo repetido",
      status: "open",
      assigned_to: null,
      resolution: null,
      created_at: "2026-08-16T10:00:00.000Z",
      updated_at: "2026-08-16T10:00:00.000Z",
      resolved_at: null,
    });
    expect(report.status).toBe("open");
    expect(report).not.toHaveProperty("canModerate");
  });

  it("converte códigos do servidor em erros estáveis", () => {
    const error = mapTrustError({ code: "42501", message: "raw database message" });
    expect(error).toBeInstanceOf(TrustError);
    expect(error.code).toBe("permission");
    expect(error.message).not.toContain("raw database");
    expect(mapTrustError({ code: "PGRST003" }).code).toBe("unavailable");
    expect(mapTrustError({ code: "current_password_mismatch" }).message).toBe(
      "A senha atual não foi confirmada.",
    );
    expect(mapTrustError({ code: "current_password_invalid" }).message).toBe(
      "A senha atual não foi confirmada.",
    );
    expect(mapTrustError({ code: "same_password" }).message).toContain("diferente");
    expect(mapTrustError({ code: "weak_password" }).message).toContain("12 caracteres");
  });

  it("consulta o bloqueio exato sem inferir pela página da lista", async () => {
    const row = {
      block_id: "10000000-0000-4000-8000-000000000001",
      blocked_profile_id: "10000000-0000-4000-8000-000000000002",
      full_name: "Pessoa bloqueada",
      username: "bloqueada",
      avatar_path: null,
      created_at: "2026-08-16T10:00:00.000Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const repository = new SupabaseTrustRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(repository.getBlockedProfile(row.blocked_profile_id)).resolves.toMatchObject({
      id: row.block_id,
      blockedProfileId: row.blocked_profile_id,
    });
    expect(rpc).toHaveBeenCalledWith("list_own_blocked_profiles", {
      p_limit: 1,
      p_before_created_at: null,
      p_before_id: null,
      p_blocked_profile_id: row.blocked_profile_id,
    });
  });

  it("altera senha com validação server-side da senha atual e encerra sessões", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseTrustRepository({
      auth: { updateUser, signOut },
    } as unknown as SupabaseClient);

    await repository.changePassword("senha-atual", "uma-senha-forte-123");
    await repository.signOutEverywhere();

    expect(updateUser).toHaveBeenCalledWith({
      password: "uma-senha-forte-123",
      current_password: "senha-atual",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("expõe o status efetivo sem vazar o marcador interno de lifecycle", async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { public_reason: "account_lifecycle:delete:10000000-0000-4000-8000-000000000040" },
        error: null,
      }),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "10000000-0000-4000-8000-000000000031" } },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        effective_status: "restricted",
        recorded_status: "restricted",
        restricted_until: "2026-09-15T10:00:00.000Z",
        access_enabled: false,
      }],
      error: null,
    });
    const repository = new SupabaseTrustRepository({
      auth: { getUser },
      rpc,
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient);

    await expect(repository.getAccountAccess()).resolves.toEqual({
      effectiveStatus: "restricted",
      recordedStatus: "restricted",
      accessEnabled: false,
      publicReason: "Há uma solicitação de conta em andamento.",
      restrictedUntil: "2026-09-15T10:00:00.000Z",
    });
  });

  it("envia denúncias somente pela RPC autoritativa", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: null,
      data: {
        id: "10000000-0000-4000-8000-000000000010",
        reporter_id: "10000000-0000-4000-8000-000000000011",
        target_type: "profile",
        target_id: "10000000-0000-4000-8000-000000000012",
        category: "harassment",
        details: "Contato indesejado recorrente",
        status: "open",
        assigned_to: null,
        resolution: null,
        created_at: "2026-08-16T10:00:00.000Z",
        updated_at: "2026-08-16T10:00:00.000Z",
        resolved_at: null,
      },
    });
    const repository = new SupabaseTrustRepository({ rpc } as unknown as SupabaseClient);
    await repository.createReport({
      targetType: "profile",
      targetId: "10000000-0000-4000-8000-000000000012",
      category: "harassment",
      details: "Contato indesejado recorrente",
    });
    expect(rpc).toHaveBeenCalledWith("create_report", {
      p_target_type: "profile",
      p_target_id: "10000000-0000-4000-8000-000000000012",
      p_category: "harassment",
      p_details: "Contato indesejado recorrente",
    });
  });

  it("mapeia a sanção retornada pela RPC de moderação", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: null,
      data: {
        id: "10000000-0000-4000-8000-000000000020",
        case_id: "10000000-0000-4000-8000-000000000021",
        imposed_by: "10000000-0000-4000-8000-000000000022",
        target_type: "profile",
        target_id: "10000000-0000-4000-8000-000000000023",
        action_type: "warn",
        reason: "Evidência revisada e advertência necessária.",
        expires_at: null,
        created_at: "2026-08-16T10:00:00.000Z",
      },
    });
    const repository = new SupabaseTrustRepository({ rpc } as unknown as SupabaseClient);
    const action = await repository.applyModerationAction({
      reportId: "10000000-0000-4000-8000-000000000024",
      actionType: "warn",
      reason: "Evidência revisada e advertência necessária.",
    });
    expect(action.reportId).toBe("10000000-0000-4000-8000-000000000024");
    expect(action.moderatorId).toBe("10000000-0000-4000-8000-000000000022");
  });

  it("carrega somente o contexto auditado do alvo denunciado", async () => {
    const row = {
      report_id: "10000000-0000-4000-8000-000000000024",
      target_type: "message" as const,
      target_id: "10000000-0000-4000-8000-000000000025",
      target_owner_id: "10000000-0000-4000-8000-000000000026",
      content_text: "Conteúdo denunciado",
      content_kind: "text",
      content_created_at: "2026-08-16T10:00:00.000Z",
      attachment_ids: ["10000000-0000-4000-8000-000000000027"],
    };
    expect(mapModerationReportContextRow(row)).toMatchObject({
      reportId: row.report_id,
      contentText: row.content_text,
      attachmentIds: row.attachment_ids,
    });

    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const repository = new SupabaseTrustRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.getModerationReportContext(row.report_id)).resolves.toMatchObject({
      targetId: row.target_id,
      contentKind: "text",
    });
    expect(rpc).toHaveBeenCalledWith("get_moderation_report_context", {
      p_report_id: row.report_id,
    });
  });

  it("autoriza por tempo curto somente o anexo auditado do report", async () => {
    const row = {
      attachment_id: "10000000-0000-4000-8000-000000000027",
      source_kind: "message_attachment" as const,
      bucket_id: "chat-media",
      object_path: "owner/conversation/message/audio.webm",
      mime_type: "audio/webm",
      byte_size: 4096,
      duration_seconds: "3.5",
      waveform: [0.2, 0.8, 0.4],
      width: null,
      height: null,
    };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-audio" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = new SupabaseTrustRepository({
      rpc,
      storage: { from },
    } as unknown as SupabaseClient);

    await expect(
      repository.getModerationReportAttachment(
        "10000000-0000-4000-8000-000000000024",
        row.attachment_id,
      ),
    ).resolves.toMatchObject({
      attachmentId: row.attachment_id,
      durationSeconds: 3.5,
      waveform: row.waveform,
      signedUrlExpiresInSeconds: 60,
    });
    expect(rpc).toHaveBeenCalledWith("get_moderation_report_attachment", {
      p_report_id: "10000000-0000-4000-8000-000000000024",
      p_attachment_id: row.attachment_id,
    });
    expect(from).toHaveBeenCalledWith("chat-media");
    expect(createSignedUrl).toHaveBeenCalledWith(row.object_path, 60);
  });

  it("mapeia o pedido persistente de ciclo da conta", () => {
    const request = mapAccountLifecycleRow({
      id: "10000000-0000-4000-8000-000000000030",
      user_id: "10000000-0000-4000-8000-000000000031",
      kind: "delete",
      status: "pending",
      requested_at: "2026-08-16T10:00:00.000Z",
      execute_after: "2026-09-15T10:00:00.000Z",
      completed_at: null,
      cancelled_at: null,
    });
    expect(request.kind).toBe("delete");
    expect(request.scheduledFor).toBe("2026-09-15T10:00:00.000Z");
  });

  it("reautentica e solicita exclusão pela RPC com confirmação server-side", async () => {
    const row = {
      id: "10000000-0000-4000-8000-000000000030",
      user_id: "10000000-0000-4000-8000-000000000031",
      kind: "delete",
      status: "pending",
      requested_at: "2026-08-16T10:00:00.000Z",
      execute_after: "2026-09-15T10:00:00.000Z",
      completed_at: null,
      cancelled_at: null,
    };
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: row.user_id, email: "conta@example.com" } },
      error: null,
    });
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: row.user_id } },
      error: null,
    });
    const repository = new SupabaseTrustRepository({
      rpc,
      auth: { getUser, signInWithPassword },
    } as unknown as SupabaseClient);
    await repository.createAccountLifecycleRequest({ kind: "delete", currentPassword: "senha-atual-forte" });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "conta@example.com",
      password: "senha-atual-forte",
    });
    expect(rpc).toHaveBeenCalledWith("request_account_lifecycle", {
      p_kind: "delete",
      p_confirmation: "CONFIRMAR",
    });
  });
});
