# CS2 City Map 구현 계획서

> 2026-09-25 검토. `exported_files/GeoJSON`의 실제 데이터를 기준으로 작성했다. 이 문서는 구현 계획이며 앱 생성, 데이터 변환, 의존성 설치는 아직 수행하지 않는다.

## 1. 목표와 범위

Cities: Skylines II에서 Carto로 추출한 도시를 개인 PC의 `localhost:3000`에서 탐색하는 2D 웹 지도를 만든다. 마치 현실에서 Google Maps를 사용하는 것과 같은 경험을 주는 것이 목표다. React + TypeScript + Vite + MapLibre GL JS를 사용하며 초기에는 별도 백엔드와 DB 없이 정적 파일로 동작한다.

- MVP: 실제 도로·건물 표시, 이동/확대/축소, 레이어 토글, 객체 상세 조회(Phase 1~3).
- 후속 확장: 검색, 용도지역·POI·대중교통(Phase 4~5).
- 자동 Export, 실시간 게임 연동, 경로 탐색, Google Maps API, 3D 지형은 이번 범위에서 제외한다.
- 물·지형 GeoTIFF는 선택 확장으로 남기며 GeoJSON MVP의 선행 조건으로 삼지 않는다.

도시 생성과 Carto Export는 이미 완료되었다. 첫 작업을 모드 설치나 신규 도시 생성부터 다시 시작하지 않는다. Vellum/CS2MapView 조사는 필요한 문제가 생겼을 때 참고하며 필수 의존성으로 삼지 않는다.

## 2. 확인한 입력 데이터

### 2.1 파일 목록

아래 수치는 2026-09-25에 읽은 현재 스냅샷 기준이다. 확장자는 `.json`이지만 모두 GeoJSON `FeatureCollection`이다. 이후 Export에서는 건수·속성·geometry가 달라질 수 있으므로 코드에 고정하지 않는다.

| 파일 (`exported_files/GeoJSON/`) | Geometry | Feature 수 | 바이트 | 용도 |
|---|---|---:|---:|---|
| `Area_Boundary.json` | Polygon | 529 | 405,779 | 현재는 모두 맵 타일 |
| `Building_Boundary.json` | Polygon | 186 | 191,845 | 건물 경계와 속성 |
| `Network_Boundary.json` | Polygon | 555 | 7,634,585 | 교통망 면 형상, 선택적 정밀 표현 |
| `Network_Centerline.json` | LineString | 555 | 4,448,076 | 도로·철도·항로·보행로 중심선 |
| `POI_Location.json` | Point | 100 | 44,665 | 시설·정류장·설비 위치 |
| `Route_Centerline.json` | LineString | 2 | 133,115 | 버스 1개, 기차 1개 노선 |
| `Zoning_Boundary.json` | Polygon | 1,963 | 1,520,512 | 용도지역 셀 |

총 14,378,577바이트(약 13.71 MiB)다. 작은 도시라도 외부 교통망이 포함되므로 파일 크기를 인구만으로 추정하지 않는다. 초기에는 중심선과 건물만 로드한다(합계 약 4.43 MiB).

`exported_files/GeoTIFF`의 `Depth.tif`, `Elevation.tif`는 별도 래스터 데이터다. Shapefile 변환 파이프라인은 이번 계획에 필요하지 않다. Carto 튜토리얼의 QGIS용 `.qml`은 스타일 참고 자료이며 MapLibre에 직접 적용하지 않는다. [Carto Tutorial](https://github.com/taipei-native/Carto/wiki/Tutorial)

### 2.2 실제 속성

속성명은 대소문자를 포함해 원문을 보존한다. 표시 이름과 필터용 파생값은 어댑터에서 별도로 만든다.

| 데이터 | 현재 존재하는 속성 |
|---|---|
| Area | `Name`, `Object`, `Resident`, `Employee`, `Unlocked` |
| Building | `Name`, `Address_District`, `Address_Street`, `Address_Number`, `Asset`, `Category`, `Employee`, `Object`, `Resident`, `Zoning` |
| Network (두 파일 공통) | `Name`, `Asset`, `Category`, `Direction`, `Elevation`, `Form`, `Lane`, `Limit`, `Object` |
| POI | `Name`, `Address_District`, `Address_Street`, `Address_Number`, `Category`, `Object` |
| Route | `Name`, `Color`, `Length`, `Object`, `Passenger`, `Stop`, `Transport`, `Usage`, `Vehicle`, `Weight` |
| Zoning | `Name`, `Color`, `Object`, `Zoning` |

현재 데이터 해석 시 주의할 사항:

- Area의 `Object`는 전부 `MapTile`이다. `District`는 없고 건물의 `Address_District`도 모두 `(Unincorporated Area)`다. 맵 타일을 행정구역으로 표시하지 않는다.
- Network는 `Road` 388개, `Track` 121개, `Waterway` 38개, `Pathway` 8개다. 도로는 `Object === "Road"`로 필터링한다. 항로는 수면 경계가 아니다.
- `Category`, `Zoning`에는 `Public, Water`, `Residential, Commercial` 등 복수 값이 있다. 쉼표로 분리하고 공백을 제거한 토큰으로 필터링하며 원문도 유지한다.
- 도로 차선 필드명은 `Lane`이다. 현재 Network에는 `Length`, `Width`, 교통량 필드가 없고 Building에는 `Level`, `Household`가 없다. 예시 값을 실제 데이터처럼 표시하지 않는다.
- POI 100개 중 `UtilityPylon`이 59개다. 주요 시설·정류장과 설비를 분리한다. `StopBus` 9개, `StopPassengerTrain` 2개가 있다.
- Route에는 정류장 공통 ID나 정차 순서가 없다. 정류장 위치는 표시하되 노선별 정차 순서를 정확히 연결한다고 약속하지 않는다. 근접 위치만으로 자동 연결하지 않는다.
- 모든 Feature에 최상위 `id`가 없다. 동일 이름이 있으므로 `Name`도 고유키로 사용할 수 없다.
- UTF-8 JSON 파싱과 한글 문자열을 확인했다. 터미널의 한글 표시 문제와 원본 손상을 구분하며 브라우저에서도 한글 표시·검색을 검증한다.

분류 의미는 [Carto Values](https://github.com/taipei-native/Carto/wiki/Values), 속성의 단위와 복수 값 규칙은 [Carto 속성 설명](https://github.com/taipei-native/Carto/wiki#customize-geometries-and-attributes)을 참고한다. 최신 문서의 모든 필드가 현재 Export에 있다고 가정하지 않는다.

## 3. 좌표계와 초기 화면

### 확인된 사실

- 모든 좌표는 2차원이고 최상위 `crs`, `bbox`는 없다.
- Network 중심선 bounds는 `[minX, minY, maxX, maxY] = [-0.066151447, -0.066597223, 0.066152597, 0.066600884]`다.
- Building bounds는 `[-0.013671323, -0.038263186, 0.017656830, -0.000444560]`다.
- 좌표 규모는 경도·위도 형식과 부합한다. 미터 단위 게임 월드 좌표라고 가정해 임의 축 반전·배율 변경·재투영을 하지 않는다.

### 구현 방침

현재 좌표를 `[longitude, latitude]`로 MapLibre에 그대로 전달하는 것을 첫 기술 검증으로 삼는다. 범위만으로 Export의 CRS·원점·회전 설정까지 확정할 수 없으므로 Phase 0에서 Carto 설정 또는 QGIS 비교로 방향과 정합성을 확인한다. Carto는 Export 단계에서 좌표 설정을 제공한다. [Carto Projection 설정](https://github.com/taipei-native/Carto/wiki#set-projection-options)

- 외부 실세계 배경지도 없이 단색 배경의 로컬 스타일을 사용한다. 0도 부근 좌표를 실제 도시 위치라는 의미로 표시하지 않는다.
- 최초 `fitBounds`는 비장식 건물 중심의 개발 지역을 기준으로 하며 전체 맵 보기 버튼은 Network/Area 전체 범위를 사용한다. 외부 연결망 때문에 도심이 너무 작아지지 않는지 확인한다.
- 북쪽 방향, 건물과 도로의 상대 위치, 교차로 정렬, 종횡비를 게임 또는 QGIS와 대조한다. 파일 간 불일치는 Export 설정·시점부터 확인한다.
- 줌·이동 범위는 데이터 bounds에 여유를 더해 정한다. 기본 pitch는 0이고 세계 반복 표시를 끈다.
- 좌표계 검증 전에는 거리·면적의 실측 정확도를 보장하지 않는다. Network 길이가 필요하면 검증된 지리 계산으로 구하고 원본 값과 구분한다.

## 4. 데이터 로딩과 앱 구조

### 4.1 파일 공급

구현 시 명시적으로 실행하는 데이터 준비 명령으로 GeoJSON을 `public/data/`에 복사하고 manifest를 생성한다. 원본은 수정하지 않는다. 브라우저가 로컬 파일 경로를 직접 읽거나 저장소 전체를 서비스하게 하지 않는다.

```text
exported_files/GeoJSON/*.json  (수동 Export 원본)
           │ 명시적인 데이터 준비·검증
           ▼
public/data/*.json + manifest.json
           │ HTTP fetch
           ▼
검증/어댑터 → MapLibre sources/layers
           └→ 상세 패널·검색·통계
```

`manifest.json`은 앱에서 생성할 메타데이터이며 Carto 원본에는 없다. 데이터셋 식별자, 파일명·해시·크기·Feature 수·bounds·가용 속성·준비 시각을 기록한다. 게임 시각·Carto 버전·Export 시각은 확인된 경우만 기록하고 준비 시각으로 대신하지 않는다. 원본과 생성 데이터의 Git 추적 정책은 구현 시 정한다(현재 `exported_files`는 ignore 대상).

### 4.2 데이터 계약

- FeatureCollection, geometry, 유한한 좌표, 배열 구조, 필수 속성을 검증한다. Polygon의 구멍과 MultiPolygon/MultiLineString을 손실 없이 다룰 수 있게 설계한다.
- 현재는 Polygon/LineString/Point만 있다. 새로운 Export에서 미지원 geometry가 나타나면 조용히 누락하지 말고 파일·건수와 함께 알린다.
- 파일별 loading/ready/empty/error 상태를 둔다. 필수 파일 오류는 명확히 표시하고 선택 레이어 오류는 다른 레이어를 막지 않는다.
- 누락·null과 실제 숫자 0을 구분한다. 원본 문자열은 HTML 삽입 대신 React 텍스트로 출력한다.
- ID는 `datasetId + sourceKey + 원본 feature index`로 만들어 동일 스냅샷 내 선택·검색을 연결한다. Export 교체 후에도 같은 게임 객체를 식별하는 ID로 간주하지 않는다.
- Network 면/중심선은 개수가 같지만 공통키가 없다. 이름이나 배열 순서만으로 결합하지 않는다. 중심선을 클릭·검색·통계의 대표 소스로 쓴다.
- 원본 속성과 정규화한 분류 토큰을 분리하고, 공통 UI 모델과 데이터별 속성 타입을 둔다. 미지의 속성은 보존한다.

### 4.3 성능과 실행 환경

초기에는 중심선과 건물만 로드한다. 선택 소스는 필요할 때 로드·캐시하며 가장 큰 Network 면 파일은 정밀 표현을 켤 때 읽는다. 여러 style layer가 같은 source를 공유하여 중복 로딩을 피한다. [MapLibre GeoJSONSource](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/)

지도 인스턴스는 컴포넌트 수명 동안 유지하고 종료 시 이벤트·자원을 정리한다. React 재렌더링마다 source를 다시 주입하지 않는다. 실제 PC에서 로드 시간·팬/줌 반응·메모리를 측정한 후 필요할 때만 단순화·Web Worker·벡터 타일을 검토한다.

Vite는 포트 3000을 명시하고 충돌 시 오류를 알리며 localhost에 바인딩한다. 외부 지도·아이콘 서비스 의존성을 만들지 않는다. 한글 지도 라벨을 도입할 때 glyph/font 및 아이콘의 로컬 공급을 확인한다. MVP는 지도 라벨 없이도 상세 패널에서 한글을 읽을 수 있어야 한다.

## 5. 레이어 설계

UI 레이어와 MapLibre style layer는 1:1이 아니다. 도로 하나도 외곽선·본선·선택 강조 등 여러 style layer로 구성할 수 있다. UI id, 표시명, 가용 여부, source id 목록, style layer id 목록, 표시 상태를 관리한다.

| UI 레이어 | 소스와 필터 | 표현/도입 시점 |
|---|---|---|
| 도로 | Network Centerline, `Object=Road` | line, MVP |
| 건물 | Building Boundary | fill + outline, MVP |
| 철도·보행로·항로 | Network Centerline, 해당 Object | 각각 토글, Phase 2 이후 |
| 교통망 면 | Network Boundary | 선택적 fill, Phase 5 |
| 맵 타일 | Area, `Object=MapTile` | 기본 꺼짐, 경계 위주 |
| 행정구역 | Area, `Object=District` | 현재 없음, 데이터 없음 상태 |
| 용도지역 | Zoning Boundary | Color 기반 fill, Phase 5 |
| 대중교통 | Route Centerline | Color/Transport별 line, Phase 5 |
| 시설·정류장·설비 | POI Location | circle 우선, 아이콘은 후속 |

기본 순서는 배경 → 용도지역 → 건물 → 교통망 면 → 중심선 → 노선 → 경계 → POI → 선택 강조로 시작해 겹침을 검증한다. 터널·고가는 `Form`으로 구분하고 `Elevation`을 건물 높이나 다리 높이로 해석하지 않는다. 미지의 분류에는 기본 스타일을 준다.

물·지형을 추가할 경우 GeoTIFF의 CRS·범위·NoData를 확인한 뒤 지리 참조 이미지나 래스터 타일로 준비해야 한다. GeoJSON source에 직접 넣지 않는다. 항로를 수면으로 대체하지 않는다. 래스터 처리는 Phase 6까지의 필수 완료 조건에서 제외한다.

## 6. 기능별 계획

### 상세 조회

- 건물: 이름, 주소, Asset, Category, Zoning, Resident, Employee.
- 도로: 이름, Asset, Category, Lane, Limit, Direction, Form. 없는 길이·폭·교통량은 표시하지 않는다.
- 노선: Name, Transport, Color, Length, Passenger, Stop, Usage, Vehicle 등 실제 값.
- 이름 없는 객체는 종류와 앱 내부 ID로 구분한다. 내부 ID를 게임 ID로 표시하지 않는다.
- 표시 중인 대화형 레이어만 클릭 후보로 삼는다. 겹친 객체의 우선순위와 선 클릭 허용 폭을 정한다. 빈 공간 클릭, 레이어 숨김, 데이터 교체 시 선택을 정리한다.

### 검색

건물·도로·POI·노선의 `Name`과 주소를 대상으로 한글 부분 문자열 검색을 제공한다. trim, Unicode 정규화, 영문 대소문자 처리를 적용한다. 결과에 객체 종류·주소를 표시하고 동일 이름 구간을 임의로 합치지 않는다. 행정구역 검색은 District가 있을 때 활성화한다.

검색 대상 소스를 캐시하며 아직 로드하지 않은 소스가 있으면 검색 준비 상태를 표시한다. 일부 소스의 검색 결과를 전체 결과처럼 보여주지 않는다. 결과 선택 시 레이어를 보이게 하고 Polygon/LineString은 bounds, Point는 중심으로 이동하여 상세 패널을 연다.

## 7. 개발 Phase와 완료 조건

### Phase 0 — 데이터 계약과 좌표 검증

원본 확보와 JSON 구조·속성·건수 검토는 완료했다. 시각적인 정합성 검증과 앱용 준비 절차는 구현 착수 후 수행한다.

작업: 데이터 계약 확정, Carto 좌표 설정/QGIS 대조, 데이터 준비 명령과 manifest 구현.

완료 조건: 원본을 보존하면서 앱용 파일을 재현 가능하게 준비하고 필수 파일 검증 결과·bounds·데이터셋 식별자를 확인할 수 있다. 추가 좌표 변환 필요 여부를 근거로 결정한다.

### Phase 1 — 지도 프로토타입

React + TypeScript + Vite와 MapLibre를 연결한다. 건물 source 하나부터 표시한 뒤 Network 중심선에서 Road를 추가한다. 배경, fitBounds, 이동/줌, 로드 오류 화면을 만든다.

완료 조건: `localhost:3000`에서 건물 186개와 도로 구간 388개를 대상으로 탐색할 수 있고 방향·상대 위치가 비교 화면과 일치한다. 외부 API 키가 필요 없다. 이 단계가 첫 렌더링 마일스톤이며 검색은 요구하지 않는다.

### Phase 2 — 레이어 시스템

Source와 style layer를 분리하고 UI 그룹 단위로 토글한다. 철도·보행로·항로를 구분하고 맵 타일은 기본 숨김으로 둔다. 선택 소스의 지연 로딩과 empty/error 상태를 연결한다.

완료 조건: 토글이 관련 style layer 전체에 적용되고 다른 그룹을 깨뜨리지 않는다. 없는 District를 존재하는 레이어처럼 표시하지 않는다.

### Phase 3 — 객체 Interaction / MVP 완료

스냅샷 내 ID, 클릭 후보 선택, 강조, 상세 패널을 구현한다. 실제 필드만 표시하고 누락과 0을 구분한다.

Google Maps UI와 최대한 유사하게 구현한다. 각 건물을 클릭하면 사이드바에서 건물의 이름 및 주소 (게임 기본값으로는 이름에 주소가 포함됨)가 표시된다. 추후 기능 확장을 염두에 두어 추가 정보 (가상의 광고, 가상의 평점 목록, 가상의 인기 시간대 등)를 넣을 공간을 확보해 둔다.

지도, 사이드바 컴포넌트를 분리하여 코드를 구현한다.

### Phase 4 — 검색

이름·주소 검색, 중복 이름 구분, 결과 이동과 선택을 연결한다.

완료 조건: 실제 한글 이름·주소로 검색하고 결과 없음·이름 없음·동일 이름 복수 결과를 처리한다. 검색 대상 로딩 상태가 분명하다.

지도, 사이드바, 검색 컴포넌트를 분리하여 코드를 구현한다.

### Phase 5 — 대중교통 시스템 표시

도로 교통(버스), 기차, 전차(트램), 지하철, 물(선박), 페리, 공기(항공) 데이터를 지도에서 볼 수 있도록 한다.

버스, 기차, 전차, 지하철, 물, 페리 노선을 표시하며, 각각 레이어에서 표시 여부를 선택할 수 있도록 한다. 항공은 정류장·시설만 표시한다.

구현 내용:

- 교통수단별 노선 색상과 정류장·시설 마커를 표시하고, 노선·POI 클릭 시 상세 정보를 연다.
- 노선 선택 시 해당 노선과 인근 정류장만 표시한다. 정류장 목록은 같은 이름·주소를 중복 제거하고 노선 선형을 따른 추정 순서로 나열하며, 항목 클릭 시 지도가 정류장으로 이동한다.
- 분류가 `Public, Transportation`인 건물을 선택하면 인근 정류장을 기준으로 연결 노선 후보를 지도와 상세 패널에 표시한다.
- Export에 노선·정류장·건물 간 연결 ID와 정차 순서가 없어, 연결과 순서는 위치 기반 추정임을 안내한다.

### phase 6 - 길찾기

Google Maps와 유사한 길찾기 기능을 추가한다. 출발지와 목적지를 입력하면, 가장 빠를 것으로 예상되는 추천 경로 2개(대중교통 이용 경로, 차량 이용 경로)를 표시한다. 출발지와 목적지 입력에는 기존 검색 기능을 가져다 쓰고, 추천 경로 중 대중교통 이용 경로는 기존 대중교통 시스템 기능을 이용하여 구현하도록 한다.

## 8. 검증 계획과 남은 확인 사항

구현 후 다음을 검증한다.

- 데이터: Feature 수, Object별 분포, geometry/bounds, 누락 값, 복합 분류, ID 고유성, 통계 중복 방지.
- 지도: 건물·도로 정렬, 초기 화면/전체 보기, 토글, 좁은 도로 클릭, 선택 해제, 한글, 창 크기 변경.
- 장애: 파일 누락, 잘못된 JSON, 빈 FeatureCollection, 선택 소스 실패의 구분.
- 성능: 실제 PC에서 초기 약 4.43 MiB와 전체 약 13.71 MiB 데이터의 로딩·팬/줌·메모리 측정. 중복 fetch와 지도 재생성 확인.
- 개발 검증: 타입 검사, 프로덕션 빌드, 로컬 preview의 데이터 경로 확인. 분류·통계는 작은 실제 데이터 fixture로 회귀 검증.

남은 확인 사항은 Export 당시 Carto 버전·좌표 설정·게임 시각, 게임/QGIS와의 정합성, 향후 추가 속성이다. JSON에 없는 메타데이터를 추측해 채우지 않는다. 추가 속성이나 GeoTIFF 처리를 기본 도로·건물 MVP의 선행 조건으로 삼지 않는다.
