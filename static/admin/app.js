import { createAdminApiModule } from "./modules/api.js?v=20260707-hermes-logo-crop";
import { createAdminRouterModule } from "./modules/router.js?v=20260707-hermes-logo-crop";
import { createAdminShellModule } from "./modules/shell.js?v=20260707-hermes-logo-crop";
import { createAdminState } from "./modules/state.js?v=20260707-hermes-logo-crop";
import { createAdminAssignmentsModule } from "./modules/pages/assignments.js?v=20260707-hermes-logo-crop";
import { createAdminCandidatesModule } from "./modules/pages/candidates.js?v=20260707-hermes-logo-crop";
import { createAdminDashboardModule } from "./modules/pages/dashboard.js?v=20260707-hermes-logo-crop";
import { createAdminLogsModule } from "./modules/pages/logs.js?v=20260707-hermes-logo-crop";
import { createAdminQuizzesModule } from "./modules/pages/quizzes.js?v=20260707-hermes-logo-crop";
import { createAdminStatusModule } from "./modules/pages/status.js?v=20260707-hermes-logo-crop";

const register = () => {
  if (!window.Alpine) return;
  window.Alpine.data("adminApp", () => ({
    ...createAdminState(),
    ...createAdminApiModule(),
    ...createAdminShellModule(),
    ...createAdminDashboardModule(),
    ...createAdminQuizzesModule(),
    ...createAdminCandidatesModule(),
    ...createAdminAssignmentsModule(),
    ...createAdminLogsModule(),
    ...createAdminStatusModule(),
    ...createAdminRouterModule(),
  }));
};

if (window.Alpine) {
  register();
} else {
  document.addEventListener("alpine:init", register, { once: true });
}
