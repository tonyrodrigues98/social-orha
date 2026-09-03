import { useState } from "react";
import { ChevronLeft, Flag } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import {
  useReportSubmission,
  type Report,
  type ReportCategory,
  type ReportTargetType,
} from "@/domains/trust";

const categories: Array<{ value: ReportCategory; label: string }> = [
  { value: "harassment", label: "Assédio ou intimidação" },
  { value: "hate", label: "Ódio ou discriminação" },
  { value: "sexual_content", label: "Conteúdo sexual" },
  { value: "violence", label: "Violência ou ameaça" },
  { value: "spam", label: "Spam ou golpe" },
  { value: "impersonation", label: "Falsa identidade" },
  { value: "privacy", label: "Violação de privacidade" },
  { value: "other", label: "Outro motivo" },
];

export function ReportPage({
  targetType,
  targetId,
  targetLabel,
  onBack,
  onSubmitted,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  onBack: () => void;
  onSubmitted: (report: Report) => void;
}) {
  const submission = useReportSubmission();
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [details, setDetails] = useState("");

  const submit = async () => {
    try {
      const report = await submission.submit({
        targetType,
        targetId,
        category,
        details: details.trim() || null,
      });
      onSubmitted(report);
    } catch {
      // O hook mantém a mensagem segura e permite nova tentativa sem perder o formulário.
    }
  };

  return (
    <div className="page min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-950">Fazer denúncia</h1>
            <p className="text-xs text-gray-500">Sua identidade não é exibida para a pessoa denunciada</p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 pb-[max(32px,env(safe-area-inset-bottom))]">
        <div className="flex gap-3 rounded-3xl border border-gray-200 bg-white p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-700">
            <Flag aria-hidden size={20} />
          </span>
          <div>
            <h2 className="font-semibold text-gray-950">{targetLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              A equipe receberá somente os dados necessários para analisar este conteúdo.
            </p>
          </div>
        </div>

        <form
          className="space-y-4 rounded-3xl border border-gray-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block text-sm font-medium text-gray-700">
            Motivo
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ReportCategory)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-600"
            >
              {categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <TextArea
            label="O que aconteceu? (opcional)"
            placeholder="Inclua contexto objetivo que ajude a análise"
            value={details}
            onChange={setDetails}
            rows={5}
            maxLength={1500}
            hint={`${details.length}/1.500 caracteres`}
          />
          {submission.error && <p className="text-sm text-red-700" role="alert">{submission.error}</p>}
          <Button color="primary-destructive" size="lg" className="w-full" type="submit" isLoading={submission.status === "submitting"}>
            Enviar denúncia
          </Button>
        </form>
      </main>
    </div>
  );
}
