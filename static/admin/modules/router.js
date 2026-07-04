import { clearFragmentMount, loadHtmlFragment } from "/static/assets/js/shared/runtime.js";

function parseAdminRouteLocation(value) {
  const fallback = "/admin/dashboard";
  const raw = String(value || fallback).trim() || fallback;
  let url;
  try {
    url = new URL(raw, window.location.origin);
  } catch (_error) {
    url = new URL(fallback, window.location.origin);
  }
  const query = Object.fromEntries(url.searchParams.entries());
  const hash = String(url.hash || "").replace(/^#/, "");
  return {
    pathname: url.pathname || fallback,
    search: url.search || "",
    hash,
    href: `${url.pathname || fallback}${url.search || ""}${url.hash || ""}`,
    query,
  };
}

function routeRecord(parts, data) {
  return {
    ...data,
    path: data.path || parts.pathname,
    href: data.href || parts.href,
    query: parts.query || {},
    hash: parts.hash || "",
  };
}

function dashboardRouteRecord(parts) {
  const hash = parts.hash ? `#${parts.hash}` : "";
  return routeRecord(
    { ...parts, href: `/admin/dashboard${parts.search || ""}${hash}` },
    { name: "dashboard", path: "/admin/dashboard", title: "总览", section: "Dashboard", params: {} },
  );
}

function normalizedAssignmentStatusFilter(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["invited","verified","in_quiz","grading","finished"].includes(status) ? status : "";
}

function normalizedAssignmentHandlingFilter(value) {
  const handling = String(value || "").trim().toLowerCase();
  return ["unhandled","handled"].includes(handling) ? handling : "";
}

function normalizedAssignmentSourceFilter(value) {
  const source = String(value || "").trim().toLowerCase();
  return ["public","direct"].includes(source) ? source : "";
}

export const ADMIN_ROUTE_FRAGMENTS = {
  login: { fragment: "/static/admin/pages/login.html", mountRef: "loginMount" },
  dashboard: { fragment: "/static/admin/pages/dashboard.html", mountRef: "pageMount" },
  quizzes: { fragment: "/static/admin/pages/quizzes.html", mountRef: "pageMount" },
  "quiz-detail": { fragment: "/static/admin/pages/quiz-detail.html", mountRef: "pageMount" },
  candidates: { fragment: "/static/admin/pages/candidates.html", mountRef: "pageMount" },
  "candidate-detail": { fragment: "/static/admin/pages/candidate-detail.html", mountRef: "pageMount" },
  assignments: { fragment: "/static/admin/pages/assignments.html", mountRef: "pageMount" },
  "attempt-detail": { fragment: "/static/admin/pages/attempt-detail.html", mountRef: "pageMount" },
  logs: { fragment: "/static/admin/pages/logs.html", mountRef: "pageMount" },
  status: { fragment: "/static/admin/pages/status.html", mountRef: "pageMount" },
  mcp: { fragment: "/static/admin/pages/mcp.html", mountRef: "pageMount" },
};

export function createAdminRouterModule() {
  return {
    async resolveAdminRouteMount(refName, maxTicks = 4) {
      let mount = this.$refs?.[refName];
      if (mount instanceof HTMLElement) {
        return mount;
      }
      // 登录态切换依赖 x-if 重建壳层，先等挂载点真正进入 DOM。
      for (let index = 0; index < maxTicks; index += 1) {
        if (typeof this.$nextTick === "function") {
          await this.$nextTick();
        } else {
          await Promise.resolve();
        }
        mount = this.$refs?.[refName];
        if (mount instanceof HTMLElement) {
          return mount;
        }
      }
      return null;
    },

    currentAdminRouteFragment() {
      return ADMIN_ROUTE_FRAGMENTS[String(this.route?.name || "").trim()] || ADMIN_ROUTE_FRAGMENTS.dashboard;
    },

    async renderCurrentRoute() {
      const current = this.currentAdminRouteFragment();
      const target = await this.resolveAdminRouteMount(current.mountRef);
      const otherRef = current.mountRef === "loginMount" ? "pageMount" : "loginMount";
      const other = this.$refs?.[otherRef];
      clearFragmentMount(other, window.Alpine);
      if (!(target instanceof HTMLElement)) {
        return;
      }
      await loadHtmlFragment({
        mount: target,
        path: current.fragment,
        cache: this.fragmentCache,
        alpine: window.Alpine,
      });
    },

    resolveRoute(pathname) {
      const parts = parseAdminRouteLocation(pathname);
      const path = parts.pathname || "/admin";
      if (path === "/admin/login") {
        return routeRecord(parts, { name: "login", path, title: "管理员登录", section: "Login", params: {} });
      }
      if (path === "/admin" || path === "/admin/dashboard") {
        return dashboardRouteRecord(parts);
      }
      if (path === "/admin/quizzes") {
        return routeRecord(parts, { name: "quizzes", path: "/admin/quizzes", title: "测验", section: "Quizzes", params: {} });
      }
      let match = path.match(/^\/admin\/(?:quizzes|exams)\/([^/]+)$/);
      if (match) {
        return routeRecord(parts, {
          name: "quiz-detail",
          path,
          title: "测验详情",
          section: "Quizzes",
          params: { quizKey: decodeURIComponent(match[1]) },
          breadcrumb: { parentLabel: "测验", parentHref: "/admin/quizzes", fallbackLabel: "测验详情" },
        });
      }
      if (path === "/admin/candidates") {
        return routeRecord(parts, { name: "candidates", path, title: "候选人", section: "Candidates", params: {} });
      }
      match = path.match(/^\/admin\/candidates\/(\d+)$/);
      if (match) {
        return routeRecord(parts, {
          name: "candidate-detail",
          path,
          title: "候选人详情",
          section: "Candidates",
          params: { candidateId: Number(match[1]) },
          breadcrumb: { parentLabel: "候选人", parentHref: "/admin/candidates", fallbackLabel: "候选人详情" },
        });
      }
      if (path === "/admin/assignments") {
        return routeRecord(parts, { name: "assignments", path, title: "邀约与答题", section: "Assignments", params: {} });
      }
      match = path.match(/^\/admin\/(?:attempt|result)\/([^/]+)$/);
      if (match) {
        return routeRecord(parts, {
          name: "attempt-detail",
          path,
          title: "答题详情",
          section: "Assignments",
          params: { token: decodeURIComponent(match[1]) },
          breadcrumb: { parentLabel: "邀约与答题", parentHref: "/admin/assignments", fallbackLabel: "答题详情" },
        });
      }
      if (path === "/admin/logs") {
        return routeRecord(parts, { name: "logs", path, title: "系统日志", section: "Logs", params: {} });
      }
      if (path === "/admin/status") {
        return routeRecord(parts, { name: "status", path, title: "系统状态", section: "Status", params: {} });
      }
      if (path === "/admin/mcp") {
        return routeRecord(parts, { name: "mcp", path, title: "MCP", section: "MCP", params: {} });
      }
      return dashboardRouteRecord(parseAdminRouteLocation("/admin/dashboard"));
    },

    applyAdminRouteQueryState(route) {
      const query = route?.query || {};
      if (route?.name === "quizzes") {
        if (Object.prototype.hasOwnProperty.call(query, "q")) {
          this.filters.quizzes.q = String(query.q || "");
        }
        if (Object.prototype.hasOwnProperty.call(query, "public_invite")) {
          this.filters.quizzes.public_invite = this.normalizeQuizPublicInviteFilter
            ? this.normalizeQuizPublicInviteFilter(query.public_invite)
            : String(query.public_invite || "");
        }
      }
      if (route?.name === "candidates" && Object.prototype.hasOwnProperty.call(query, "q")) {
        this.filters.candidates.q = String(query.q || "");
      }
      if (route?.name === "assignments") {
        if (Object.prototype.hasOwnProperty.call(query, "q")) this.filters.assignments.q = String(query.q || "");
        if (Object.prototype.hasOwnProperty.call(query, "quiz_key")) this.filters.assignments.quiz_key = String(query.quiz_key || "");
        if (Object.prototype.hasOwnProperty.call(query, "start_from")) this.filters.assignments.start_from = String(query.start_from || "");
        if (Object.prototype.hasOwnProperty.call(query, "end_to")) this.filters.assignments.end_to = String(query.end_to || "");
        if (Object.prototype.hasOwnProperty.call(query, "status")) this.filters.assignments.status = normalizedAssignmentStatusFilter(query.status);
        if (Object.prototype.hasOwnProperty.call(query, "handling")) this.filters.assignments.handling = normalizedAssignmentHandlingFilter(query.handling);
        if (Object.prototype.hasOwnProperty.call(query, "source_kind")) this.filters.assignments.source_kind = normalizedAssignmentSourceFilter(query.source_kind);
      }
    },

    async applyAdminRouteAnchor(route) {
      const hash = String(route?.hash || "").trim();
      if (!hash || typeof document === "undefined") return;
      if (route.name === "quizzes" && ["quiz-sync","repo-binding"].includes(hash)) {
        await this.setAdminCompactTab("quizzes","repo", { scroll: true });
      }
      if (route.name === "status" && ["llm-config","sms-config","status-thresholds"].includes(hash)) {
        await this.setAdminCompactTab("status","config", { scroll: true });
      }
      await this.$nextTick();
      const target = document.getElementById(hash);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },

    async refreshSession() {
      const data = await this.api("/api/admin/session", { quiet: true });
      this.session = data || { authenticated: false, username: "" };
      return this.session;
    },

    async loadBootstrap() {
      await Promise.all([
        this.loadSystemBootstrap(),
        this.loadStatusSummary(),
        this.loadQuizzes({ quiet: true }),
        this.loadCandidates({ quiet: true }),
      ]);
    },

    async handleRoute(pathname, { replace = false } = {}) {
      if (!this.session.authenticated && pathname !== "/admin/login") {
        this.destroyLogsChart();
        this.stopSyncPolling();
        this.stopAssignmentsPolling();
        history.replaceState({}, "", "/admin/login");
        this.route = this.resolveRoute("/admin/login");
        await this.renderCurrentRoute();
        return;
      }

      let nextRoute = this.resolveRoute(pathname);
      if (this.session.authenticated && nextRoute.name === "login") {
        nextRoute = this.resolveRoute("/admin/dashboard");
        replace = true;
      }

      const previousRouteName = String(this.route?.name || "").trim();
      if (previousRouteName === "logs" && nextRoute.name !== "logs") {
        this.destroyLogsChart();
      }
      if (previousRouteName && previousRouteName !== nextRoute.name) {
        this.resetAdminCompactTab(previousRouteName);
      }

      this.applyAdminRouteQueryState(nextRoute);
      this.route = nextRoute;
      this.ensureAdminCompactTab(this.route.name);
      if (!replace) {
        history.pushState({}, "", this.route.href || this.route.path);
      } else {
        history.replaceState({}, "", this.route.href || this.route.path);
      }

      this.error = "";
      await this.renderCurrentRoute();
      await this.$nextTick();

      if (this.route.name !== "quizzes") {
        this.stopSyncPolling();
      }
      if (!["assignments", "attempt-detail"].includes(this.route.name)) {
        this.stopAssignmentsPolling();
      }
      if (this.route.name !== "candidates") {
        this.stopCandidateResumeUploadPolling();
      }
      if (this.route.name !== "candidate-detail") {
        this.stopCandidateResumeReparsePolling();
      }

      switch (this.route.name) {
        case "dashboard":
          await this.loadDashboard();
          break;
        case "quizzes":
          await this.loadQuizzes();
          break;
        case "quiz-detail":
          await this.loadQuizDetail(this.route.params.quizKey);
          break;
        case "candidates":
          this.resetCandidateResumeUploadState();
          await this.loadCandidates();
          break;
        case "candidate-detail":
          await this.loadCandidateDetail(this.route.params.candidateId);
          break;
        case "assignments":
          await this.loadAssignments({ page: this.route.query?.page || 1 });
          break;
        case "attempt-detail":
          await this.loadAttemptDetail(this.route.params.token);
          break;
        case "logs":
          await this.loadLogs();
          break;
        case "status":
          await this.loadStatus();
          break;
        case "mcp":
          await this.loadMcpPage();
          break;
        default:
          break;
      }
      await this.$nextTick();
      await this.applyAdminRouteAnchor(this.route);
      this.updateAdminCompactTabsStickyState();
    },

    async go(path) {
      await this.handleRoute(path);
    },
  };
}
