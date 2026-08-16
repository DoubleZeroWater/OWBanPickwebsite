from __future__ import annotations

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SPEC_ROOT = ROOT / "docs" / "ui-spec"
PORTALS = ("team_left", "team_right", "admin", "broadcast")
CONTROL_STATES = {"enabled", "disabled", "hidden"}


def load_yaml(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        document = yaml.safe_load(source)
    if not isinstance(document, dict):
        raise AssertionError(f"{path}: YAML 根节点必须是对象")
    return document


def main() -> None:
    manifest = load_yaml(SPEC_ROOT / "manifest.yaml")
    notification_catalog = load_yaml(SPEC_ROOT / "notifications.yaml").get("notifications", {})
    scenario_files = manifest["documents"]["scenarios"]
    seen_ids: set[str] = set()
    scenario_count = 0

    for relative_path in scenario_files:
        path = SPEC_ROOT / relative_path
        document = load_yaml(path)
        assert document.get("kind") == "ui-scenarios", f"{path}: kind 必须为 ui-scenarios"
        for scenario in document.get("scenarios", []):
            scenario_count += 1
            scenario_id = scenario.get("id")
            assert isinstance(scenario_id, str) and scenario_id, f"{path}: 场景缺少 id"
            assert scenario_id not in seen_ids, f"{path}: 场景 id 重复：{scenario_id}"
            seen_ids.add(scenario_id)
            assert scenario.get("reviewStatus") == "confirmed", f"{scenario_id}: 尚未确认"

            expectation = scenario.get("expect", {})
            assert expectation.get("baseboard"), f"{scenario_id}: 缺少比赛底板"
            views = expectation.get("views", {})
            notifications = expectation.get("notifications", {})
            assert set(views) == set(PORTALS), f"{scenario_id}: 必须显式描述四个入口视图"
            assert set(notifications) == set(PORTALS), f"{scenario_id}: 必须显式描述四个入口通知"

            for portal in PORTALS:
                view = views[portal]
                foreground = view.get("foreground")
                assert isinstance(foreground, str) and foreground, (
                    f"{scenario_id}/{portal}: 必须且只能指定一个主前景"
                )
                assert view.get("mode") in {"interactive", "acting-for-team", "readonly"}, (
                    f"{scenario_id}/{portal}: mode 无效"
                )
                for control_id, control in view.get("controls", {}).items():
                    state = control.get("state")
                    assert state in CONTROL_STATES, f"{scenario_id}/{portal}/{control_id}: 控件状态无效"
                for event_id in notifications[portal]:
                    assert event_id in notification_catalog, (
                        f"{scenario_id}/{portal}: 未定义通知事件 {event_id}"
                    )

    assert scenario_count == 47, f"已确认场景应为 47 个，实际为 {scenario_count}"
    print(f"UI specification valid: {scenario_count} confirmed scenarios, 4 portals each.")


if __name__ == "__main__":
    main()
