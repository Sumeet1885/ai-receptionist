import { renderToString } from "react-dom/server";
import { BolegaLanding } from "./components/landing/bolega/BolegaLanding";
import { LegalView } from "./components/legal/LegalView";
import { PricingView } from "./components/billing/PricingView";
import { RequestAccessView } from "./components/auth/RequestAccessView";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";

const navigate = () => undefined;

/** Render actual public components at build time; no credentials, customer data or API calls. */
export function renderPublicPage(path: string) {
  if (path === "/")
    return renderToString(
      <BolegaLanding navigate={navigate} signedIn={false} />,
    );
  const routeName =
    path === "/request-access" ? "request-access" : path.slice(1);
  return renderToString(
    <>
      <Header
        routeName={routeName}
        navigate={navigate}
        user={null}
        signOut={async () => undefined}
      />
      <main>
        {path === "/privacy" || path === "/terms" ? (
          <LegalView
            type={path.slice(1) as "privacy" | "terms"}
            navigate={navigate}
          />
        ) : path === "/pricing" ? (
          <PricingView navigate={navigate} />
        ) : (
          <RequestAccessView navigate={navigate} />
        )}
      </main>
      {path !== "/request-access" && <Footer />}
    </>,
  );
}
