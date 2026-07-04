import { createAdminApiModule } from "./modules/api.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminRouterModule } from "./modules/router.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminShellModule } from "./modules/shell.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminState } from "./modules/state.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminAssignmentsModule } from "./modules/pages/assignments.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminCandidatesModule } from "./modules/pages/candidates.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminDashboardModule } from "./modules/pages/dashboard.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminLogsModule } from "./modules/pages/logs.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminQuizzesModule } from "./modules/pages/quizzes.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";
import { createAdminStatusModule } from "./modules/pages/status.js?v=20260704-admin-breadcrumbs-current-type-csspattern-bg";

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
