import { useCallback, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { PlaceEntry } from '../data/place'
import type { DirectionPlace } from './directions-model'
import type { RouteOutcome, TransitOutcome } from './types'
import { ROUTING_CONFIG } from './config'
import { createRoutingWorker, type RoutingWorker } from './worker-client'

export function useDirections() {
  const routingWorkerRef = useRef<RoutingWorker | null>(null)
  const routingRequestRef = useRef(0)
  const datasetIdRef = useRef('')
  const transitReadyRef = useRef(false)
  const transitFailedRef = useRef(false)
  const transitDataRef = useRef<{ poi?: FeatureCollection<Point>; route?: FeatureCollection<LineString> }>({})
  const transitPendingRef = useRef<{ requestId: number; origin: PlaceEntry['geometry']; destination: PlaceEntry['geometry'] } | null>(null)
  const [directionsOrigin, setDirectionsOrigin] = useState<DirectionPlace | null>(null)
  const [directionsDestination, setDirectionsDestination] = useState<DirectionPlace | null>(null)
  const [directionsOutcome, setDirectionsOutcome] = useState<RouteOutcome | null>(null)
  const [transitOutcome, setTransitOutcome] = useState<TransitOutcome | null>(null)
  const [selectedDirectionsMode, setSelectedDirectionsMode] = useState<'vehicle' | 'transit'>('vehicle')
  const [transitStatus, setTransitStatus] = useState<'loading' | 'calculating' | 'ready' | 'error'>('loading')
  const [transitError, setTransitError] = useState('')
  const [directionsCalculating, setDirectionsCalculating] = useState(false)
  const [directionsError, setDirectionsError] = useState('')
  const [routingReady, setRoutingReady] = useState(false)
  function setDirectionPlace(side: 'origin' | 'destination', place: DirectionPlace | null) {
    routingRequestRef.current++
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    transitPendingRef.current = null
    setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
    setDirectionsCalculating(false)
    setDirectionsError('')
    if (side === 'origin') setDirectionsOrigin(place)
    else setDirectionsDestination(place)
  }

  function requestDirections(originPlace: DirectionPlace | null, destinationPlace: DirectionPlace | null) {
    if (!originPlace || !destinationPlace || !routingReady || !routingWorkerRef.current) {
      setDirectionsError('도로 데이터가 아직 준비되지 않았습니다.')
      return
    }
    if (originPlace.entry.selection.id === destinationPlace.entry.selection.id) return
    const requestId = ++routingRequestRef.current
    const origin = originPlace.entry.geometry
    const destination = destinationPlace.entry.geometry
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    setTransitStatus(transitFailedRef.current ? 'error' : 'calculating')
    setSelectedDirectionsMode('vehicle')
    setDirectionsError('')
    setDirectionsCalculating(true)
    transitPendingRef.current = transitFailedRef.current ? null : { requestId, origin, destination }
    routingWorkerRef.current.postMessage({ type: 'route', requestId, datasetId: datasetIdRef.current,
      configVersion: ROUTING_CONFIG.version, origin, destination })
    if (transitReadyRef.current) requestTransit()
  }

  const requestTransit = useCallback(() => {
    const pending = transitPendingRef.current
    if (!pending || !transitReadyRef.current || !routingWorkerRef.current) return
    routingWorkerRef.current.postMessage({ type: 'route-transit', datasetId: datasetIdRef.current,
      configVersion: ROUTING_CONFIG.version, ...pending })
    transitPendingRef.current = null
  }, [])

  function calculateDirections() { requestDirections(directionsOrigin, directionsDestination) }

  const initializeRouting = useCallback((datasetId: string, network: FeatureCollection<LineString>) => {
    datasetIdRef.current = datasetId
    routingWorkerRef.current = createRoutingWorker(datasetId, network, message => {
      if (message.datasetId !== datasetIdRef.current) return
      if (message.type === 'ready') { setRoutingReady(true); return }
      if (message.type === 'transit-ready') {
        transitReadyRef.current = true
        setTransitStatus('ready')
        requestTransit()
        return
      }
      if (message.type === 'transit-error') {
        transitFailedRef.current = true
        transitPendingRef.current = null
        setTransitStatus('error')
        setTransitError(message.error ?? '대중교통 데이터를 준비하지 못했습니다.')
        return
      }
      if (!('requestId' in message) || message.requestId !== routingRequestRef.current) return
      if (message.type === 'transit-result') {
        if (message.error !== undefined) { setTransitStatus('error'); setTransitError(message.error) } else { setTransitOutcome(message.outcome); setTransitStatus('ready') }
        return
      }
      setDirectionsCalculating(false)
      if (message.type === 'result') setDirectionsOutcome(message.outcome)
      else setDirectionsError(message.error ?? '경로 계산 오류')
    }, () => {
      setDirectionsCalculating(false)
      setDirectionsError('경로 계산 작업자를 실행하지 못했습니다.')
      transitFailedRef.current = true
      setTransitStatus('error')
      setTransitError('대중교통 경로 계산 작업자를 실행하지 못했습니다.')
    })
  }, [requestTransit])

  const provideTransitData = useCallback((key: 'poi' | 'route', data: FeatureCollection<Point | LineString>) => {
    if (key === 'poi') transitDataRef.current.poi = data as FeatureCollection<Point>
    else transitDataRef.current.route = data as FeatureCollection<LineString>
    if (transitDataRef.current.poi && transitDataRef.current.route && routingWorkerRef.current) {
      routingWorkerRef.current.postMessage({ type: 'transit-data', datasetId: datasetIdRef.current,
        configVersion: ROUTING_CONFIG.version, pois: transitDataRef.current.poi, routes: transitDataRef.current.route })
    }
  }, [])

  const failTransitData = useCallback((key: 'poi' | 'route') => {
    transitFailedRef.current = true
    transitPendingRef.current = null
    setTransitStatus('error')
    setTransitError(`${key === 'poi' ? '정류장' : '노선'} 데이터를 불러오지 못했습니다.`)
  }, [])

  const resetDirections = useCallback(() => {
    routingRequestRef.current++
    transitPendingRef.current = null
    setDirectionsCalculating(false)
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
  }, [])

  function swapDirections() {
    routingRequestRef.current++
    transitPendingRef.current = null
    setDirectionsOrigin(directionsDestination)
    setDirectionsDestination(directionsOrigin)
    setDirectionsOutcome(null)
    setTransitOutcome(null)
    setTransitStatus(transitFailedRef.current ? 'error' : transitReadyRef.current ? 'ready' : 'loading')
    setDirectionsCalculating(false)
    if (directionsOrigin && directionsDestination) requestDirections(directionsDestination, directionsOrigin)
  }

  const disposeRouting = useCallback(() => {
    datasetIdRef.current = ''
    routingRequestRef.current++
    routingWorkerRef.current?.terminate()
    routingWorkerRef.current = null
    transitReadyRef.current = false
    transitFailedRef.current = false
    transitDataRef.current = {}
    transitPendingRef.current = null
  }, [])

  const lifecycle = useMemo(() => ({
    initializeRouting, provideTransitData, failTransitData, disposeRouting, resetDirections,
  }),
  [initializeRouting, provideTransitData, failTransitData, disposeRouting, resetDirections])

  return { lifecycle, directionsOrigin, directionsDestination, directionsOutcome, transitOutcome,
    selectedDirectionsMode,
    transitStatus, transitError, directionsCalculating, directionsError, routingReady, setSelectedDirectionsMode,
    setDirectionPlace, calculateDirections, swapDirections, resetDirections, initializeRouting,
    provideTransitData, failTransitData, disposeRouting }
}
