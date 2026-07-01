import { m } from "framer-motion";

interface CommunityLoadingScreenProps {
  finishing?: boolean;
}

// Carga editorial: solo "wee." escribiéndose letra a letra (máquina de escribir).
export const CommunityLoadingScreen = ({ finishing = false }: CommunityLoadingScreenProps) => (
  <m.main
    className={`community-loading-screen${finishing ? " is-finishing" : ""}`}
    initial={{ opacity: 1 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    <div className="community-loading-type" aria-label="wee">
      <span className="community-loading-word">wee.</span>
    </div>
  </m.main>
);
