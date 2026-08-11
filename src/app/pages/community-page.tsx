import { ChevronRight, Church, MessageCircleMore, Plus, UsersRound } from "lucide-react";
import { NativeHeader } from "../components/native-header";
import { usePrototype } from "../prototype-context";

export function CommunityPage() {
  const { communities: testCommunities, openDrawer } = usePrototype();
  return (
    <div className="page">
      <NativeHeader title="Comunidade" subtitle="Encontre gente que entende você" />
      <main className="page-content">
        <section className="community-hero">
          <span className="floating-symbol"><UsersRound size={26} /></span>
          <span className="section-overline light">ONDE A CONVERSA ACONTECE</span>
          <h2>Assuntos em comum.<br />Pessoas de verdade.</h2>
          <p>Entre para conversar, participar e criar vínculos.</p>
          <button type="button" className="light-action" onClick={() => openDrawer({ type: "create-community" })}><Plus size={17} /> Criar comunidade</button>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">EM ALTA</span><h2>Conversas acontecendo agora</h2></div>
          </div>
          <div className="topic-grid">
            <button type="button" className="topic-card violet" onClick={() => openDrawer({ type: "topic", topic: "Vida e propósito" })}>
              <MessageCircleMore size={21} /><strong>Vida e propósito</strong><small>128 conversando</small>
            </button>
            <button type="button" className="topic-card green" onClick={() => openDrawer({ type: "topic", topic: "Fé no cotidiano" })}>
              <Church size={21} /><strong>Fé no cotidiano</strong><small>86 conversando</small>
            </button>
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">PARA VOCÊ</span><h2>Comunidades sugeridas</h2></div>
          </div>
          <div className="community-list elevated-list">
            {testCommunities.map((community) => (
              <button type="button" className="community-row" key={community.name} onClick={() => openDrawer({ type: "community", communityName: community.name })}>
                <span className="community-monogram" style={{ background: community.accent }}>
                  {community.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="community-copy"><strong>{community.name}</strong><small>{community.topic}</small></span>
                <ChevronRight size={18} aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
