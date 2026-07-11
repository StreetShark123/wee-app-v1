import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { PunctuationLoader } from "../components/PunctuationLoader";
import { getCommunitySession } from "../lib/communitySession";
import type { User } from "../lib/types";

interface RequireAuthProps {
  activeUser: User | null;
  children: ReactNode;
  redirectPath?: string;
}

export const RequireAuth = ({ activeUser, children, redirectPath = "/login" }: RequireAuthProps) => {
  if (!activeUser) {
    // Transitorio durante un cambio de club (o la carga inicial): ya hay sesión
    // de club válida, pero `activeUser` aún no se reconcilió con la nueva lista
    // de usuarios (activeUserId apunta al club nuevo mientras `users` todavía es
    // la del viejo). NO redirigir a /communities: si lo hacemos, el picker
    // auto-entra al club por defecto y deshace el cambio ("vuelve al club
    // original"). Esperamos a que se estabilice. Si la sesión es inválida,
    // reload() la limpia y en el siguiente render sí se redirige.
    if (getCommunitySession()) {
      return <PunctuationLoader />;
    }
    return <Navigate to={redirectPath} replace />;
  }
  return <>{children}</>;
};
