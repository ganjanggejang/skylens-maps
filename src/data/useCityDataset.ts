import { useCallback, useState } from 'react'
import { createDatasetLoader, initialSourceStates } from './dataset-loader'

export function useCityDataset() {
  const [sourceStates, setSourceStates] = useState(initialSourceStates)
  // A fresh loader per map lifetime also isolates StrictMode's setup/cleanup replay.
  const createLoader = useCallback(() => createDatasetLoader((key, state) => {
    setSourceStates(previous => ({ ...previous, [key]: state }))
  }), [])
  return { sourceStates, createLoader }
}
