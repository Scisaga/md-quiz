function asItems(value) {
  return Array.isArray(value?.items) ? value.items : [];
}

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function percent(value, total) {
  const denominator = numeric(total);
  if (denominator <= 0) return"0%";
  return `${Math.round((numeric(value) / denominator) * 100)}%`;
}

export function createAdminDashboardModule() {
  return {
    async loadDashboard() {
      this.dashboard = {
        ...(this.dashboard || {}),
        loading: true,
        error:"",
      };
      try {
        const assignmentsQuery = new URLSearchParams({ page:"1" });
        const [assignmentsData] = await Promise.all([
          this.api(`/api/admin/assignments?${assignmentsQuery.toString()}`, { quiet: true }),
          this.loadStatusSummary(),
        ]);
        this.dashboard = {
          ...(this.dashboard || {}),
          assignments: assignmentsData || { items: [], total: 0, summary: {} },
          loading: false,
          error:"",
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        this.dashboard = {
          ...(this.dashboard || {}),
          loading: false,
          error: error.message ||"总览加载失败",
        };
      }
    },

    dashboardAssignmentItems() {
      return asItems(this.dashboard?.assignments).slice(0, 6);
    },

    dashboardAssignmentQuizTitle(item) {
      const title = String(item?.quiz_title ||"").trim();
      const key = String(item?.quiz_key ||"").trim();
      return title || key ||"未命名测验";
    },

    dashboardAssignmentQuizKey(item) {
      const key = String(item?.quiz_key ||"").trim();
      return key ||"-";
    },

    dashboardAssignmentInviteTime(item) {
      return this.formatDateTime(item?.created_at) ||"-";
    },

    dashboardAssignmentAnswerTime(item) {
      return this.formatDateTime(item?.finished_at || item?.entered_at) ||"-";
    },

    dashboardAssignmentTotal() {
      return numeric(this.dashboard?.assignments?.total || asItems(this.dashboard?.assignments).length);
    },

    dashboardFinishedAssignments() {
      return asItems(this.dashboard?.assignments).filter((item) => String(item?.status ||"").trim() ==="finished").length;
    },

    dashboardUnhandledAssignments() {
      return numeric(this.dashboard?.assignments?.summary?.unhandled_finished_count);
    },

    dashboardQuizCount() {
      return asItems(this.quizzes).length;
    },

    dashboardPublicInviteCount() {
      return asItems(this.quizzes).filter((item) => Boolean(item?.public_invite_enabled)).length;
    },

    dashboardCandidateCount() {
      return asItems(this.candidates).length;
    },

    dashboardCompletionRate() {
      return percent(this.dashboardFinishedAssignments(), this.dashboardAssignmentTotal());
    },

    dashboardKpiCards() {
      return [
        {
          label:"测验总数",
          value: this.formatNumber(this.dashboardQuizCount()),
          hint: `${this.formatNumber(this.dashboardPublicInviteCount())} 个公开邀约`,
          icon:"library_books",
          tone:"blue",
          target:"quizzes",
          actionLabel:"查看测验列表",
        },
        {
          label:"候选人",
          value: this.formatNumber(this.dashboardCandidateCount()),
          hint:"已入库候选人档案",
          icon:"group",
          tone:"emerald",
          target:"candidates",
          actionLabel:"查看候选人列表",
        },
        {
          label:"答题记录",
          value: this.formatNumber(this.dashboardAssignmentTotal()),
          hint: `完成率 ${this.dashboardCompletionRate()}`,
          icon:"assignment_turned_in",
          tone:"sky",
          target:"assignments",
          actionLabel:"查看邀约与答题列表",
        },
        {
          label:"待处理",
          value: this.formatNumber(this.dashboardUnhandledAssignments()),
          hint:"完成后待管理员跟进",
          icon:"priority_high",
          tone: this.dashboardUnhandledAssignments() ?"amber" :"emerald",
          target:"assignments-unhandled",
          actionLabel:"查看未处理答题记录",
        },
      ];
    },

    resetDashboardQuizFilters({ publicInvite = false } = {}) {
      this.filters.quizzes.q ="";
      this.filters.quizzes.public_invite = publicInvite ?"enabled" :"";
    },

    resetDashboardCandidateFilters() {
      this.filters.candidates.q ="";
    },

    resetDashboardAssignmentFilters() {
      this.filters.assignments.q ="";
      this.filters.assignments.quiz_key ="";
      this.filters.assignments.start_from ="";
      this.filters.assignments.end_to ="";
      this.filters.assignments.status ="";
      this.filters.assignments.handling ="";
      this.filters.assignments.source_kind ="";
    },

    async openDashboardKpi(card) {
      const target = String(card?.target ||"").trim();
      if (target ==="quizzes") {
        this.resetDashboardQuizFilters();
        await this.go("/admin/quizzes");
        return;
      }
      if (target ==="candidates") {
        this.resetDashboardCandidateFilters();
        await this.go("/admin/candidates");
        return;
      }
      if (target ==="assignments") {
        this.resetDashboardAssignmentFilters();
        await this.go("/admin/assignments?page=1&start_from=&end_to=");
        return;
      }
      if (target ==="assignments-unhandled") {
        this.resetDashboardAssignmentFilters();
        this.filters.assignments.status ="finished";
        this.filters.assignments.handling ="unhandled";
        await this.go("/admin/assignments?status=finished&handling=unhandled&start_from=&end_to=");
      }
    },

    async openDashboardPublicQuizzes() {
      this.resetDashboardQuizFilters({ publicInvite: true });
      await this.go("/admin/quizzes?public_invite=enabled");
    },

    async openDashboardSyncPanel() {
      this.resetDashboardQuizFilters();
      await this.go("/admin/quizzes#quiz-sync");
    },

    async openDashboardSystemService(key) {
      const target = String(key ||"").trim() ==="sms" ?"sms-config" :"llm-config";
      await this.go(`/admin/status#${target}`);
    },

    dashboardKpiToneClass(tone) {
      const tones = {
        blue:"border-blue-100 bg-blue-50/72 text-blue-700",
        emerald:"border-emerald-100 bg-emerald-50/72 text-emerald-700",
        sky:"border-sky-100 bg-sky-50/72 text-sky-700",
        amber:"border-amber-100 bg-amber-50/78 text-amber-700",
      };
      return tones[tone] || tones.blue;
    },

    dashboardSystemLevelLabel() {
      const level = String(this.statusSummary?.overall_level ||"ok").trim().toLowerCase();
      const labels = {
        ok:"系统正常",
        warn:"需要关注",
        warning:"需要关注",
        error:"存在异常",
        critical:"严重异常",
      };
      return labels[level] || level ||"系统正常";
    },

    dashboardSystemLevelClass() {
      const level = String(this.statusSummary?.overall_level ||"ok").trim().toLowerCase();
      if (["error","critical"].includes(level)) {
        return"border-rose-200 bg-rose-50 text-rose-700";
      }
      if (["warn","warning"].includes(level)) {
        return"border-amber-200 bg-amber-50 text-amber-700";
      }
      return"border-emerald-200 bg-emerald-50 text-emerald-700";
    },

    dashboardServiceRows() {
      return [
        { key:"llm", label:"LLM 服务", icon:"smart_toy" },
        { key:"sms", label:"短信服务", icon:"sms" },
      ].map((item) => {
        const module = this.statusSummary?.[item.key] || {};
        const configured = typeof module.configured ==="boolean" ? module.configured : true;
        return {
          ...item,
          configured,
          missingText: configured ?"" : this.statusModuleMissingText(item.key),
        };
      });
    },

    dashboardAssignmentStatusLabel(item) {
      const status = String(item?.status ||"").trim().toLowerCase();
      const labels = {
        invited:"已邀约",
        verified:"已验证",
        in_quiz:"答题中",
        grading:"判卷中",
        finished:"已完成",
        expired:"已过期",
      };
      return labels[status] || status ||"未知";
    },

    dashboardAssignmentStatusClass(item) {
      const status = String(item?.status ||"").trim().toLowerCase();
      if (status ==="finished") return"border-emerald-200 bg-emerald-50 text-emerald-700";
      if (status ==="grading") return"border-blue-200 bg-blue-50 text-blue-700";
      if (status ==="in_quiz") return"border-sky-200 bg-sky-50 text-sky-700";
      if (status ==="expired") return"border-rose-200 bg-rose-50 text-rose-700";
      return"border-slate-200 bg-slate-50 text-slate-600";
    },

    dashboardAssignmentSourceLabel(item) {
      return String(item?.source_kind ||"").trim() ==="public" ?"公开" :"定向";
    },

    dashboardAssignmentSourceIcon(item) {
      return String(item?.source_kind ||"").trim() ==="public" ?"language" :"badge";
    },

    dashboardAssignmentSourceClass(item) {
      return String(item?.source_kind ||"").trim() ==="public"
        ?"border-blue-200 bg-blue-50 text-blue-700"
        :"border-slate-200 bg-slate-50 text-slate-600";
    },

    dashboardSyncSummary() {
      const meta = this.syncStatusMeta ? this.syncStatusMeta() : { label:"未同步", icon:"sync" };
      return {
        ...meta,
        detail: this.syncTimelineText ? this.syncTimelineText() :"",
      };
    },
  };
}
