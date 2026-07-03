from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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
