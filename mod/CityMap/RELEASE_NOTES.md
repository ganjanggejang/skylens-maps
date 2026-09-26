# SKYLENS MAPS 0.1.1

Version 0.1.1 fixes web app discovery when SKYLENS MAPS is installed through a Paradox Mods subscription.

## 한국어

**설치:** Cities: Skylines II 1.6 계열에서 [Carto](https://mods.paradoxplaza.com/mods/87428/Windows)와 SKYLENS MAPS를 같은 플레이셋에 추가하고 둘 다 활성화하세요. 도시를 불러온 뒤 **옵션 → SKYLENS MAPS → Main → LAUNCH SKYLENS MAPS**를 누르면 현재 도시를 추출하고 기본 브라우저로 지도를 엽니다. 이후 **Reopen map**은 같은 도시의 마지막 지도를 다시 엽니다. Node.js나 별도 지도 서비스는 필요하지 않습니다.

**기능:** 건물·도로·POI·노선 검색, 수역과 대중교통 레이어, 차량 및 대중교통 예상 길찾기. 원본 Carto 데이터와 생성한 지도는 사용자 데이터의 `ModsData/CityMap/snapshots/`에 저장됩니다. 지도 서버는 게임이 실행 중일 때만 열립니다.

**알려진 제한:** Carto의 내보내기 설정이 필요한 GeoJSON·GeoTIFF 전체를 생성해야 합니다. 대도시는 Carto 추출 중 게임 화면이 잠시 멈출 수 있습니다. 수역 마스크 생성이 실패하면 수역 레이어를 사용할 수 없습니다. 대중교통 정류장 연결·순서, 운행 방향·대기 시간과 차량 주행 시간은 추정치이며 실제 게임 경로 또는 시간표와 다를 수 있습니다. 지도 방향과 거리의 게임 화면 대비 정확도는 아직 검증 중입니다. 게임이나 모드가 종료되면 기존 브라우저 탭의 지도는 열리지 않습니다.

**문제 신고:** [GitHub Issues](https://github.com/ganjanggejang/skylens-maps/issues)에 게임 옵션의 SKYLENS MAPS 상태 메시지, 재현 순서, 게임·Carto·SKYLENS MAPS 버전과 로그를 첨부해 주세요. 로그는 `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II\Logs\`의 `CityMap` 로그와 같은 폴더의 `Player.log`에서 확인할 수 있습니다. 도시 원본 데이터가 들어 있는 `ModsData/CityMap/snapshots/`는 공개 이슈에 첨부하지 마세요.

## English

**Install:** On Cities: Skylines II 1.6.x, add [Carto](https://mods.paradoxplaza.com/mods/87428/Windows) and SKYLENS MAPS to the same playset and enable both. Load a city and choose **Options → SKYLENS MAPS → Main → LAUNCH SKYLENS MAPS**. The mod exports the current city and opens the map in your default browser. **Reopen map** opens the latest map for the loaded city. No Node.js or external map service is needed.

**Features:** Search buildings, roads, POIs and routes; show water and transit layers; estimate driving and transit directions. Exported data and maps are stored under `ModsData/CityMap/snapshots/` in the game's user data. The local map server runs only while the game is running.

**Known limitations:** Carto's settings must produce the complete required GeoJSON and GeoTIFF set. Exporting a large city may briefly pause the game. Water cannot be shown if mask generation fails. Transit stop links and order, direction and wait times, and driving times are estimates. Map orientation and distance accuracy against the game view have not yet been validated. Browser tabs stop loading the map after the game or mod closes.

**Report issues:** Use [GitHub Issues](https://github.com/ganjanggejang/skylens-maps/issues) and include the SKYLENS MAPS Options status, steps to reproduce, game/Carto/SKYLENS MAPS versions, and logs. Look in `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II\Logs\` for the `CityMap` log and `Player.log`. Do not attach `ModsData/CityMap/snapshots/` to public reports; it contains your city data.

## Credits and licenses

Carto is a separate required mod by Chang-Yu Ho, distributed under the MIT License. Its DLL is not included here. The bundled web app uses React, MapLibre GL JS, and the other packages listed with license texts in `THIRD_PARTY_NOTICES.txt`. SKYLENS MAPS original code and artwork are All rights reserved; see `LICENSE.txt`.
