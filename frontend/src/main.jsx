import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import keycloak from "./keycloak.js";

keycloak
  .init({ onLoad: "login-required", checkLoginIframe: false })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }

    localStorage.setItem("sgfv_token", keycloak.token);

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).then(() => {
        localStorage.setItem("sgfv_token", keycloak.token);
      });
    };

    createRoot(document.getElementById("root")).render(
      <StrictMode>
        <App keycloak={keycloak} />
      </StrictMode>
    );
  })
  .catch(() => {
    document.getElementById("root").innerHTML =
      "<p style='color:red;padding:20px'>Impossible de contacter Keycloak (http://localhost:8085). Vérifiez que Docker est lancé.</p>";
  });
