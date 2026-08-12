import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { BrandMark } from "@/app/components/brand-mark";
import type { ProfileDetails } from "@/domain/identity";
import {
  brazilianStates,
  getCitiesForState,
} from "@/infrastructure/location/brazil-locations";
import {
  isUsernameAvailable,
  updateOwnDetails,
  updateOwnProfile,
} from "@/infrastructure/supabase/identity-repository";
import { ControlledInput } from "@/app/auth/auth-fields";
import { useAuth } from "@/app/auth/auth-context";

type IdentityForm = { fullName: string; username: string; birthDate: string };
type LocationForm = { stateCode: string; city: string; bio: string; church: string };
type FavoritesForm = {
  movies: string;
  series: string;
  songs: string;
  artists: string;
  books: string;
  games: string;
};
type PersonalityValues = Pick<ProfileDetails, "personality" | "favorite_season" | "social_energy">;
type InterestsValues = Pick<ProfileDetails, "weekend_preferences" | "interests" | "hobbies">;
type PlacesValues = Pick<ProfileDetails, "visited_places" | "desired_places">;
type OptionalStepProps<TValues> = {
  details: ProfileDetails;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: (values: TValues) => Promise<void>;
  onSkip: () => Promise<void>;
};

const personalityOptions = ["Acolhedor", "Criativo", "Observador", "Comunicativo", "Tranquilo", "Aventureiro", "Sensível", "Bem-humorado"];
const seasonOptions = ["Verão", "Outono", "Inverno", "Primavera"];
const energyOptions = ["Mais reservado", "Equilibrado", "Muito sociável"];
const weekendOptions = ["Descansar", "Sair com amigos", "Igreja", "Cinema", "Natureza", "Cozinhar", "Jogar", "Conhecer lugares"];
const interestOptions = ["Fé", "Música", "Cinema", "Livros", "Viagens", "Fotografia", "Tecnologia", "Esportes", "Arte", "Gastronomia", "Pets", "Voluntariado"];
const hobbyOptions = ["Leitura", "Academia", "Caminhada", "Instrumentos", "Canto", "Jogos", "Fotografia", "Culinária", "Dança", "Jardinagem"];

function maxAdultDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

function valuesFromCommaList(value: string): { label: string }[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5).map((label) => ({ label }));
}

function OnboardingHeader({ step, onBack }: { step: number; onBack?: () => void }) {
  return (
    <header className="onboarding-header">
      {onBack ? <button type="button" className="auth-back" onClick={onBack} aria-label="Voltar"><ArrowLeft size={21} /></button> : <span />}
      <BrandMark className="onboarding-brand" />
      <span className="onboarding-count">{step}/6</span>
      <div className="onboarding-progress" aria-label={`Etapa ${step} de 6`}><span style={{ width: `${(step / 6) * 100}%` }} /></div>
    </header>
  );
}

function OnboardingPage({ step, onBack, children }: { step: number; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="onboarding-screen">
      <OnboardingHeader step={step} onBack={onBack} />
      <motion.main className="onboarding-content" key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        {children}
      </motion.main>
    </div>
  );
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="onboarding-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}

function ChoiceChips({ options, values, onChange, max }: { options: string[]; values: string[]; onChange: (values: string[]) => void; max?: number }) {
  return (
    <div className="choice-chips">
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <button
            type="button"
            key={option}
            className={selected ? "selected" : ""}
            onClick={() => {
              if (selected) onChange(values.filter((value) => value !== option));
              else if (!max || values.length < max) onChange([...values, option]);
            }}
          >
            {selected ? <Check size={14} /> : null}{option}
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingFlow({ onFinished }: { onFinished?: () => void }) {
  const { user, identity, refreshIdentity } = useAuth();
  const initialStep = Math.min(6, Math.max(1, (identity?.profile.onboarding_step ?? 0) + 1));
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user || !identity) return null;
  const userId = user.id;

  async function saveStep(nextStep: number, operation?: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      if (operation) await operation();
      await updateOwnProfile(userId, { onboarding_step: nextStep });
      setStep(Math.min(6, nextStep + 1));
    } catch {
      setError("Não foi possível salvar esta etapa. Tente novamente.");
    } finally { setSaving(false); }
  }

  async function finishOnboarding() {
    setSaving(true);
    setError(null);
    try {
      await updateOwnProfile(userId, { onboarding_step: 6, onboarding_completed_at: new Date().toISOString() });
      await refreshIdentity();
      onFinished?.();
    } catch {
      setError("Não foi possível concluir seu perfil. Revise os dados obrigatórios.");
      setSaving(false);
    }
  }

  if (step === 1) return <IdentityStep profile={identity.profile} saving={saving} error={error} onSubmit={async (values) => {
    setSaving(true); setError(null);
    try {
      const available = await isUsernameAvailable(values.username);
      if (!available) { setError("Este @username já está em uso ou não é válido."); return; }
      await updateOwnProfile(userId, { full_name: values.fullName, username: values.username, birth_date: values.birthDate, onboarding_step: 1 });
      setStep(2);
    } catch { setError("Não foi possível salvar seus dados. Tente novamente."); }
    finally { setSaving(false); }
  }} />;

  if (step === 2) return <LocationStep profile={identity.profile} saving={saving} error={error} onBack={() => setStep(1)} onSubmit={async (values, improve) => {
    setSaving(true); setError(null);
    if (!values.stateCode || !values.city || !values.bio.trim()) {
      setError("Escolha estado e cidade e escreva sua bio para continuar.");
      setSaving(false);
      return;
    }
    try {
      await updateOwnProfile(userId, { state_code: values.stateCode, city: values.city, bio: values.bio, church: values.church || null, onboarding_step: improve ? 2 : 6, onboarding_completed_at: improve ? null : new Date().toISOString() });
      if (improve) setStep(3);
      else {
        await refreshIdentity();
        onFinished?.();
      }
    } catch { setError("Não foi possível salvar sua localização e bio."); }
    finally { setSaving(false); }
  }} />;

  if (step === 3) return <PersonalityStep details={identity.details} saving={saving} error={error} onBack={() => setStep(2)} onContinue={(values) => saveStep(3, () => updateOwnDetails(userId, values))} onSkip={() => saveStep(3)} />;
  if (step === 4) return <InterestsStep details={identity.details} saving={saving} error={error} onBack={() => setStep(3)} onContinue={(values) => saveStep(4, () => updateOwnDetails(userId, values))} onSkip={() => saveStep(4)} />;
  if (step === 5) return <PlacesStep details={identity.details} saving={saving} error={error} onBack={() => setStep(4)} onContinue={(values) => saveStep(5, () => updateOwnDetails(userId, values))} onSkip={() => saveStep(5)} />;
  return <FavoritesStep saving={saving} error={error} onBack={() => setStep(5)} onSubmit={async (values) => {
    setSaving(true); setError(null);
    try {
      await updateOwnDetails(userId, {
        favorite_movies: valuesFromCommaList(values.movies), favorite_series: valuesFromCommaList(values.series),
        favorite_songs: valuesFromCommaList(values.songs), favorite_artists: valuesFromCommaList(values.artists),
        favorite_books: valuesFromCommaList(values.books), favorite_games: valuesFromCommaList(values.games),
      });
      await finishOnboarding();
    } catch { setError("Não foi possível salvar seus favoritos."); setSaving(false); }
  }} onSkip={finishOnboarding} />;
}

function IdentityStep({ profile, saving, error, onSubmit }: { profile: { full_name: string | null; username: string | null; birth_date: string | null }; saving: boolean; error: string | null; onSubmit: (values: IdentityForm) => Promise<void> }) {
  const form = useForm<IdentityForm>({ defaultValues: { fullName: profile.full_name ?? "", username: profile.username ?? "", birthDate: profile.birth_date ?? "" } });
  return <OnboardingPage step={1}><StepHeading eyebrow="SUA IDENTIDADE" title="Como podemos chamar você?" description="Esses dados formam a base do seu perfil." /><form className="auth-form" onSubmit={form.handleSubmit(onSubmit)}>
    <ControlledInput control={form.control} name="fullName" label="Nome completo" placeholder="Seu nome e sobrenome" autoComplete="name" rules={{ required: "Informe seu nome completo.", minLength: { value: 2, message: "Informe seu nome completo." } }} />
    <ControlledInput control={form.control} name="username" label="Username" placeholder="@seunome" autoComplete="username" rules={{ required: "Escolha seu @username.", pattern: { value: /^@?[a-zA-Z0-9._]{3,30}$/, message: "Use 3 a 30 letras, números, ponto ou underline." } }} />
    <Controller control={form.control} name="birthDate" rules={{ required: "Informe sua data de nascimento." }} render={({ field, fieldState }) => <div className="native-date-field"><label htmlFor="birth-date">Data de nascimento</label><input id="birth-date" type="date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} max={maxAdultDate()} autoComplete="bday" /><small className={fieldState.error ? "invalid" : ""}>{fieldState.error?.message ?? "No iPhone, o seletor nativo será aberto."}</small></div>} />
    {error ? <div className="auth-error" role="alert">{error}</div> : null}<Button type="submit" className="auth-primary-button" size="xl" isLoading={saving} iconTrailing={ArrowRight}>Continuar</Button>
  </form></OnboardingPage>;
}

function LocationStep({ profile, saving, error, onBack, onSubmit }: { profile: { state_code: string | null; city: string | null; bio: string | null; church: string | null }; saving: boolean; error: string | null; onBack: () => void; onSubmit: (values: LocationForm, improve: boolean) => Promise<void> }) {
  const form = useForm<LocationForm>({ defaultValues: { stateCode: profile.state_code ?? "", city: profile.city ?? "", bio: profile.bio ?? "", church: profile.church ?? "" } });
  const selectedState = useWatch({ control: form.control, name: "stateCode" });
  const selectedCity = useWatch({ control: form.control, name: "city" });
  const [cities, setCities] = useState<string[]>(profile.city ? [profile.city] : []);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityError, setCityError] = useState(false);

  async function changeState(nextState: string) {
    form.setValue("stateCode", nextState, { shouldValidate: true });
    form.setValue("city", "", { shouldValidate: true });
    setCities([]);
    setCityError(false);
    if (!nextState) return;

    setLoadingCities(true);
    try {
      setCities(await getCitiesForState(nextState));
    } catch {
      setCityError(true);
    } finally {
      setLoadingCities(false);
    }
  }

  return <OnboardingPage step={2} onBack={onBack}><StepHeading eyebrow="SEU LUGAR" title="Onde sua história acontece?" description="A localização ajuda a encontrar pessoas e comunidades próximas." /><form className="auth-form" onSubmit={(event) => event.preventDefault()}>
    <div className="location-fields"><NativeSelect label="Estado" value={selectedState} onChange={(event) => void changeState(event.target.value)} options={[{ label: "Selecione", value: "" }, ...brazilianStates.map(([value, label]) => ({ value, label }))]} />
    <NativeSelect label="Cidade" value={selectedCity} onChange={(event) => form.setValue("city", event.target.value, { shouldValidate: true })} disabled={!selectedState || loadingCities || cityError} options={[{ label: loadingCities ? "Carregando cidades..." : cityError ? "Não foi possível carregar" : "Selecione", value: "" }, ...cities.map((city) => ({ label: city, value: city }))]} /></div>
    <Controller control={form.control} name="bio" rules={{ required: "Conte um pouco sobre você.", maxLength: { value: 300, message: "Use até 300 caracteres." } }} render={({ field, fieldState }) => <TextArea label="Bio" placeholder="Conte um pouco sobre você..." value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={fieldState.invalid} hint={fieldState.error?.message ?? `${field.value.length}/300`} rows={4} className="orha-field" textAreaClassName="orha-textarea" />} />
    <ControlledInput control={form.control} name="church" label="Igreja (opcional)" placeholder="Se quiser compartilhar" />
    {error ? <div className="auth-error" role="alert">{error}</div> : null}
    <Button className="auth-primary-button" size="xl" isLoading={saving} onPress={() => void form.handleSubmit((values) => onSubmit(values, true))()} iconTrailing={Sparkles}>Melhorar meu perfil</Button>
    <button type="button" className="auth-text-action" disabled={saving} onClick={() => void form.handleSubmit((values) => onSubmit(values, false))()}>Concluir meu perfil agora</button>
  </form></OnboardingPage>;
}

function PersonalityStep({ details, saving, error, onBack, onContinue, onSkip }: OptionalStepProps<PersonalityValues>) {
  const [personality, setPersonality] = useState<string[]>(details.personality ?? []); const [season, setSeason] = useState(details.favorite_season ?? ""); const [energy, setEnergy] = useState(details.social_energy ?? "");
  return <OnboardingPage step={3} onBack={onBack}><StepHeading eyebrow="SEU JEITO" title="Como você se define?" description="Escolha até cinco características. Você poderá mudar isso depois." /><section className="onboarding-option-group"><label>Personalidade</label><ChoiceChips options={personalityOptions} values={personality} onChange={setPersonality} max={5} /></section><section className="onboarding-option-group"><label>Estação preferida</label><ChoiceChips options={seasonOptions} values={season ? [season] : []} onChange={(values) => setSeason(values.at(-1) ?? "")} max={1} /></section><section className="onboarding-option-group"><label>Energia social</label><ChoiceChips options={energyOptions} values={energy ? [energy] : []} onChange={(values) => setEnergy(values.at(-1) ?? "")} max={1} /></section>{error ? <div className="auth-error">{error}</div> : null}<div className="onboarding-actions"><Button className="auth-primary-button" size="xl" isLoading={saving} onPress={() => onContinue({ personality, favorite_season: season || null, social_energy: energy || null })}>Continuar</Button><button type="button" className="auth-text-action" onClick={onSkip}>Pular por enquanto</button></div></OnboardingPage>;
}

function InterestsStep({ details, saving, error, onBack, onContinue, onSkip }: OptionalStepProps<InterestsValues>) {
  const [weekend, setWeekend] = useState<string[]>(details.weekend_preferences ?? []); const [interests, setInterests] = useState<string[]>(details.interests ?? []); const [hobbies, setHobbies] = useState<string[]>(details.hobbies ?? []);
  return <OnboardingPage step={4} onBack={onBack}><StepHeading eyebrow="O QUE MOVE VOCÊ" title="Do que você gosta?" description="Usaremos isso para aproximar você de pessoas e conversas." /><section className="onboarding-option-group"><label>No fim de semana</label><ChoiceChips options={weekendOptions} values={weekend} onChange={setWeekend} /></section><section className="onboarding-option-group"><label>Interesses</label><ChoiceChips options={interestOptions} values={interests} onChange={setInterests} /></section><section className="onboarding-option-group"><label>Hobbies</label><ChoiceChips options={hobbyOptions} values={hobbies} onChange={setHobbies} /></section>{error ? <div className="auth-error">{error}</div> : null}<div className="onboarding-actions"><Button className="auth-primary-button" size="xl" isLoading={saving} onPress={() => onContinue({ weekend_preferences: weekend, interests, hobbies })}>Continuar</Button><button type="button" className="auth-text-action" onClick={onSkip}>Pular por enquanto</button></div></OnboardingPage>;
}

function PlacesStep({ details, saving, error, onBack, onContinue, onSkip }: OptionalStepProps<PlacesValues>) {
  const [visited, setVisited] = useState((details.visited_places ?? []).join(", ")); const [desired, setDesired] = useState((details.desired_places ?? []).join(", "));
  const parse = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return <OnboardingPage step={5} onBack={onBack}><StepHeading eyebrow="SEU MUNDO" title="Por onde você já passou?" description="Viagens também criam conversas e afinidades." /><div className="auth-form"><div className="plain-field"><label><MapPin size={15} /> Lugares que já visitou</label><textarea value={visited} onChange={(event) => setVisited(event.target.value)} placeholder="Ex.: Salvador, Lisboa, Gramado" rows={3} /><small>Separe os lugares por vírgulas.</small></div><div className="plain-field"><label><Sparkles size={15} /> Lugares que deseja conhecer</label><textarea value={desired} onChange={(event) => setDesired(event.target.value)} placeholder="Ex.: Roma, Jerusalém, Patagônia" rows={3} /></div>{error ? <div className="auth-error">{error}</div> : null}<Button className="auth-primary-button" size="xl" isLoading={saving} onPress={() => onContinue({ visited_places: parse(visited), desired_places: parse(desired) })}>Continuar</Button><button type="button" className="auth-text-action" onClick={onSkip}>Pular por enquanto</button></div></OnboardingPage>;
}

function FavoritesStep({ saving, error, onBack, onSubmit, onSkip }: { saving: boolean; error: string | null; onBack: () => void; onSubmit: (values: FavoritesForm) => Promise<void>; onSkip: () => Promise<void> }) {
  const form = useForm<FavoritesForm>({ defaultValues: { movies: "", series: "", songs: "", artists: "", books: "", games: "" } });
  const fields: [keyof FavoritesForm, string, string][] = [["movies", "Filmes", "Interestelar, À Prova de Fogo"], ["series", "Séries", "The Chosen"], ["songs", "Músicas", "Até cinco músicas"], ["artists", "Artistas", "Até cinco artistas"], ["books", "Livros", "Até cinco livros"], ["games", "Jogos", "Até cinco jogos"]];
  return <OnboardingPage step={6} onBack={onBack}><StepHeading eyebrow="SEUS FAVORITOS" title="O que você levaria com você?" description="Adicione até cinco por categoria, separados por vírgulas. A busca por APIs entra na próxima evolução." /><form className="auth-form favorites-form" onSubmit={form.handleSubmit(onSubmit)}>{fields.map(([name, label, placeholder]) => <ControlledInput key={name} control={form.control} name={name} label={label} placeholder={placeholder} />)}{error ? <div className="auth-error">{error}</div> : null}<Button type="submit" className="auth-primary-button" size="xl" isLoading={saving}>Concluir e entrar na ORHA</Button><button type="button" className="auth-text-action" onClick={() => void onSkip()}>Pular e concluir</button></form></OnboardingPage>;
}

