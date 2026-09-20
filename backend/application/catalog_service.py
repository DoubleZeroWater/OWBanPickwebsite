from __future__ import annotations

import json
import secrets
import threading
import time
import unicodedata
from copy import deepcopy

from backend import catalog as catalog_data
from backend.domain.contracts import (
    CatalogAssets,
    CatalogHero,
    CatalogMap,
    CatalogRefreshJob,
    HeroPool,
    JsonObject,
    MapCapabilities,
)
from backend.config import (
    ASSETS_DATA_PATH,
    BUNDLED_TRANSLATION_PATH,
    HERO_PLACEHOLDER,
    MAP_PLACEHOLDER,
    MAPS_DATA_PATH,
    RUNTIME_CATALOG_DIR,
    SETTINGS_PRESET_PATH,
    SETTINGS_PRESETS_PATH,
)
from backend.domain.state_models import hero_pool_from_catalog, map_capabilities_from_catalog


catalog_refresh_lock = threading.Lock()
catalog_refresh_jobs: dict[str, CatalogRefreshJob] = {}
active_catalog_refresh_job_id: str | None = None


def build_maps_catalog() -> JsonObject:
    return catalog_data.build_catalog_response(ASSETS_DATA_PATH, BUNDLED_TRANSLATION_PATH, RUNTIME_CATALOG_DIR)


def compute_catalog_hash(assets: CatalogAssets) -> str:
    return catalog_data.compute_catalog_hash(assets)


def current_catalog_refresh_job_unlocked() -> CatalogRefreshJob | None:
    if active_catalog_refresh_job_id is None:
        return None
    job = catalog_refresh_jobs.get(active_catalog_refresh_job_id)
    return deepcopy(job) if job else None


def start_catalog_refresh_job() -> tuple[CatalogRefreshJob, bool]:
    global active_catalog_refresh_job_id

    with catalog_refresh_lock:
        current = current_catalog_refresh_job_unlocked()
        if current and current.get("status") in {"queued", "running"}:
            return current, False

        job_id = secrets.token_hex(12)
        job: CatalogRefreshJob = {
            "id": job_id,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "message": "任务已进入队列",
            "createdAt": int(time.time()),
            "startedAt": None,
            "finishedAt": None,
            "error": None,
            "result": None,
        }
        catalog_refresh_jobs[job_id] = job
        active_catalog_refresh_job_id = job_id

    threading.Thread(
        target=run_catalog_refresh_job,
        args=(job_id,),
        name=f"catalog-refresh-{job_id[:8]}",
        daemon=True,
    ).start()
    return deepcopy(job), True


def run_catalog_refresh_job(job_id: str) -> None:
    def report(stage: str, percent: int, message: str) -> None:
        with catalog_refresh_lock:
            catalog_refresh_jobs[job_id].update(
                status="running", stage=stage, progress=percent, message=message
            )

    with catalog_refresh_lock:
        catalog_refresh_jobs[job_id].update(
            status="running", startedAt=int(time.time()), message="正在连接 Fandom"
        )

    try:
        assets = catalog_data.refresh_runtime_catalog(RUNTIME_CATALOG_DIR, report)
        result = {
            "counts": {
                "modes": len(assets.get("modes", [])),
                "maps": sum(len(items) for items in assets.get("maps", {}).values()),
                "heroes": len(assets.get("heroes", [])),
            },
            "catalogHash": catalog_data.compute_catalog_hash(assets),
            "translationTemplate": catalog_data.build_translation_template(assets),
        }
        with catalog_refresh_lock:
            catalog_refresh_jobs[job_id].update(
                status="completed",
                stage="completed",
                progress=100,
                message="英文目录更新完成",
                finishedAt=int(time.time()),
                result=result,
            )
    except Exception as exc:
        with catalog_refresh_lock:
            catalog_refresh_jobs[job_id].update(
                status="failed",
                stage="failed",
                message="更新失败，已保留上一版目录",
                finishedAt=int(time.time()),
                error=str(exc),
            )


def load_settings_preset() -> JsonObject:
    if SETTINGS_PRESETS_PATH.exists():
        with SETTINGS_PRESETS_PATH.open(encoding="utf-8") as file:
            return json.load(file)
    if SETTINGS_PRESET_PATH.exists():
        with SETTINGS_PRESET_PATH.open(encoding="utf-8") as file:
            return {"presets": {"默认预设": json.load(file)}, "last": "默认预设"}
    return {"presets": {}, "last": None}


def load_assets() -> CatalogAssets:
    assets, _source = catalog_data.load_catalog_assets(ASSETS_DATA_PATH, RUNTIME_CATALOG_DIR)
    if assets:
        return assets
    if not MAPS_DATA_PATH.exists():
        return {}
    with MAPS_DATA_PATH.open(encoding="utf-8") as file:
        payload = json.load(file)
    return {"maps": payload.get("maps", {}), "modeIcons": {}, "heroes": []}


def current_hero_pool() -> HeroPool:
    return hero_pool_from_catalog(load_assets().get("heroes", []))


def current_map_capabilities() -> MapCapabilities:
    return map_capabilities_from_catalog(load_assets())


def map_catalog(assets: CatalogAssets) -> dict[str, CatalogMap]:
    return {
        f"{mode}:{map_info['nameEn']}": map_info
        for mode, maps in assets.get("maps", {}).items()
        for map_info in maps
    }


def normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(character for character in normalized if not unicodedata.combining(character))
    return "".join(character.lower() for character in stripped if character.isalnum())


def hero_catalog(assets: CatalogAssets) -> dict[str, CatalogHero]:
    return {normalize_key(hero["nameEn"]): hero for hero in assets.get("heroes", [])}


def map_image(assets: CatalogAssets, mode: str, name_en: str) -> str:
    return map_catalog(assets).get(f"{mode}:{name_en}", {}).get("imageUrl", MAP_PLACEHOLDER)


def mode_icon(assets: CatalogAssets, mode: str) -> str | None:
    return assets.get("modeIcons", {}).get(mode, {}).get("imageUrl")


def hero_ban(assets: CatalogAssets, name_en: str, name_zh: str, role: str) -> dict[str, str]:
    hero = hero_catalog(assets).get(normalize_key(name_en), {})
    return {
        "hero": name_zh,
        "nameEn": name_en,
        "role": role,
        "imageUrl": hero.get("imageUrl", HERO_PLACEHOLDER),
    }
