# Chrome DevTools MCP 성능 측정

SKILL.md의 기준 상태 수집 및 최종 성능 검증에서 읽는다. 프로젝트 설정이 latest 서버를 사용하므로 아래 이름은 현재 제공된 도구 기준이다. 실행 시 스키마가 다르면 실제 스키마를 따른다.

## 조건과 측정 범위

- 전/후의 데이터셋 ID, URL, 언어, viewport/DPR, 브라우저, dev/배포 모드, 캐시 조건, CPU/네트워크 throttling, 입력과 지도 위치/줌을 맞춘다. 조건이 달라지면 직접 비교하지 않는다.
- 초기 로드와 이미 데이터가 준비된 뒤의 검색/레이어 토글/길찾기 등 상호작용을 별도 시나리오로 측정한다. 첫 실행의 캐시/worker/초기화 비용과 이후 실행을 섞지 않는다.
- 변경이 작으면 로딩/리소스 메트릭 및 동작 관측으로 시작한다. 성능 영향이 있는 변경은 trace를 추가한다. 성능 수치로 결론을 낼 때는 같은 조건으로 가능하면 3회 측정해 중앙값과 변동 범위를 기록한다. 임의의 절대 통과 기준을 새로 만들지 말고 요청/프로젝트의 성능 예산과 기준 상태를 사용한다.

## 가벼운 로딩/리소스 관측

evaluate_script에 아래 읽기 함수를 전달할 수 있다. 결과를 특정 변경과 관련된 리소스 위주로 해석한다. 리소스가 많으면 필요한 종류/경로를 확인한 뒤 필터를 좁힌다.

```javascript
() => {
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    timeOrigin: performance.timeOrigin,
    navigation: nav ? {
      ttfbMs: nav.responseStart - nav.requestStart,
      domContentLoadedMs: nav.domContentLoadedEventEnd || null,
      loadMs: nav.loadEventEnd || null,
      transferBytes: nav.transferSize,
    } : null,
    paint: performance.getEntriesByType('paint').map(e => ({
      name: e.name, startMs: e.startTime,
    })),
    supportedEntryTypes: typeof PerformanceObserver === 'undefined'
      ? [] : PerformanceObserver.supportedEntryTypes,
    resources: performance.getEntriesByType('resource')
      .filter(e => new URL(e.name).origin === location.origin)
      .map(e => ({
        path: new URL(e.name).pathname,
        type: e.initiatorType,
        durationMs: e.duration,
        transferBytes: e.transferSize,
        decodedBytes: e.decodedBodySize,
      })),
  };
}
```

loadMs가 null이면 해당 이벤트가 아직 끝나지 않은 것이다. TTFB는 위 정의의 요청 시작부터 첫 응답 바이트까지이며, 서버 처리 시간만을 뜻하지 않는다. transferSize가 0인 항목은 캐시/관측 제한 등을 조사하고 무조건 0바이트 다운로드로 해석하지 않는다. navigation/paint 시점은 **지도 데이터와 WebGL 렌더링 완료 시점이 아니다**. 지도 준비는 화면·데이터 상태와 별도로 확인한다. 리소스 타이밍 버퍼나 권한 제한으로 누락된 항목은 네트워크 도구를 보조로 사용한다.

## Trace와 insight

현재 도구의 모든 대상 페이지 호출에는 list_pages/new_page에서 확인한 pageId를 전달한다. 버전별로 페이지 선택 방식이 달라질 수 있으므로 스키마를 먼저 확인한다.

### 초기 로드

1. navigate_page로 측정 대상 URL에 먼저 이동한다.
2. performance_start_trace에서 reload: true, autoStop: true를 사용해 로드를 기록한다. 도구의 종료/요약 결과를 확인한다. autoStop이 실제 지도 준비 이전에 끝났다면 초기 로드 측정의 한계를 기록하고, 지도 준비를 포함하는 별도 수동 trace를 수행한다.
3. 제공된 insightSetId와 insightName만 performance_analyze_insight에 사용한다. 긴 JS 작업, 요청 지연, 레이아웃 변화 등 변경에 관련된 insight를 읽고 코드/네트워크 증거와 연결한다.

### 검색·레이어·길찾기 등 상호작용

1. 기준 상태로 초기화하고 데이터 준비를 확인한다.
2. performance_start_trace에서 reload: false, autoStop: false로 기록을 시작한다.
3. MCP 입력 도구로 정해진 동작을 수행하고 결과 DOM/지도 상태를 확인한다.
4. performance_stop_trace로 종료하고 요약/insight를 확인한다. 실패해도 활성 trace를 종료한 뒤 재시도한다. trace 기록 중 별도의 audit/중복 trace를 실행하지 않는다.

결과 trace는 필요할 때 artifacts/browser/ 아래 filePath로 저장한다. 주요 긴 작업의 길이/빈도, 로딩 요청, 렌더링/레이아웃 비용, 제공되는 LCP/CLS/상호작용 관련 값을 시나리오와 함께 보고한다. 도구가 제공하지 않은 값은 추정해 채우지 않는다.

## 지표별 해석과 추가 진단

| 지표/도구 | 해석과 한계 |
| --- | --- |
| LCP | 로딩 trace가 실제 제공한 값을 사용한다. canvas 지도 준비 시간과 동일시하지 않는다. |
| CLS | 측정 구간의 레이아웃 이동을 확인한다. 지도 카메라 이동 자체를 DOM 레이아웃 이동으로 해석하지 않는다. |
| INP/상호작용 | 실제 입력이 포함되고 도구가 지원하는 경우에만 값을 보고한다. 입력이 없거나 결과에 없으면 미측정이다. 단일 클릭 지연을 세션/실사용자 INP라고 부르지 않는다. |
| 긴 작업/CPU | trace의 실제 main-thread 작업과 병목을 확인한다. 짧은 구간의 값만으로 전체 세션 성능을 결론 내리지 않는다. |
| 메모리 | 누수 의심 또는 메모리 작업일 때 take_heapsnapshot 등 지원되는 도구를 사용한다. 동일 조건에서 반복 동작과 해제 후 retained 객체를 조사한다. 한 번의 heap 크기 증가를 누수라고 단정하지 않는다. |
| Lighthouse | 현재 lighthouse_audit는 접근성/SEO/best practices 등이며 **performance 점수를 제공하지 않는다**. 해당 품질 검토가 필요할 때만 실행하고 성능은 trace로 확인한다. |

PerformanceObserver를 추가로 사용할 경우 supportedEntryTypes를 먼저 확인한다. 초기 로드부터 필요한 계측은 지원되는 navigate_page의 initScript로 다음 탐색 전에 등록하고, 해당 페이지의 계측으로만 제한한다. 관측 시점/구간, buffered 여부 및 미지원 항목을 기록한다. 리로드 후 observer가 유지된다고 가정하지 말고 재등록 여부를 확인한다. 계측이 끝나면 observer를 disconnect하고 전역 변수/임시 코드를 정리한다.

FPS, worker CPU, GPU 메모리 등 지원되지 않는 값은 없는 것으로 보고한다. 별도 계측이나 진단 API가 필요하면 실제로 검증 가능한 방법을 선택하고 그 한계를 명시한다. 실험실 trace의 값을 실사용자 백분위 수치로 보고하지 않는다.

## 결과 기록

시나리오별로 환경과 기준값 → 변경 후 값 → 해석을 기록한다. 편차/조건 차이 때문에 결론을 내릴 수 없으면 그대로 명시한다. 성능 회귀가 보이면 요청된 기능에 필요한 비용인지, 불필요한 재렌더/계산/요청인지 조사하고 수정 후 같은 시나리오만 다시 측정한다. 개발 서버의 결과는 개발 모드 비교로, session/snapshot 계약을 갖춘 배포 빌드의 결과는 그 환경의 결과로 표시한다.
