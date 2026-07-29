import SignalGrid from './SignalGrid'

/*
  Opportunity Radar — cut over to the provenance/convergence model.

  The additive scoring (formerly src/radar/model.ts, 6×5=30) and the 12 mock
  opportunities have been removed. The app now renders the Signal grid over
  real, cited signals from signal-model/ — currently the one confirmed building
  (38–48 Southwark Bridge Road). More buildings appear as the puller lands them;
  until then the grid is honestly sparse.
*/
export default function RadarApp() {
  return <SignalGrid />
}
