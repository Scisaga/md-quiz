const RESUME_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];
const BUSINESS_CARD_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];

export function createPublicResumeModule() {
  return {
    intakeState() {
      const intake = this.state.intake && typeof this.state.intake === "object" ? this.state.intake : {};
      if (Object.keys(intake).length > 0) return intake;
      return this.state.resume || {};
    },

    intakeMaterialMode() {
      return String(this.intakeState().material_mode || "resume").trim() || "resume";
    },

    isBusinessCardIntake() {
      return this.intakeMaterialMode() === "business_card";
    },

    isResumeIntake() {
      return !this.isBusinessCardIntake();
    },

    intakeMode() {
      return String(this.intakeState().mode || "upload_required").trim() || "upload_required";
    },

    resumeMode() {
      return this.intakeMode();
    },

    canUseExistingIntake() {
      return this.intakeMode() === "reuse_or_replace";
    },

    canUseExistingResume() {
      return this.canUseExistingIntake();
    },

    existingMaterial() {
      const state = this.intakeState();
      if (this.isBusinessCardIntake()) {
        return state.existing_business_card || state.existing_material || {};
      }
      return state.existing_resume || state.existing_material || {};
    },

    existingResume() {
      return this.existingMaterial();
    },

    existingMaterialFilename() {
      const fallback = this.isBusinessCardIntake() ? "未命名名片" : "未命名简历";
      return String(this.existingMaterial().filename || "").trim() || fallback;
    },

    existingResumeFilename() {
      return this.existingMaterialFilename();
    },

    formatResumeSize(size) {
      const value = Number(size || 0);
      if (!Number.isFinite(value) || value <= 0) return "未记录";
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    },

    existingMaterialSizeText() {
      return this.formatResumeSize(this.existingMaterial().size);
    },

    existingResumeSizeText() {
      return this.existingMaterialSizeText();
    },

    existingMaterialTimeText() {
      const material = this.existingMaterial();
      const raw = String(material.uploaded_at || material.parsed_at || "").trim();
      if (!raw) return "未记录";
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return raw;
      return parsed.toLocaleString("zh-CN", { hour12: false });
    },

    existingResumeParsedAtText() {
      return this.existingMaterialTimeText();
    },

    intakeEyebrow() {
      return this.isBusinessCardIntake() ? "公开邀约名片采集" : "公开邀约建档";
    },

    intakeTitle() {
      if (this.canUseExistingIntake()) {
        return this.isBusinessCardIntake() ? "检测到该手机号已有名片" : "检测到该手机号已有候选人档案";
      }
      return this.isBusinessCardIntake() ? "上传名片后进入答题" : "上传简历后进入答题";
    },

    intakeIntroText() {
      if (this.canUseExistingIntake()) {
        return this.isBusinessCardIntake()
          ? "该手机号下已有名片，可直接复用继续答题，也可以上传最新名片后再进入测验。"
          : "该手机号下已有简历，可直接复用继续答题，也可以上传最新版简历后再进入测验。";
      }
      return this.isBusinessCardIntake()
        ? "请拍照或上传名片图片，上传成功后会进入答题准备。"
        : "简历上传成功后会立即开始答题准备，结构化解析会在后台异步完成，不再阻塞进入测验。";
    },

    existingMaterialTitle() {
      return this.isBusinessCardIntake() ? "使用已有名片" : "使用已有简历";
    },

    existingMaterialHint() {
      return this.isBusinessCardIntake()
        ? "确认后直接进入答题准备，不需要再次上传相同名片。"
        : "确认后直接进入答题准备，不需要再次上传相同简历。";
    },

    existingMaterialBadgeText() {
      return this.isBusinessCardIntake() ? "已检测到历史名片" : "已检测到历史简历";
    },

    existingMaterialTimeLabel() {
      return this.isBusinessCardIntake() ? "最近上传" : "最近解析";
    },

    useExistingButtonText() {
      if (this.actionBusy) return "处理中...";
      return this.isBusinessCardIntake() ? "使用已有名片继续答题" : "使用已有简历继续答题";
    },

    uploadTitle() {
      if (this.isBusinessCardIntake()) {
        return this.canUseExistingIntake() ? "上传最新名片" : "上传名片照片";
      }
      return this.canUseExistingIntake() ? "上传最新版简历" : "上传简历文件";
    },

    uploadHintText() {
      if (this.isBusinessCardIntake()) {
        return this.canUseExistingIntake()
          ? "支持图片格式。上传后会用最新版覆盖当前候选人档案中的名片，再继续答题。"
          : "支持图片格式。手机端可直接拍照上传。";
      }
      return this.canUseExistingIntake()
        ? "支持 PDF、图片格式。上传后会用最新版覆盖当前候选人档案中的简历，再继续答题。"
        : "支持 PDF、图片格式。上传完成后会直接跳入首卡，解析结果稍后回填。";
    },

    uploadButtonText() {
      if (this.actionBusy) return "处理中...";
      if (this.isBusinessCardIntake()) {
        return this.canUseExistingIntake() ? "上传最新名片并继续答题" : "上传名片并进入答题准备";
      }
      return this.canUseExistingIntake() ? "上传最新版并继续答题" : "上传并进入答题准备";
    },

    intakeFileAccept() {
      return this.isBusinessCardIntake() ? "image/*" : ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
    },

    isSupportedIntakeFile(file) {
      const name = String(file?.name || "").trim().toLowerCase();
      if (!name) return false;
      const exts = this.isBusinessCardIntake() ? BUSINESS_CARD_EXTS : RESUME_EXTS;
      return exts.some((ext) => name.endsWith(ext));
    },

    isSupportedResumeFile(file) {
      return this.isSupportedIntakeFile(file);
    },

    unsupportedFileMessage() {
      return this.isBusinessCardIntake() ? "仅支持上传图片格式名片" : "仅支持上传 PDF 或图片格式的简历";
    },

    missingFileMessage() {
      return this.isBusinessCardIntake() ? "请先选择或拍摄名片图片" : "请先选择简历文件";
    },

    async useExistingIntake() {
      if (!this.canUseExistingIntake() || this.actionBusy) return;
      this.actionBusy = true;
      try {
        const result = await this.api("/api/public/intake/use-existing", {
          method: "POST",
          body: JSON.stringify({ token: this.route.token }),
          headers: { "Content-Type": "application/json" },
        });
        history.replaceState({}, "", result.redirect);
        await this.syncRoute(result.redirect);
      } finally {
        this.actionBusy = false;
      }
    },

    async useExistingResume() {
      await this.useExistingIntake();
    },

    async uploadIntake() {
      if (this.actionBusy) return;
      const file = this.$refs.intakeFile?.files?.[0] || this.$refs.resumeFile?.files?.[0];
      if (!file) {
        this.error = this.missingFileMessage();
        return;
      }
      if (!this.isSupportedIntakeFile(file)) {
        this.error = this.unsupportedFileMessage();
        return;
      }
      this.actionBusy = true;
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await this.api(`/api/public/intake/upload?token=${encodeURIComponent(this.route.token)}`, {
          method: "POST",
          body: form,
        });
        history.replaceState({}, "", result.redirect);
        await this.syncRoute(result.redirect);
      } finally {
        this.actionBusy = false;
      }
    },

    async uploadResume() {
      await this.uploadIntake();
    },
  };
}
