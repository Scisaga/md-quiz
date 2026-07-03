import { TRAIT_COLOR_PALETTE } from "../constants.js";

const SYNC_REDACTED_VALUE = "***";

function asPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function numericMetric(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.floor(number));
}

function redactUrlCredentials(text) {
  return String(text || "")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+(?::[^/\s@]*)?@)/gi, `$1${SYNC_REDACTED_VALUE}@`)
    .replace(
      /([?&](?:token|access_token|private_token|auth_token|password|passwd|secret|key)=)[^&#\s]+/gi,
      `$1${SYNC_REDACTED_VALUE}`,
    );
}

function redactSyncDebugValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSyncDebugValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSyncDebugValue(item)]));
  }
  if (typeof value === "string") {
    return redactUrlCredentials(value);
  }
  return value;
}

export function createAdminQuizzesModule() {
  return {
    quizQuestions() {
      const questions = this.quizDetail?.selected_quiz_version?.spec?.questions;
      return Array.isArray(questions) ? questions : [];
    },

    questionTypeLabel(value) {
      const labels = {
        single: "单选",
        multiple: "多选",
        short: "简答",
        unknown: "其他",
      };
      const key = String(value || "").trim().toLowerCase();
      return labels[key] || String(value || "其他");
    },

    quizQuestionScoringMode(question) {
      return String(question?.scoring_mode || question?.scoring || "").trim().toLowerCase();
    },

    quizQuestionIsCompletion(question) {
      return this.quizQuestionScoringMode(question) === "completion";
    },

    quizOptionRowClass(question, option) {
      if (this.quizQuestionIsCompletion(question)) {
        return "bg-slate-50/80";
      }
      return option?.correct ? "bg-emerald-50/70" : "bg-slate-50/80";
    },

    publicInviteMaterialOptions() {
      return [
        { value: "none", label: "无需资料" },
        { value: "resume", label: "要求简历" },
        { value: "business_card", label: "要求名片" },
      ];
    },

    normalizePublicInviteMaterialMode(value) {
      const mode = String(value || "").trim();
      return ["none", "resume", "business_card"].includes(mode) ? mode : "resume";
    },

    publicInviteMaterialMode() {
      return this.normalizePublicInviteMaterialMode(this.quizDetail.quiz?.public_invite_material_mode);
    },

    publicInviteMaterialLabel(value = this.publicInviteMaterialMode()) {
      return this.publicInviteMaterialOptions().find((item) => item.value === value)?.label || "要求简历";
    },

    publicInviteMaterialButtonClass(value) {
      const active = this.publicInviteMaterialMode() === value;
      return active
        ? "border-emerald-300/80 bg-white/95 text-emerald-700 shadow-[0_6px_16px_rgba(22,163,74,0.12)]"
        : "border-transparent text-slate-700 hover:border-blue-200/80 hover:bg-white/65 hover:text-slate-900";
    },

    publicInviteIgnoreTiming() {
      return Boolean(this.quizDetail.quiz?.public_invite_ignore_timing);
    },

    publicInviteIgnoreTimingButtonClass() {
      return this.publicInviteIgnoreTiming()
        ? "border-amber-300/85 bg-amber-50/85 text-amber-800 shadow-[0_6px_16px_rgba(217,119,6,0.10)]"
        : "border-blue-300/70 bg-white/35 text-slate-700 hover:bg-white/70 hover:text-slate-900";
    },

    applyPublicInviteResult(result) {
      this.quizDetail.quiz.public_invite_enabled = result.enabled;
      this.quizDetail.quiz.public_invite_token = result.token || "";
      this.quizDetail.quiz.public_invite_material_mode = this.normalizePublicInviteMaterialMode(result.material_mode);
      this.quizDetail.quiz.public_invite_ignore_timing = Boolean(result.ignore_timing);
      this.quizDetail.quiz.public_invite_url = result.public_url;
      this.quizDetail.quiz.public_invite_qr_url = result.qr_url || "";
    },

    formatDateTime(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) {
        return text;
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hour = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      const second = String(date.getSeconds()).padStart(2, "0");
      return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    },

    formatDate(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) {
        return text;
      }
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    },

    traitPalette(index) {
      return TRAIT_COLOR_PALETTE[Math.abs(Number(index || 0)) % TRAIT_COLOR_PALETTE.length];
    },

    traitDimensions() {
      const names = [];
      const seen = new Set();
      const usedNames = [];
      const usedSet = new Set();
      const pushUsedName = (value) => {
        const name = String(value || "").trim();
        if (!name || usedSet.has(name)) return;
        usedSet.add(name);
        usedNames.push(name);
      };
      for (const question of this.quizQuestions()) {
        for (const option of question?.options || []) {
          for (const traitName of Object.keys(option?.traits || {})) {
            pushUsedName(traitName);
          }
        }
      }
      if (!usedNames.length) {
        return [];
      }
      const pushName = (value) => {
        const name = String(value || "").trim();
        if (!name || seen.has(name) || !usedSet.has(name)) return;
        seen.add(name);
        names.push(name);
      };
      const configured = this.quizDetail?.selected_quiz_version?.trait?.dimensions || this.quizDetail?.quiz?.trait?.dimensions;
      if (Array.isArray(configured)) {
        configured.forEach(pushName);
      }
      usedNames.forEach(pushName);
      return names.map((name, index) => ({
        name,
        ...this.traitPalette(index),
      }));
    },

    traitMeta(name) {
      const current = String(name || "").trim();
      if (!current) {
        return this.traitPalette(0);
      }
      const found = this.traitDimensions().find((item) => item.name === current);
      if (found) {
        return found;
      }
      const hash = Array.from(current).reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0);
      return {
        name: current,
        ...this.traitPalette(hash),
      };
    },

    traitBadgeStyle(name) {
      const meta = this.traitMeta(name);
      return {
        borderColor: meta.border,
        backgroundColor: meta.background,
        color: meta.text,
      };
    },

    traitDotStyle(name) {
      const meta = this.traitMeta(name);
      return { backgroundColor: meta.accent };
    },

    optionTraits(option) {
      const traits = option?.traits;
      if (!traits || typeof traits !== "object") {
        return [];
      }
      return Object.entries(traits)
        .filter(([name]) => String(name || "").trim())
        .map(([name, score]) => {
          const value = Number(score || 0);
          const text = Number.isFinite(value) && value > 0 ? `+${value}` : String(score ?? "");
          return {
            name: String(name || "").trim(),
            scoreText: text,
          };
        });
    },

    syncLastResult() {
      return asPlainObject(this.syncState?.last_result);
    },

    syncStatusMeta() {
      const status = this.syncStatus();
      const metas = {
        queued: {
          label: "排队中",
          icon: "schedule",
          badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        },
        pending: {
          label: "排队中",
          icon: "schedule",
          badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        },
        running: {
          label: "同步中",
          icon: "progress_activity",
          badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
        },
        done: {
          label: "同步成功",
          icon: "check_circle",
          badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        },
        failed: {
          label: "同步失败",
          icon: "error",
          badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        },
        idle: {
          label: "未同步",
          icon: "radio_button_unchecked",
          badgeClass: "border-slate-200 bg-white text-slate-600",
        },
      };
      return metas[status] || {
        label: status ? `未知状态：${status}` : "未同步",
        icon: "help",
        badgeClass: "border-slate-200 bg-white text-slate-600",
      };
    },

    syncSummaryMetrics() {
      const result = this.syncLastResult();
      const errors = Math.max(numericMetric(result.error_count), this.syncErrorMessages().length);
      const metrics = [
        { label: "扫描", value: numericMetric(result.scanned_md) },
        { label: "新增", value: numericMetric(result.created_versions) },
        { label: "更新", value: numericMetric(result.updated_versions) },
        { label: "未变化", value: numericMetric(result.unchanged_versions) },
        { label: "错误", value: errors },
      ];
      const deleted = numericMetric(result.deleted_exams);
      if (deleted > 0) {
        metrics.push({ label: "删除", value: deleted });
      }
      return metrics;
    },

    syncTimelineText() {
      const status = this.syncStatus();
      const result = this.syncLastResult();
      const queuedAt = String(this.syncState?.queued_at || "").trim();
      const startedAt = String(this.syncState?.started_at || result.started_at || "").trim();
      const finishedAt = String(this.syncState?.finished_at || result.finished_at || "").trim();
      if (["queued", "pending"].includes(status) && queuedAt) {
        return `排队于 ${this.formatDateTime(queuedAt)}`;
      }
      if (status === "running") {
        if (startedAt) return `开始于 ${this.formatDateTime(startedAt)}`;
        if (queuedAt) return `排队于 ${this.formatDateTime(queuedAt)}`;
      }
      if (status === "failed") {
        const value = finishedAt || startedAt || queuedAt;
        return value ? `失败于 ${this.formatDateTime(value)}` : "";
      }
      if (status === "done" && finishedAt) {
        return `完成于 ${this.formatDateTime(finishedAt)}`;
      }
      if (finishedAt) return `完成于 ${this.formatDateTime(finishedAt)}`;
      if (startedAt) return `开始于 ${this.formatDateTime(startedAt)}`;
      if (queuedAt) return `排队于 ${this.formatDateTime(queuedAt)}`;
      return "";
    },

    syncDurationText() {
      const result = this.syncLastResult();
      const startedAt = String(this.syncState?.started_at || result.started_at || "").trim();
      const finishedAt = String(this.syncState?.finished_at || result.finished_at || "").trim();
      if (!startedAt || !finishedAt) return "";
      const started = new Date(startedAt).getTime();
      const finished = new Date(finishedAt).getTime();
      if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return "";
      const seconds = Math.max(0, (finished - started) / 1000);
      if (seconds < 1) return "< 1 秒";
      if (seconds < 60) {
        const precision = seconds < 10 ? 1 : 0;
        return `${seconds.toFixed(precision)} 秒`;
      }
      const minutes = Math.floor(seconds / 60);
      const restSeconds = Math.round(seconds % 60);
      if (minutes < 60) {
        return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
      }
      const hours = Math.floor(minutes / 60);
      const restMinutes = minutes % 60;
      return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
    },

    syncShortCommit() {
      const result = this.syncLastResult();
      const commit = String(this.syncState?.last_commit || result.git_commit || "").trim();
      return commit ? commit.slice(0, 7) : "";
    },

    syncErrorMessages() {
      const result = this.syncLastResult();
      const messages = [];
      const pushMessage = (value) => {
        let text = "";
        if (typeof value === "string") {
          text = value;
        } else if (value && typeof value === "object") {
          text = String(value.message || value.error || value.detail || JSON.stringify(value));
        } else {
          text = String(value || "");
        }
        text = redactUrlCredentials(text.trim());
        if (text && !messages.includes(text)) {
          messages.push(text);
        }
      };
      pushMessage(this.syncState?.last_error);
      if (Array.isArray(result.errors)) {
        result.errors.forEach(pushMessage);
      }
      return messages.slice(0, 3);
    },

    syncDebugState() {
      return redactSyncDebugValue(asPlainObject(this.syncState));
    },

    async loadQuizzes({ quiet = false, source = "manual", previousSyncStatus = "", previousSyncJobId = "" } = {}) {
      const query = new URLSearchParams();
      if (this.filters.quizzes.q) query.set("q", this.filters.quizzes.q);
      const data = await this.api(`/api/admin/quizzes?${query.toString()}`, { quiet });
      if (!data) return;
      this.quizzes = data;
      this.repoBinding = data.repo_binding || {};
      this.syncState = data.sync_state || {};
      if (!this.hasRepoBinding() && this.syncState.repo_url && (this.isSyncBusy() || !this.syncForm.repoUrl)) {
        this.syncForm.repoUrl = this.syncState.repo_url;
      }
      if (this.hasRepoBinding()) {
        this.syncForm.repoUrl = "";
      } else {
        this.resetRebindForm();
      }
      const currentSyncStatus = this.syncStatus();
      if (this.route.name === "quizzes" && this.isSyncBusy()) {
        this.scheduleSyncPolling();
      } else {
        this.stopSyncPolling();
      }
      if (
        source === "sync-poll" &&
        ["queued", "running"].includes(String(previousSyncStatus || "").trim().toLowerCase()) &&
        !["queued", "running"].includes(currentSyncStatus)
      ) {
        const finishedJobId = String(this.syncState?.last_job_id || "").trim();
        if (!previousSyncJobId || previousSyncJobId === finishedJobId) {
          this.showNotice(currentSyncStatus === "done" ? "测验同步完成，列表已刷新" : "测验同步失败");
        }
      }
    },

    async bindRepo() {
      if (this.isSyncBusy() || this.hasRepoBinding()) return;
      const result = await this.api("/api/admin/quizzes/binding", {
        method: "POST",
        body: JSON.stringify({ repo_url: this.syncForm.repoUrl || "" }),
        headers: { "Content-Type": "application/json" },
      });
      this.repoBinding = result.binding || {};
      this.syncForm.repoUrl = "";
      if (result.sync?.error) {
        this.showNotice("仓库已绑定，但自动同步投递失败");
      } else {
        this.showNotice("仓库已绑定，已开始同步");
      }
      await this.loadQuizzes({ quiet: true });
    },

    async syncQuizzes() {
      if (this.isSyncBusy() || !this.hasRepoBinding()) return;
      const result = await this.api("/api/admin/quizzes/sync", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      this.showNotice(result.created ? "测验同步任务已创建" : "已复用正在运行的同步任务");
      await this.loadQuizzes({ quiet: true });
    },

    async confirmRebind() {
      if (this.isSyncBusy() || !this.hasRepoBinding()) return;
      const result = await this.api("/api/admin/quizzes/binding/rebind", {
        method: "POST",
        body: JSON.stringify({
          repo_url: this.rebindForm.repoUrl || "",
          confirmation_text: this.rebindForm.confirmationText || "",
        }),
        headers: { "Content-Type": "application/json" },
      });
      this.quizzes = { items: [], page: 1, per_page: 20, total: 0, total_pages: 1 };
      this.quizDetail = { quiz: {}, selected_quiz_version: {}, quiz_version_history: [], stats: {} };
      this.repoBinding = result.binding || {};
      this.resetRebindForm();
      if (result.sync?.error) {
        this.showNotice("仓库已重新绑定，现有测验数据已清空，但自动同步投递失败");
      } else {
        this.showNotice("仓库已重新绑定，现有测验数据已清空并开始同步");
      }
      await this.loadQuizzes({ quiet: true });
    },

    async loadQuizDetail(quizKey) {
      this.quizDetail = await this.api(`/api/admin/quizzes/${encodeURIComponent(quizKey)}`);
      await this.$nextTick();
      this.queueMathTypeset();
    },

    async loadQuizVersion(versionId) {
      this.quizDetail = await this.api(`/api/admin/quiz-versions/${versionId}`);
      if (this.route.name === "quiz-detail" && this.isAdminCompactLayout) {
        await this.setAdminCompactTab("quiz-detail", "content", { scroll: true });
      }
      await this.$nextTick();
      this.queueMathTypeset();
    },

    async togglePublicInvite() {
      const enabled = !Boolean(this.quizDetail.quiz?.public_invite_enabled);
      const result = await this.api(`/api/admin/quizzes/${encodeURIComponent(this.quizDetail.quiz.quiz_key)}/public-invite`, {
        method: "POST",
        body: JSON.stringify({
          enabled,
          material_mode: this.publicInviteMaterialMode(),
          ignore_timing: this.publicInviteIgnoreTiming(),
        }),
        headers: { "Content-Type": "application/json" },
      });
      this.applyPublicInviteResult(result);
      this.showNotice(result.enabled ? "公开邀约已开启" : "公开邀约已关闭");
    },

    async setPublicInviteMaterialMode(mode) {
      const materialMode = this.normalizePublicInviteMaterialMode(mode);
      if (materialMode === this.publicInviteMaterialMode()) return;
      const result = await this.api(`/api/admin/quizzes/${encodeURIComponent(this.quizDetail.quiz.quiz_key)}/public-invite`, {
        method: "POST",
        body: JSON.stringify({
          enabled: Boolean(this.quizDetail.quiz?.public_invite_enabled),
          material_mode: materialMode,
          ignore_timing: this.publicInviteIgnoreTiming(),
        }),
        headers: { "Content-Type": "application/json" },
      });
      this.applyPublicInviteResult(result);
      this.showNotice(`资料采集已切换为：${this.publicInviteMaterialLabel(materialMode)}`);
    },

    async setPublicInviteIgnoreTiming(enabled) {
      const ignoreTiming = Boolean(enabled);
      if (ignoreTiming === this.publicInviteIgnoreTiming()) return;
      const result = await this.api(`/api/admin/quizzes/${encodeURIComponent(this.quizDetail.quiz.quiz_key)}/public-invite`, {
        method: "POST",
        body: JSON.stringify({
          enabled: Boolean(this.quizDetail.quiz?.public_invite_enabled),
          material_mode: this.publicInviteMaterialMode(),
          ignore_timing: ignoreTiming,
        }),
        headers: { "Content-Type": "application/json" },
      });
      this.applyPublicInviteResult(result);
      this.showNotice(ignoreTiming ? "公开邀约已忽略计时" : "公开邀约已恢复按题计时");
    },

  };
}
