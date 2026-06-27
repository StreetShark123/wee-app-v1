import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

interface CommunityLoadingScreenProps {
  communityName?: string;
  topics?: string[];
  usersCount?: number;
  finishing?: boolean;
}

const TIP_SWITCH_MS = 2200;

export const CommunityLoadingScreen = ({
  communityName,
  topics = [],
  usersCount = 0,
  finishing = false
}: CommunityLoadingScreenProps) => {
  const { language } = useI18n();
  const [tipIndex, setTipIndex] = useState(0);

  const tips = useMemo(() => {
    const featuredTopic = topics[0];
    const communityLabel = communityName ?? pick(language, "tu club", "your community", "a túa comunidade");
    const peopleLabel =
      usersCount > 0
        ? pick(
            language,
            `${usersCount} personas ya están calentando el debate.`,
            `${usersCount} people are already warming up the thread.`,
            `${usersCount} persoas xa están quentando o fío.`
          )
        : pick(language, "Hoy toca abrir buen debate.", "Time to open a good thread.", "Hoxe toca abrir bo fío.");
    return [
      pick(
        language,
        `Poniendo a punto las lecturas de ${communityLabel}...`,
        `Tuning ${communityLabel}'s feed...`,
        `Poñendo a punto o feed de ${communityLabel}...`
      ),
      featuredTopic
        ? pick(
            language,
            `Buscando contexto en ${featuredTopic} sin humo...`,
            `Looking for solid context in ${featuredTopic}...`,
            `Buscando contexto en ${featuredTopic} sen fume...`
          )
        : pick(
            language,
            "Ordenando temas para que todo tenga sentido...",
            "Organizing topics so everything makes sense...",
            "Ordenando temas para que todo teña sentido..."
          ),
      peopleLabel,
      pick(
        language,
        "Quitando ruido y dejando las buenas lecturas para el club.",
        "Cutting noise and keeping what helps the group.",
        "Quitando ruído e deixando o útil para o grupo."
      ),
      pick(
        language,
        "Preparando tu sala para compartir libros y debatir sin perder el hilo.",
        "Getting your room ready to share and comment without losing the thread.",
        "Preparando a túa sala para compartir e comentar sen perder o fío."
      )
    ];
  }, [communityName, language, topics, usersCount]);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % tips.length);
    }, TIP_SWITCH_MS);
    return () => window.clearInterval(id);
  }, [tips.length]);

  const currentTip = tips[tipIndex % Math.max(tips.length, 1)] ?? "";

  return (
    <m.main
      className={`community-loading-screen${finishing ? " is-finishing" : ""}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="community-loading-core">
        <div className="community-loading-orbit" aria-hidden="true">
          <span className="community-loading-ring ring-a" />
          <span className="community-loading-ring ring-b" />
          <span className="community-loading-ring ring-c" />
          <span className="community-loading-brand">
            <Icon name="spiral" size={18} />
          </span>
        </div>
        <h2>{pick(language, "Montando tu club", "Building your home", "Montando a túa home")}</h2>
        <p className="hint">{pick(language, "Un segundo y te acompañamos al debate.", "One sec and we’ll walk you into the thread.", "Un segundo e acompañámoste ao fío.")}</p>
        <AnimatePresence mode="wait">
          <m.p
            key={`${tipIndex}-${currentTip}`}
            className="community-loading-tip"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {currentTip}
          </m.p>
        </AnimatePresence>
      </div>
      <span className="community-loading-fade" aria-hidden="true" />
    </m.main>
  );
};
