from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _method_source(source: str, name: str) -> str:
    pattern = re.compile(rf"\n    (?:async\s+)?{re.escape(name)}\([^)]*\) \{{(?P<body>.*?)\n    \}},", re.S)
    match = pattern.search(source)
    assert match, f"method not found: {name}"
    return match.group("body")


def _fragments_from_mapping(source: str, prefix: str) -> list[str]:
    pattern = re.compile(rf'"/static/{re.escape(prefix)}/([^"\n]+\.html)"')
    return pattern.findall(source)


def test_admin_route_fragments_exist() -> None:
    source = (ROOT / "static" / "admin" / "modules" / "router.js").read_text(encoding="utf-8")
    names = _fragments_from_mapping(source, "admin/pages")

    assert names
    for name in names:
        assert (ROOT / "static" / "admin" / "pages" / name).exists(), name


def test_public_view_fragments_exist() -> None:
    source = (ROOT / "static" / "public" / "modules" / "view-loader.js").read_text(encoding="utf-8")
    names = _fragments_from_mapping(source, "public/views")

    assert names
    assert "intake.html" in names
    for name in names:
        assert (ROOT / "static" / "public" / "views" / name).exists(), name


def test_css_build_script_produces_bundles() -> None:
    subprocess.run(
        ["node", "static/scripts/build-admin-css.cjs"],
        cwd=ROOT,
        check=True,
    )

    assert (ROOT / "static" / "admin.css").exists()
    assert (ROOT / "static" / "public.css").exists()


def test_admin_shell_assets_are_cache_busted_together() -> None:
    admin_index = (ROOT / "static" / "admin" / "index.html").read_text(encoding="utf-8")
    admin_app = (ROOT / "static" / "admin" / "app.js").read_text(encoding="utf-8")

    version = "20260707-hermes-logo-crop"
    assert f'href="/static/admin.css?v={version}"' in admin_index
    assert f'src="/static/admin/app.js?v={version}"' in admin_index
    assert f'./modules/pages/assignments.js?v={version}' in admin_app


def test_admin_topbar_user_menu_owns_logout_action() -> None:
    index_source = (ROOT / "static" / "admin" / "index.html").read_text(encoding="utf-8")
    state_source = (ROOT / "static" / "admin" / "modules" / "state.js").read_text(encoding="utf-8")
    shell_source = (ROOT / "static" / "admin" / "modules" / "shell.js").read_text(encoding="utf-8")
    router_source = (ROOT / "static" / "admin" / "modules" / "router.js").read_text(encoding="utf-8")
    shell_css_source = (ROOT / "static" / "assets" / "css" / "admin" / "shell.css").read_text(encoding="utf-8")
    responsive_css_source = (ROOT / "static" / "assets" / "css" / "admin" / "responsive.css").read_text(encoding="utf-8")

    assert 'class="admin-r-user-menu"' in index_source
    assert '@click.outside="closeUserMenu"' in index_source
    assert '@keydown.escape.window="closeUserMenu"' in index_source
    assert 'aria-haspopup="menu"' in index_source
    assert ':aria-expanded="userMenuOpen ? \'true\' : \'false\'"' in index_source
    assert 'role="menu"' in index_source
    assert 'role="menuitem"' in index_source
    assert "个人中心" in index_source
    assert index_source.count("退出登录") == 1
    assert "admin-r-sidebar-tools" not in index_source
    assert "admin-r-mobile-logout" not in index_source

    assert "userMenuOpen: false" in state_source
    assert "toggleUserMenu()" in shell_source
    assert "closeUserMenu()" in shell_source
    assert "this.closeUserMenu();" in _method_source(shell_source, "logout")
    assert 'if (typeof this.closeUserMenu === "function")' in router_source

    assert ".admin-r-user-menu__button" in shell_css_source
    assert ".admin-r-user-menu__panel" in shell_css_source
    assert "admin-r-sidebar-tool" not in shell_css_source
    assert "admin-r-mobile-logout" not in shell_css_source
    assert "admin-r-user-menu__panel" in responsive_css_source
    assert "admin-r-mobile-logout" not in responsive_css_source


def test_admin_topbar_uses_breadcrumbs_for_detail_routes() -> None:
    index_source = (ROOT / "static" / "admin" / "index.html").read_text(encoding="utf-8")
    router_source = (ROOT / "static" / "admin" / "modules" / "router.js").read_text(encoding="utf-8")
    shell_source = (ROOT / "static" / "admin" / "modules" / "shell.js").read_text(encoding="utf-8")
    shell_css_source = (ROOT / "static" / "assets" / "css" / "admin" / "shell.css").read_text(encoding="utf-8")

    assert 'aria-label="面包屑"' in index_source
    assert 'x-show="routeBreadcrumbItems().length"' in index_source
    assert 'x-show="!routeBreadcrumbItems().length"' in index_source
    assert '@click="go(item.href)"' in index_source
    assert 'aria-current="page"' in index_source

    assert 'breadcrumb: { parentLabel: "测验", parentHref: "/admin/quizzes", fallbackLabel: "测验详情" }' in router_source
    assert 'breadcrumb: { parentLabel: "候选人", parentHref: "/admin/candidates", fallbackLabel: "候选人详情" }' in router_source
    assert 'breadcrumb: { parentLabel: "邀约与答题", parentHref: "/admin/assignments", fallbackLabel: "答题详情" }' in router_source

    assert "routeBreadcrumbItems()" in shell_source
    assert "candidateBreadcrumbLabel()" in shell_source
    assert "candidateId !== routeCandidateId" in shell_source
    assert "quizKey !== routeQuizKey" in shell_source
    assert "detailToken !== routeToken" in shell_source
    assert re.search(
        r"\.admin-r-breadcrumb__current\s*\{[^}]*font-size: 20px;[^}]*font-weight: 400;",
        shell_css_source,
        re.S,
    )


def test_admin_candidates_page_uses_resume_job_polling() -> None:
    source = (ROOT / "static" / "admin" / "modules" / "pages" / "candidates.js").read_text(encoding="utf-8")

    assert "/api/admin/candidates/resume/upload-job" in source
    assert "/resume/reparse-job" in source
    assert "/api/admin/jobs/" in source
    assert "scheduleCandidateResumeUploadPolling" in source
    assert "scheduleCandidateResumeReparsePolling" in source


def test_admin_candidate_detail_previews_image_materials() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "candidate-detail.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "candidates.js").read_text(encoding="utf-8")
    state_source = (ROOT / "static" / "admin" / "modules" / "state.js").read_text(encoding="utf-8")
    css_source = (ROOT / "static" / "assets" / "css" / "admin" / "components.css").read_text(encoding="utf-8")

    assert 'role="tablist" aria-label="候选人资料文件"' in page_source
    assert "candidateMaterialTab === 'resume'" in page_source
    assert "candidateMaterialTab === 'business_card'" in page_source
    assert "admin-r-workspace admin-r-workspace--wide" in page_source
    assert "admin-r-surface" in page_source
    assert "admin-right-pane--stack" not in page_source
    assert "admin-surface admin-right-pane rounded-3xl" not in page_source
    assert '<div class="admin-right-pane__body">' not in page_source
    assert "mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90" not in page_source
    assert "grid divide-slate-200 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x" not in page_source
    assert "xl:border-t-0 xl:border-l" not in page_source
    assert "当前简历预览" in page_source
    assert "当前名片预览" in page_source
    assert "candidateResumePreviewUrl()" in page_source
    assert "candidateBusinessCardPreviewUrl()" in page_source
    assert "openCandidateMaterialPreview(candidateResumePreviewUrl(), '当前简历预览')" in page_source
    assert "openCandidateMaterialPreview(candidateBusinessCardPreviewUrl(), '当前名片预览')" in page_source
    assert "candidateMaterialPreview.open" in page_source
    assert "candidateMaterialPreview.url" in page_source
    assert "closeCandidateMaterialPreview" in page_source
    assert "candidateResumeUrl()" in module_source
    assert "candidateBusinessCardUrl()" in module_source
    assert "candidateResumePreviewUrl()" in module_source
    assert "candidateBusinessCardPreviewUrl()" in module_source
    assert "openCandidateMaterialPreview" in module_source
    assert "closeCandidateMaterialPreview" in module_source
    assert "candidateFileIsImage" in module_source
    assert 'candidateMaterialTab: "resume"' in state_source
    assert 'candidateMaterialPreview: { open: false, url: "", title: "" }' in state_source
    assert "scrollbar-gutter: stable" not in css_source
    assert "padding-right: 0.35rem" not in css_source
    assert "margin-right: -0.35rem" not in css_source


def test_admin_candidates_list_shows_attempt_stats_and_latest_attempt_link() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "candidates.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "candidates.js").read_text(encoding="utf-8")
    api_source = (ROOT / "backend" / "md_quiz" / "api" / "admin_candidate_routes.py").read_text(encoding="utf-8")
    db_source = (ROOT / "backend" / "md_quiz" / "storage" / "db.py").read_text(encoding="utf-8")

    assert "<span>候选人</span>" in page_source
    assert "<span>统计</span>" in page_source
    assert "<span>最近答题</span>" in page_source
    assert "admin-r-responsive-list admin-r-responsive-list--candidates" in page_source
    assert "Number(candidates.total ?? (candidates.items || []).length)" in page_source
    assert "xl:grid-cols-[minmax(12rem,1fr)_8rem_minmax(15rem,1.25fr)_7rem_11rem_2rem]" not in page_source
    assert "admin-r-responsive-list__label" not in page_source
    assert "admin-r-responsive-list__pill-link" in page_source
    assert 'class="admin-r-row-meta admin-r-code" x-text="item.phone"' not in page_source
    assert 'class="text-[13px] font-normal leading-5 tracking-normal text-slate-500" x-text="item.phone"' in page_source
    assert '<span class="text-blue-600">\n                  <span>答题</span>' in page_source
    assert '<span class="mx-1.5 text-slate-300">/</span>' in page_source
    assert '<span class="admin-r-pill">\n                  <span>邀约</span>' not in page_source
    assert '<span class="admin-r-pill admin-r-pill--info">\n                  <span>答题</span>' not in page_source
    assert 'x-text="Number(item.invite_count || 0)"' in page_source
    assert 'x-text="Number(item.attempt_count || 0)"' in page_source
    assert 'x-text="candidateLatestAttemptLabel(item)"' in page_source
    assert 'x-text="candidateLatestAttemptMeta(item)"' in page_source
    assert '@click.stop="openCandidateLatestAttempt(item)"' in page_source
    assert "@keydown.enter.stop" in page_source
    assert "@keydown.space.stop" in page_source
    assert "暂无答题" in page_source
    assert 'role="button"' in page_source
    assert 'go(\'/admin/candidates/\' + item.id)' in page_source

    assert "candidateLatestAttempt(item)" in module_source
    assert "candidateLatestAttemptLabel(item)" in module_source
    assert "candidateLatestAttemptMeta(item)" in module_source
    assert "openCandidateLatestAttempt(item)" in module_source
    assert "/admin/attempt/${encodeURIComponent(token)}" in module_source

    assert '"invite_count": int(item.get("invite_count") or 0)' in api_source
    assert '"attempt_count": int(item.get("attempt_count") or 0)' in api_source
    assert '"latest_attempt": _serialize_candidate_latest_attempt(item)' in api_source
    assert "COUNT(*)::int AS invite_count" in db_source
    assert "COUNT(*) FILTER" in db_source
    assert "latest_attempt.token AS latest_attempt_token" in db_source


def test_admin_pages_use_rebuilt_admin_r_surfaces() -> None:
    legacy_markers = [
        "admin-v2",
        "admin-v3",
        "admin-v4",
        "admin-surface",
        "admin-right-pane",
        "admin-mobile-pane-grid",
        "quiz-v2",
        "quiz-v3",
        "quiz-detail-v3",
        "assignment-card",
        "rounded-3xl",
    ]

    for path in (ROOT / "static" / "admin" / "pages").glob("*.html"):
        source = path.read_text(encoding="utf-8")
        for marker in legacy_markers:
            assert marker not in source, f"{path.name} still uses {marker}"

    index_source = (ROOT / "static" / "admin" / "index.html").read_text(encoding="utf-8")
    for marker in legacy_markers:
        assert marker not in index_source, f"index.html still uses {marker}"
    assert "admin-r-shell" in index_source
    assert "admin-r-sidebar" in index_source


def test_admin_dashboard_recent_assignments_show_required_metadata() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "dashboard.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "dashboard.js").read_text(encoding="utf-8")
    api_source = (ROOT / "backend" / "md_quiz" / "api" / "admin.py").read_text(encoding="utf-8")
    db_source = (ROOT / "backend" / "md_quiz" / "storage" / "db.py").read_text(encoding="utf-8")

    assert "admin-r-responsive-list admin-r-responsive-list--dashboard" in page_source
    assert "grid-cols-[9rem_minmax(18rem,1fr)_9rem_14rem_2rem]" not in page_source
    assert "min-w-[820px]" not in page_source
    assert "admin-r-responsive-list__label" not in page_source
    assert 'x-text="item.token"' in page_source
    assert "dashboardAssignmentQuizTitle" in page_source
    assert "dashboardAssignmentQuizKey" in page_source
    assert "dashboardAssignmentSourceLabel" in page_source
    assert "dashboardAssignmentSourceIcon" in page_source
    assert "dashboardAssignmentInviteTime" in page_source
    assert "dashboardAssignmentAnswerTime" in page_source
    assert "openDashboardKpi(card)" in page_source
    assert "openDashboardPublicQuizzes" in page_source
    assert "openDashboardSyncPanel" in page_source
    assert "openDashboardSystemService(row.key)" in page_source
    assert '?"公开" :"定向"' in module_source
    assert "定向邀约" not in module_source
    assert '"public"' in module_source
    assert '?"language" :"badge"' in module_source
    assert 'target:"assignments-unhandled"' in module_source
    assert "/admin/assignments?status=finished&handling=unhandled&start_from=&end_to=" in module_source
    assert '"quiz_title": quiz_title' in api_source
    assert "NULLIF(qv.spec->>'title'" in db_source
    assert "NULLIF(qd.spec->>'title'" in db_source
    assert "LEFT JOIN quiz_version qv" in db_source


def test_admin_dashboard_destinations_preserve_filters_and_anchors() -> None:
    router_source = (ROOT / "static" / "admin" / "modules" / "router.js").read_text(encoding="utf-8")
    shell_source = (ROOT / "static" / "admin" / "modules" / "shell.js").read_text(encoding="utf-8")
    assignments_source = (ROOT / "backend" / "md_quiz" / "api" / "admin_assignment_routes.py").read_text(encoding="utf-8")
    assignments_page = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")
    quizzes_page = (ROOT / "static" / "admin" / "pages" / "quizzes.html").read_text(encoding="utf-8")
    status_page = (ROOT / "static" / "admin" / "pages" / "status.html").read_text(encoding="utf-8")

    assert "parseAdminRouteLocation" in router_source
    assert "route.href || this.route.path" in router_source
    assert "applyAdminRouteQueryState" in router_source
    assert "applyAdminRouteAnchor" in router_source
    assert "location.pathname}${location.search}${location.hash}" in shell_source
    assert 'status: str = ""' in assignments_source
    assert 'handling: str = ""' in assignments_source
    assert 'source_kind: str = ""' in assignments_source
    assert "status=status_filter or None" in assignments_source
    assert "handling=handling_filter or None" in assignments_source
    assert "source_kind=source_kind_filter or None" in assignments_source
    assert "assignmentRouteFilterChips" in assignments_page
    assert 'id="quiz-sync"' in quizzes_page
    assert 'id="llm-config"' in status_page
    assert 'id="sms-config"' in status_page


def test_admin_assignment_source_badges_use_short_labels() -> None:
    assignments_page = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")
    attempt_page = (ROOT / "static" / "admin" / "pages" / "attempt-detail.html").read_text(encoding="utf-8")
    assignments_module = (ROOT / "static" / "admin" / "modules" / "pages" / "assignments.js").read_text(encoding="utf-8")

    assert ':class="assignmentSourceBadgeClass(item)"' in assignments_page
    assert 'x-text="assignmentSourceIcon(item)"' in assignments_page
    assert 'x-text="assignmentSourceLabel(item)"' in assignments_page
    assert ':class="assignmentSourceBadgeClass(attemptDetail.quiz_paper)"' in attempt_page
    assert 'x-text="assignmentSourceIcon(attemptDetail.quiz_paper)"' in attempt_page
    assert 'x-text="assignmentSourceLabel(attemptDetail.quiz_paper)"' in attempt_page
    assert 'if (sourceKind ==="public") return"公开";' in assignments_module
    assert 'if (sourceKind ==="direct") return"定向";' in assignments_module
    assert '?"language" :"badge"' in assignments_module
    assert "admin-r-pill border-blue-200 bg-blue-50 text-blue-700" in assignments_module
    assert 'sourceLabel.includes("公开")) return"公开"' in assignments_module
    assert 'sourceLabel.includes("定向") || sourceLabel.includes("主动")) return"定向"' in assignments_module
    assert 'label: sourceKind ==="public" ?"公开" :"定向"' in assignments_module
    assert "定向邀约" not in assignments_module


def test_admin_assignments_list_rows_are_action_rows_with_qr_thumbnail() -> None:
    assignments_page = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")
    attempt_page = (ROOT / "static" / "admin" / "pages" / "attempt-detail.html").read_text(encoding="utf-8")
    assignments_module = (ROOT / "static" / "admin" / "modules" / "pages" / "assignments.js").read_text(encoding="utf-8")
    components_source = (ROOT / "static" / "assets" / "css" / "admin" / "components.css").read_text(encoding="utf-8")

    assert "admin-r-responsive-list admin-r-responsive-list--assignments" in assignments_page
    assert "grid-cols-[8.5rem_minmax(14rem,1fr)_10rem_5.5rem_4.5rem_11rem]" not in assignments_page
    assert "admin-r-responsive-list__label" not in assignments_page
    assert "<span>候选人</span>" in assignments_page
    assert "<span>测验</span>" in assignments_page
    assert "<span>QR</span>" in assignments_page
    assert 'x-text="item.candidate_name"' in assignments_page
    assert 'x-text="item.token"' in assignments_page
    assert 'x-text="item.quiz_title || item.quiz_key"' in assignments_page
    assert 'x-text="item.quiz_key"' in assignments_page
    assert 'x-text="item.status_label || \'状态未知\'"' in assignments_page
    assert 'class="assignment-qr-thumb"' in assignments_page
    assert ':src="item.qr_url"' in assignments_page
    assert '@click.stop="copyAssignmentQr(item)"' in assignments_page
    assert "copyAssignmentUrl(item)" not in assignments_page
    assert "assignmentActionButtonClass('detail'" not in assignments_page
    assert ">详情<" not in assignments_page
    assert 'class="assignment-action__icon material-symbols-rounded" aria-hidden="true">delete</span>' in assignments_page
    assert '<span class="assignment-action__text">删除</span>' in assignments_page
    assert 'class="assignment-action__icon material-symbols-rounded" aria-hidden="true">delete</span>' in attempt_page
    assert '<span class="assignment-action__text">删除邀约</span>' in attempt_page
    assert 'classes.join(" ")' in assignments_module
    assert 'kind ==="detail"' not in assignments_module
    assert 'classes.push("assignment-action--warning");' in assignments_module
    assert ".admin-r-responsive-list" in components_source
    assert "container-type: inline-size" in components_source
    assert "overflow-x: auto" in components_source
    assert "--admin-r-responsive-list-columns" in components_source
    assert "grid-template-areas" not in components_source
    assert "@container (min-width: 62rem)" in components_source
    assert ".assignment-qr-thumb" in components_source
    assert ".assignment-action" in components_source
    assert "border-radius: 6px" in components_source
    assert "font-size: 13px" in components_source
    assert "font-weight: 400" in components_source
    assert ".assignment-action:hover {\n    box-shadow: none;" in components_source
    assert ".assignment-action:focus-visible {\n    outline: none;" in components_source
    assert ".assignment-action--warning {\n    border-color: rgba(217, 119, 6, 0.32);\n    background: rgba(255, 251, 235, 0.96);\n    color: #92400e;" in components_source
    assert ".assignment-action--secondary {\n    border-color: rgba(37, 99, 235, 0.18);\n    background: rgba(255, 255, 255, 0.9);\n    color: #334155;" in components_source
    assert ".assignment-action--danger {\n    border-color: rgba(190, 18, 60, 0.24);\n    background: rgba(255, 241, 242, 0.94);\n    color: #9f1239;" in components_source
    assert ".assignment-action__text" in components_source
    assert "line-height: 1.2" in components_source
    assert ".assignment-action .assignment-action__icon.material-symbols-rounded" in components_source
    assert "width: 16px" in components_source
    assert "height: 16px" in components_source
    assert "font-size: 16px !important" in components_source
    assert "line-height: 1 !important" in components_source
    assert "transform: none" in components_source
    assert "\"opsz\" 20" in components_source
    assert ".assignment-badge {\n    min-height: 26px;\n    border-radius: 999px;" in components_source
    assert "width: 44px" in components_source
    assert "height: 44px" in components_source
    assert ".assignment-qr-thumb__image" in components_source


def test_admin_attempt_review_uses_compact_badges_and_spacing() -> None:
    attempt_page = (ROOT / "static" / "admin" / "pages" / "attempt-detail.html").read_text(encoding="utf-8")
    assignments_module = (ROOT / "static" / "admin" / "modules" / "pages" / "assignments.js").read_text(encoding="utf-8")
    components_source = (ROOT / "static" / "assets" / "css" / "admin" / "components.css").read_text(encoding="utf-8")

    status_method = _method_source(assignments_module, "attemptReviewQuestionStatusClass")
    row_method = _method_source(assignments_module, "attemptReviewOptionRowClass")
    selection_method = _method_source(assignments_module, "attemptReviewOptionSelectionBadgeClass")

    assert 'const classes = ["admin-r-review-chip"];' in status_method
    assert 'const classes = ["admin-r-review-option-row"];' in row_method
    assert 'const classes = ["admin-r-review-option-badge"];' in selection_method
    assert 'return classes.join(" ");' in status_method
    assert 'return classes.join(" ");' in row_method
    assert 'return classes.join(" ");' in selection_method
    assert 'return classes.join("");' not in status_method
    assert 'return classes.join("");' not in row_method
    assert 'return classes.join("");' not in selection_method

    assert 'class="admin-r-review-chip admin-r-review-chip--info" x-text="questionTypeLabel(question.type)"' in attempt_page
    assert 'class="admin-r-review-chip admin-r-review-chip--neutral" x-text="question.score_display"' in attempt_page
    assert 'class="admin-r-pill admin-r-pill--info" x-text="questionTypeLabel(question.type)"' not in attempt_page
    assert 'class="admin-r-review-options"' in attempt_page
    assert 'class="admin-r-review-option-key"' in attempt_page
    assert 'class="quiz-rich admin-markdown admin-r-review-option-text"' in attempt_page
    assert 'class="admin-r-review-option-badge admin-r-review-option-badge--ok">正确答案' in attempt_page
    assert 'class="admin-r-pill admin-r-pill--ok">正确答案' not in attempt_page
    assert ':class="attemptReviewOptionSelectionBadgeClass(question, option)">候选人选择' in attempt_page
    assert 'class="admin-r-review-rubric"' in attempt_page

    assert ".admin-r-review-chip" in components_source
    assert "min-height: 22px" in components_source
    assert ".admin-r-review-option-row" in components_source
    assert "gap: 10px" in components_source
    assert "padding: 9px 12px" in components_source
    assert ".admin-r-review-option-badge" in components_source
    assert "min-height: 21px" in components_source
    assert ".admin-r-review-rubric:focus-within" in components_source


def test_admin_pill_icons_follow_text_metrics() -> None:
    dashboard_page = (ROOT / "static" / "admin" / "pages" / "dashboard.html").read_text(encoding="utf-8")
    assignments_page = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")
    quizzes_page = (ROOT / "static" / "admin" / "pages" / "quizzes.html").read_text(encoding="utf-8")
    dashboard_module = (ROOT / "static" / "admin" / "modules" / "pages" / "dashboard.js").read_text(encoding="utf-8")
    admin_index = (ROOT / "static" / "admin" / "index.html").read_text(encoding="utf-8")
    components_source = (ROOT / "static" / "assets" / "css" / "admin" / "components.css").read_text(encoding="utf-8")
    theme_doc = (ROOT / "docs" / "ui" / "theme.md").read_text(encoding="utf-8")
    agent_prompt = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    static_ui_skill = (ROOT / "skills" / "static-ui" / "SKILL.md").read_text(encoding="utf-8")

    assert ".admin-r-pill__icon" in components_source
    assert "font-size: 0.92em !important" in components_source
    assert "line-height: 1 !important" in components_source
    assert "height: 0.92em" in components_source
    assert "GRAD\" -25" in components_source
    assert 'href="/static/admin.css?v=' in admin_index
    assert "admin-r-pill__icon material-symbols-rounded" in dashboard_page
    assert "admin-r-pill__icon material-symbols-rounded" in assignments_page
    assert "admin-r-pill__icon material-symbols-rounded" in quizzes_page
    assert "dashboardAssignmentSourceIcon(item)" in dashboard_page
    assert '?"language" :"badge"' in dashboard_module
    assert '"assignment_ind"' not in dashboard_module
    assert 'material-symbols-rounded text-[15px]" aria-hidden="true" x-text="dashboardAssignmentSourceIcon(item)"' not in dashboard_page
    assert "标签、徽标、状态 pill 内的图标必须小于或等于文字高度" in theme_doc
    assert "不得用固定大字号撑高标签" in agent_prompt
    assert "覆盖图标字体默认 `24px`" in agent_prompt
    assert "pill badge 内的 Material Symbols 必须小于或等于文字高度" in static_ui_skill


def test_admin_assignments_page_exposes_pagination_controls() -> None:
    source = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")

    assert "首页" in source
    assert "上一页" in source
    assert "下一页" in source
    assert "末页" in source


def test_admin_assignments_module_uses_page_query_param() -> None:
    source = (ROOT / "static" / "admin" / "modules" / "pages" / "assignments.js").read_text(encoding="utf-8")

    assert 'query.set("page"' in source
    assert "scheduleAssignmentsReloadFromFirstPage" in source


def test_admin_assignments_page_exposes_quiz_filter() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "assignments.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "assignments.js").read_text(encoding="utf-8")
    state_source = (ROOT / "static" / "admin" / "modules" / "state.js").read_text(encoding="utf-8")

    assert 'data-assignment-quiz-filter="tag-select"' in page_source
    assert "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,0.78fr)_minmax(0,0.78fr)]" in page_source
    assert 'x-model="assignmentFilterSelect.quiz.query"' in page_source
    assert "h-[42px]" in page_source
    assert "全部测验" in page_source
    assert "selectFirstAssignmentQuizFilterMatch" in page_source
    assert "handleAssignmentQuizFilterBackspace" in page_source
    assert "scheduleAssignmentQuizFilterSearch" in page_source
    assert "assignmentQuizFilterHeaderLabel" in page_source
    assert "正在检索测验" in page_source
    assert "assignmentQuizFilterLabel" in module_source
    assert "filteredAssignmentQuizFilterOptions" in module_source
    assert "loadAssignmentQuizFilterOptions" in module_source
    assert "/api/admin/quizzes?" in module_source
    assert 'query.set("quiz_key"' in module_source
    assert "assignmentFilterSelect" in state_source
    assert "assignmentQuizFilterOptions" in state_source
    assert "loaded: false" in state_source
    assert 'assignments: { q: "", quiz_key: ""' in state_source


def test_admin_quiz_detail_public_invite_options_are_gated() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "quiz-detail.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "quizzes.js").read_text(encoding="utf-8")

    assert 'x-show="quizDetail.quiz?.public_invite_enabled' in page_source
    assert 'class="admin-r-code tabular-nums" x-text="\'答题用时 \' + formatAnswerTime(question.answer_time_seconds)"' not in page_source
    assert 'class="font-sans text-[12px] font-normal leading-5 tracking-normal text-slate-500 tabular-nums" x-text="\'答题用时 \' + formatAnswerTime(question.answer_time_seconds)"' in page_source
    assert 'role="radiogroup" aria-label="公开邀约资料采集"' in page_source
    assert "setPublicInviteIgnoreTiming" in page_source
    assert "public_invite_ignore_timing" in module_source
    assert "ignore_timing: this.publicInviteIgnoreTiming()" in module_source


def test_admin_quizzes_page_exposes_public_invite_filter() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "quizzes.html").read_text(encoding="utf-8")
    module_source = (ROOT / "static" / "admin" / "modules" / "pages" / "quizzes.js").read_text(encoding="utf-8")
    state_source = (ROOT / "static" / "admin" / "modules" / "state.js").read_text(encoding="utf-8")

    assert 'aria-label="只看公开邀约测验"' in page_source
    assert "toggleQuizPublicInviteFilter" in page_source
    assert "public_invite" in state_source
    assert 'query.set("public_invite"' in module_source


def test_admin_quizzes_list_formats_key_and_tags_separately() -> None:
    page_source = (ROOT / "static" / "admin" / "pages" / "quizzes.html").read_text(encoding="utf-8")

    assert '@click="go(\'/admin/quizzes/\' + item.quiz_key)"' in page_source
    assert '@keydown.enter.prevent="go(\'/admin/quizzes/\' + item.quiz_key)"' in page_source
    assert '@keydown.space.prevent="go(\'/admin/quizzes/\' + item.quiz_key)"' in page_source
    assert '@click="selectQuizListItem(item)"' not in page_source
    assert 'aria-label="打开测验详情"' not in page_source
    assert 'class="admin-r-code min-w-0 truncate font-normal" x-text="item.quiz_key"' in page_source
    assert 'x-for="tag in (item.tags || []).slice(0, 4)"' in page_source
    assert 'class="admin-r-pill admin-r-pill--info" x-text="tag"' in page_source
    assert "(item.tags || []).slice(0, 4).join" not in page_source
