# CS2 City Map

Cities: Skylines II의 Carto GeoJSON을 `localhost:3000`에서 보는 지도 프로토타입입니다. 현재 Phase 2까지 구현했습니다. React, TypeScript, Vite, MapLibre GL JS를 사용합니다. 외부 배경지도나 API 키는 필요하지 않습니다.

## 실행

Node.js 20.19 이상과 `exported_files/GeoJSON/Building_Boundary.json`, `Network_Centerline.json`이 필요합니다. `Area_Boundary.json`과 `exported_files/GeoTIFF/Depth.tif`는 선택 파일입니다.

```powershell
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. 포트 3000이 이미 사용 중이면 다른 포트로 넘어가지 않고 오류가 납니다.

`npm run dev`와 `npm run build`는 실행 전에 `npm run prepare:data`를 호출합니다. 이 명령은 건물·중심선·선택적 Area 원본의 구조와 좌표를 검사한 뒤 `public/data/`로 복사하고, 파일별 건수·범위·해시·Object 분포를 `manifest.json`에 기록합니다. `Depth.tif`가 있으면 좌표계와 NoData를 확인하고 투명한 `water-mask.png`를 생성합니다. Area나 수심 파일이 없거나 잘못된 경우에도 기본 지도는 실행되며, 해당 레이어에는 오류를 표시합니다. 원본 파일은 수정하지 않으며 생성한 데이터는 Git에서 제외합니다. 프로덕션 빌드는 `npm run build`, 빌드 결과 확인은 `npm run preview`로 실행합니다.

지도는 건물 전체에 맞춰 시작합니다. 마우스 또는 터치로 이동·확대할 수 있고 **도심 보기**와 **전체 보기**로 범위를 바꿀 수 있습니다. 전체 지도 크기에 맞춰 축소 한계와 이동 범위가 설정됩니다. 연한 회색은 육지, 파란색은 수심 데이터가 있는 수역입니다. 수역은 바다와 강을 따로 분류하지 않습니다. 수역·건물·도로·철도는 항상 표시합니다. 레이어 목록에서는 보행로·항로와 데이터가 있을 때의 행정구역을 켜고 끌 수 있습니다. 현재 Export에는 District가 없어 행정구역은 데이터 없음으로 표시됩니다.

좌표는 Carto Export 값을 경도·위도 순서로 그대로 사용합니다. 게임 또는 QGIS 화면과 방향·정합성을 대조하는 작업은 아직 남아 있으며, 현 단계에서는 실측 거리나 위치 정확도를 보장하지 않습니다. 객체 상세·검색은 후속 Phase 범위입니다.
