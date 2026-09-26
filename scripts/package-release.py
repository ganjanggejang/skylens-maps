"""Build and audit a local Cities: Skylines II mod package."""

from __future__ import annotations

import argparse
import hashlib
import json
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
    "COPYRIGHT.txt",
    "SOURCE.zip",
    "THIRD_PARTY_NOTICES.txt",
    "web/index.html",
}
FORBIDDEN_PARTS = {
    "node_modules", "exported_files", "geojson", "geotiff", "snapshots",
    "staging", "public", "src", "scripts", "obj", "bin", ".git",
}
FORBIDDEN_SUFFIXES = {".tif", ".tiff", ".geojson", ".ts", ".tsx", ".map", ".csproj"}
SOURCE_ROOT_FILES = (
    ".gitignore", "LICENSE.txt", "COPYRIGHT.txt", "README.md", "CONTRIBUTING.md",
    "index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
)
SOURCE_DIRS = ("docs", "src", "scripts", "mod/CityMap")
SOURCE_EXCLUDED_DIRS = {"bin", "obj", "Library", ".vs", "__pycache__"}
SOURCE_REQUIRED = {
    "LICENSE.txt", "COPYRIGHT.txt", "package.json", "package-lock.json",
    "scripts/package-release.py", "mod/CityMap/CityMap.csproj",
    "mod/CityMap/Properties/Thumbnail.png", "src/MapView.tsx",
}


def run(*args: str) -> None:
    print("Running:", " ".join(args), flush=True)
    env = os.environ.copy()
    env["DOTNET_ROLL_FORWARD"] = "Major"
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def build_source_archive() -> Path:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    RELEASE.mkdir(parents=True, exist_ok=True)
    output = RELEASE / f"SkylensMaps-{version}-source.zip"
    files = [ROOT / name for name in SOURCE_ROOT_FILES]
    for directory in SOURCE_DIRS:
        files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file()
                     and not any(part in SOURCE_EXCLUDED_DIRS for part in path.relative_to(ROOT).parts)
                     and not path.name.endswith((".user", ".pyc")))
    files = sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())
    if any(not path.is_file() for path in files):
        raise FileNotFoundError("Required project source file is missing")
    names = {path.relative_to(ROOT).as_posix() for path in files}
    if SOURCE_REQUIRED - names:
        raise ValueError(f"Required source files missing: {sorted(SOURCE_REQUIRED - names)}")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(ROOT).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, path.read_bytes())
    print(f"Packed {len(files)} source files: {output.relative_to(ROOT)}")
    return output


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
    license_text = (MOD / "LICENSE.txt").read_text(encoding="utf-8")
    copyright_text = (MOD / "COPYRIGHT.txt").read_text(encoding="utf-8")
    if "GNU GENERAL PUBLIC LICENSE" not in license_text[:200] or "Version 3, 29 June 2007" not in license_text[:200]:
        raise ValueError("GPLv3 license text is missing from the package")
    if "GPL-3.0-only" not in copyright_text or "github.com/ganjanggejang/skylens-maps" not in copyright_text:
        raise ValueError("Project copyright and source notice is missing")
    with zipfile.ZipFile(MOD / "SOURCE.zip") as source:
        source_names = set(source.namelist())
        if SOURCE_REQUIRED - source_names:
            raise ValueError(f"Corresponding source is incomplete: {sorted(SOURCE_REQUIRED - source_names)}")
        if any(set(Path(name).parts) & FORBIDDEN_PARTS - {"src", "scripts"} for name in source_names):
            raise ValueError("Source archive contains development or city data")
        if json.loads(source.read("package.json"))["version"] != version:
            raise ValueError("Source archive version does not match mod version")
        if source.read("LICENSE.txt") != (MOD / "LICENSE.txt").read_bytes():
            raise ValueError("Source and mod license texts differ")
    if (MOD / "SOURCE.zip").read_bytes() != (RELEASE / f"SkylensMaps-{version}-source.zip").read_bytes():
        raise ValueError("Published source archive differs from the build source")
    for name in ("maplibre-gl", "react", "react-dom"):
        if not re.search(rf"(?m)^{name} \d", notices):
            raise ValueError(f"Runtime license notice missing: {name}")
    return version, files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-only", action="store_true", help="Check an existing Toolchain stage")
    parser.add_argument("--source-only", action="store_true", help="Package corresponding project source")
    args = parser.parse_args()
    if args.source_only:
        build_source_archive()
        return
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
