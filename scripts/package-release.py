"""Build and audit a local Cities: Skylines II mod package."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "mod" / "CityMap" / "CityMap.csproj"
CONFIG = ROOT / "mod" / "CityMap" / "Properties" / "PublishConfiguration.xml"
RELEASE = ROOT / "artifacts" / "release"
STAGE = RELEASE / "stage"
MOD = STAGE / "CityMap"
REQUIRED = {
    "CityMap.dll",
    "CityMap_win_x86_64.dll",
    "CityMap_linux_x86_64.so",
    "CityMap_mac_x86_64.bundle",
    "RELEASE_NOTES.md",
    "LICENSE.txt",
    "THIRD_PARTY_NOTICES.txt",
    "web/index.html",
}
FORBIDDEN_PARTS = {
    "node_modules", "exported_files", "geojson", "geotiff", "snapshots",
    "staging", "public", "src", "scripts", "obj", "bin", ".git",
}
FORBIDDEN_SUFFIXES = {".tif", ".tiff", ".geojson", ".ts", ".tsx", ".map", ".csproj"}


def run(*args: str) -> None:
    print("Running:", " ".join(args), flush=True)
    env = os.environ.copy()
    env["DOTNET_ROLL_FORWARD"] = "Major"
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def audit() -> tuple[str, list[Path]]:
    publish = ET.parse(CONFIG).getroot()
    def value(tag: str, attribute: str = "Value") -> str:
        item = publish.find(tag)
        return "" if item is None else item.attrib.get(attribute, "")

    version = value("ModVersion")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("PublishConfiguration.xml needs a semantic ModVersion")
    change_log = value("ChangeLog") or publish.findtext("ChangeLog", "")
    if value("ModId") and not change_log.strip():
        raise ValueError("NewVersion publishing requires a ChangeLog")
    if value("Dependency", "Id") != "87428":
        raise ValueError("Carto Paradox Mods dependency 87428 is missing")
    if value("GameVersion") != "1.6.*":
        raise ValueError("Review the supported game version before packaging")
    if value("AccessLevel") not in {"Private", "Public"}:
        raise ValueError("AccessLevel must be Private or Public")
    if value("Thumbnail") != "Properties/Thumbnail.png":
        raise ValueError("Publisher thumbnail must point to Properties/Thumbnail.png")
    if not (CONFIG.parent.parent / value("Thumbnail")).is_file():
        raise ValueError("Publisher thumbnail source file is missing")
    if not publish.findtext("LongDescription", "").strip():
        raise ValueError("Publisher description is missing")
    if not MOD.is_dir():
        raise FileNotFoundError(f"Official Toolchain output is missing: {MOD}")

    files = sorted(path for path in MOD.rglob("*") if path.is_file())
    relative = {path.relative_to(MOD).as_posix() for path in files}
    missing = REQUIRED - relative
    if missing:
        raise ValueError(f"Required package files missing: {sorted(missing)}")
    if not any(name.startswith("web/assets/routing.worker-") and name.endswith(".js") for name in relative):
        raise ValueError("Routing worker is missing")
    if not any(name.startswith("web/assets/maplibre-gl-worker-") and name.endswith(".js") for name in relative):
        raise ValueError("MapLibre worker is missing")
    for name in relative:
        parts = Path(name).parts
        if set(part.lower() for part in parts) & FORBIDDEN_PARTS:
            raise ValueError(f"Development or city data directory in package: {name}")
        if Path(name).suffix.lower() in FORBIDDEN_SUFFIXES or name.lower().endswith("carto.dll"):
            raise ValueError(f"Development, city or Carto file in package: {name}")
    html = (MOD / "web" / "index.html").read_text(encoding="utf-8")
    if "localhost:3000" in html or "/@vite/client" in html:
        raise ValueError("Development URL or Vite client in web app")
    for asset in re.findall(r'(?:src|href)="(\./assets/[^"]+)"', html):
        if not (MOD / "web" / asset).is_file():
            raise ValueError(f"Web asset referenced by index.html is missing: {asset}")
    notices = (MOD / "THIRD_PARTY_NOTICES.txt").read_text(encoding="utf-8")
    for name in ("maplibre-gl", "react", "react-dom"):
        if not re.search(rf"(?m)^{name} \d", notices):
            raise ValueError(f"Runtime license notice missing: {name}")
    return version, files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-only", action="store_true", help="Check an existing Toolchain stage")
    args = parser.parse_args()
    if not args.audit_only:
        run("node", "scripts/generate-third-party-notices.mjs")
        run("dotnet", "build", str(PROJECT), "-c", "Release", f"-p:LocalModsPath={STAGE}", "-v:q")
    version, files = audit()
    RELEASE.mkdir(parents=True, exist_ok=True)
    archive = RELEASE / f"SkylensMaps-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for path in files:
            package.write(path, Path("CityMap") / path.relative_to(MOD))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (RELEASE / f"SkylensMaps-{version}.sha256").write_text(
        f"{digest}  {archive.name}\n", encoding="ascii"
    )
    print(f"Audited {len(files)} files; archive: {archive.relative_to(ROOT)}")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Package failed: {exc}", file=sys.stderr)
        sys.exit(1)
